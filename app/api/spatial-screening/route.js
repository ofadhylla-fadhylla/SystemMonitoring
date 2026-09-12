import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOREST_LAYER = 'https://geoportal.menlhk.go.id/server/rest/services/jsdgejawfvrdtasdt/KWS_HUTAN/MapServer/0/query';
const BIG_NATURAL_RESOURCES = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer';
const PEAT_LAYER = `${BIG_NATURAL_RESOURCES}/6/query`;
const PEAT_FUNCTION_LAYER = `${BIG_NATURAL_RESOURCES}/48/query`;
const BHUMI_WMS = 'https://bhumi.atrbpn.go.id/mapproxy/mapproxy/service';

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function withTimeout(ms = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(id) };
}

async function fetchJson(url, options = {}) {
  const timer = withTimeout(options.timeout || 12000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'user-agent': 'SystemMonitoring/8.17 spatial-screening',
        accept: 'application/json,text/plain,*/*',
        ...(options.headers || {}),
      },
      signal: timer.controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Response bukan JSON (${text.slice(0, 60) || 'empty'})`);
    }
  } finally {
    timer.clear();
  }
}

function pointQueryUrl(base, lat, lon) {
  const geometry = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
  const params = new URLSearchParams({
    f: 'json',
    geometry,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
  });
  return `${base}?${params}`;
}

function normalizedFeatures(payload) {
  return Array.isArray(payload?.features) ? payload.features : [];
}

function flattenAttributes(feature) {
  const attrs = feature?.attributes || feature?.properties || {};
  const pairs = Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  return {
    raw: attrs,
    text: pairs.map(([k, v]) => `${k}:${v}`).join(' | '),
    values: pairs.map(([, v]) => String(v).trim()),
  };
}

function pickUsefulAttributes(feature, max = 12) {
  const attrs = feature?.attributes || feature?.properties || {};
  const out = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || String(value).trim() === '') continue;
    if (Object.keys(out).length >= max) break;
    out[key] = value;
  }
  return out;
}

async function queryArcGisPoint(base, lat, lon, sourceLabel) {
  try {
    const payload = await fetchJson(pointQueryUrl(base, lat, lon));
    if (payload?.error) throw new Error(payload.error?.message || 'ArcGIS query error');
    const features = normalizedFeatures(payload);
    return {
      status: 'OK',
      source: sourceLabel,
      matched: features.length > 0,
      count: features.length,
      features: features.slice(0, 5).map((f) => pickUsefulAttributes(f)),
      error: null,
    };
  } catch (error) {
    return {
      status: 'UNAVAILABLE',
      source: sourceLabel,
      matched: null,
      count: 0,
      features: [],
      error: error?.name === 'AbortError' ? 'Source timeout' : (error?.message || 'Source unavailable'),
    };
  }
}

function lonLatTo3857(lon, lat) {
  const x = lon * 20037508.34 / 180;
  const capped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  let y = Math.log(Math.tan((90 + capped) * Math.PI / 360)) / (Math.PI / 180);
  y = y * 20037508.34 / 180;
  return [x, y];
}

function parseMaybeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function hasHguText(value) {
  const text = String(value || '').toUpperCase();
  return /(^|[^A-Z])HGU([^A-Z]|$)|HAK GUNA USAHA/.test(text);
}

function findHguEvidence(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const evidence = [];
  for (const feature of features) {
    const flat = flattenAttributes(feature);
    const text = flat.text.toUpperCase();
    if (hasHguText(text)) evidence.push(pickUsefulAttributes(feature, 16));
  }
  return { features, evidence };
}

async function queryBhumiHgu(lat, lon) {
  const [x, y] = lonLatTo3857(lon, lat);
  const half = 60;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetFeatureInfo',
    LAYERS: 'bhumi_persil',
    QUERY_LAYERS: 'bhumi_persil',
    SRS: 'EPSG:3857',
    BBOX: `${x - half},${y - half},${x + half},${y + half}`,
    WIDTH: '256',
    HEIGHT: '256',
    X: '128',
    Y: '128',
    FEATURE_COUNT: '20',
    INFO_FORMAT: 'application/json',
    FORMAT: 'image/png',
    STYLES: '',
    TRANSPARENT: 'TRUE',
  });

  const timer = withTimeout(12000);
  try {
    const response = await fetch(`${BHUMI_WMS}?${params}`, {
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 SystemMonitoring/8.17',
        accept: 'application/json,text/plain,*/*',
        referer: 'https://bhumi.atrbpn.go.id/',
      },
      signal: timer.controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = parseMaybeJson(text);
    if (!payload) throw new Error('BHUMI GetFeatureInfo tidak mengembalikan JSON');
    const { features, evidence } = findHguEvidence(payload);
    if (evidence.length) {
      return {
        status: 'OK',
        source: 'BHUMI ATR/BPN — bhumi_persil GetFeatureInfo',
        result: 'HGU_INDICATION',
        matched: true,
        evidence,
        returned_features: features.length,
        note: 'Indikasi HGU ditemukan pada atribut publik yang dikembalikan BHUMI. Tetap lakukan verifikasi dokumen/ATR-BPN untuk keputusan legal.',
      };
    }
    return {
      status: 'OK',
      source: 'BHUMI ATR/BPN — bhumi_persil GetFeatureInfo',
      result: features.length ? 'PARCEL_RETURNED_NO_HGU_LABEL' : 'NO_PUBLIC_FEATURE_RETURNED',
      matched: false,
      evidence: features.slice(0, 3).map((f) => pickUsefulAttributes(f, 12)),
      returned_features: features.length,
      note: 'Tidak ada label HGU yang teridentifikasi dari respons publik. Ini bukan bukti legal bahwa lokasi tidak memiliki/berada di HGU.',
    };
  } catch (error) {
    return {
      status: 'UNAVAILABLE',
      source: 'BHUMI ATR/BPN',
      result: 'AUTOMATIC_CHECK_UNAVAILABLE',
      matched: null,
      evidence: [],
      returned_features: 0,
      note: 'Pemeriksaan otomatis BHUMI tidak tersedia pada saat request. Jangan ditafsirkan sebagai tidak ada HGU.',
      error: error?.name === 'AbortError' ? 'Source timeout' : (error?.message || 'Source unavailable'),
    };
  } finally {
    timer.clear();
  }
}

function firstText(result) {
  if (!Array.isArray(result?.features) || !result.features.length) return '';
  return result.features.map((f) => Object.values(f).join(' ')).join(' | ');
}

function classifyForest(result) {
  if (result.status !== 'OK') return { class: 'UNKNOWN', label: 'Source unavailable', score: 0 };
  if (!result.matched) return { class: 'NO_MATCH', label: 'No forest-area polygon returned', score: 0 };
  const text = firstText(result).toUpperCase();
  if (/APL|AREA PENGGUNAAN LAIN/.test(text)) return { class: 'APL', label: 'Area Penggunaan Lain (APL)', score: 0 };
  if (/HUTAN LINDUNG|(^|\W)HL(\W|$)|KONSERVASI|KSA|KPA|TAMAN NASIONAL|CAGAR ALAM/.test(text)) return { class: 'PROTECTED_FOREST', label: 'Protected / conservation forest indication', score: 35 };
  if (/HPK|HUTAN PRODUKSI.*KONVERSI/.test(text)) return { class: 'HPK', label: 'Hutan Produksi yang dapat Dikonversi (HPK)', score: 25 };
  if (/HPT|HUTAN PRODUKSI TERBATAS/.test(text)) return { class: 'HPT', label: 'Hutan Produksi Terbatas (HPT)', score: 30 };
  if (/HUTAN PRODUKSI|(^|\W)HP(\W|$)/.test(text)) return { class: 'HP', label: 'Hutan Produksi (HP)', score: 25 };
  return { class: 'FOREST_AREA', label: 'Forest-area polygon matched', score: 25 };
}

function classifyPeat(peat, peatFunction) {
  if (peat.status !== 'OK' && peatFunction.status !== 'OK') return { class: 'UNKNOWN', label: 'Source unavailable', score: 0 };
  const matched = peat.matched === true || peatFunction.matched === true;
  if (!matched) return { class: 'NO_MATCH', label: 'No peat polygon returned', score: 0 };
  const text = `${firstText(peat)} | ${firstText(peatFunction)}`.toUpperCase();
  if (/LINDUNG|PROTECT/.test(text)) return { class: 'PEAT_PROTECTION', label: 'Peat / protection-function indication', score: 25 };
  if (/BUDIDAYA|CULTIV/.test(text)) return { class: 'PEAT_CULTIVATION', label: 'Peat / cultivation-function indication', score: 12 };
  return { class: 'PEAT', label: 'Peat indication', score: 15 };
}

function classifyHgu(hgu, claimedLandStatus) {
  const claim = String(claimedLandStatus || 'Unknown').toUpperCase();
  if (hgu.status !== 'OK') return { class: 'UNKNOWN', label: 'Automatic HGU check unavailable', score: 0 };
  if (hgu.result === 'HGU_INDICATION') {
    if (claim === 'HGU') return { class: 'CONSISTENT_HGU', label: 'Claimed HGU + BHUMI HGU indication', score: 0 };
    if (['SHM', 'SHGB', 'GIRIK/LETTER C', 'CUSTOMARY/ADAT'].includes(claim)) return { class: 'LAND_TENURE_CONFLICT', label: `${claim} claim + HGU indication at coordinate`, score: 35 };
    if (['NO DOCUMENT', 'UNKNOWN', ''].includes(claim)) return { class: 'HGU_UNVERIFIED_CLAIM', label: 'HGU indication with no verified supplier land claim', score: 30 };
    return { class: 'HGU_REVIEW', label: 'HGU indication requires tenure review', score: 30 };
  }
  if (claim === 'HGU') return { class: 'HGU_NOT_CONFIRMED', label: 'Supplier claims HGU, but public automatic response did not confirm an HGU label', score: 20 };
  return { class: 'NO_HGU_PUBLIC_INDICATION', label: 'No HGU label identified in public automatic response', score: 0 };
}

function overallLevel(score) {
  if (score >= 70) return 'Critical';
  if (score >= 40) return 'High';
  if (score >= 20) return 'Medium';
  return 'Low';
}

function buildRisk({ hgu, peat, peatFunction, forest, claimedLandStatus }) {
  const hguRisk = classifyHgu(hgu, claimedLandStatus);
  const peatRisk = classifyPeat(peat, peatFunction);
  const forestRisk = classifyForest(forest);
  const score = Math.min(100, hguRisk.score + peatRisk.score + forestRisk.score);
  const level = overallLevel(score);
  const sourceAvailability = [hgu.status, peat.status, peatFunction.status, forest.status];
  const availableCount = sourceAvailability.filter((x) => x === 'OK').length;
  const confidence = availableCount === 4 ? 'High' : availableCount >= 2 ? 'Medium' : 'Low';
  const drivers = [];
  if (hguRisk.score) drivers.push(`Land tenure / HGU: ${hguRisk.label} (+${hguRisk.score})`);
  if (peatRisk.score) drivers.push(`Peat: ${peatRisk.label} (+${peatRisk.score})`);
  if (forestRisk.score) drivers.push(`Forest area: ${forestRisk.label} (+${forestRisk.score})`);
  if (!drivers.length) drivers.push('Tidak ada risk driver positif yang terdeteksi dari sumber yang berhasil diperiksa.');
  const recommendation = level === 'Critical'
    ? 'Hold onboarding/sourcing sampai temuan spasial dan legal diverifikasi melalui dokumen resmi dan verifikasi lapangan bila diperlukan.'
    : level === 'High'
      ? 'Lakukan enhanced due diligence: verifikasi status hak, overlay resmi, dan bukti penguasaan lahan sebelum approval.'
      : level === 'Medium'
        ? 'Lakukan klarifikasi dokumen dan verifikasi spasial tambahan sebelum keputusan sourcing.'
        : 'Lanjutkan due diligence normal. Tetap simpan bukti dokumen dan ulangi screening bila data sumber diperbarui.';
  return { score, level, confidence, drivers, recommendation, components: { hgu: hguRisk, peat: peatRisk, forest: forestRisk } };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const lat = finiteNumber(body?.latitude);
    const lon = finiteNumber(body?.longitude);
    if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json({ error: 'Latitude / longitude tidak valid.' }, { status: 400 });
    }

    const [hgu, peat, peatFunction, forest] = await Promise.all([
      queryBhumiHgu(lat, lon),
      queryArcGisPoint(PEAT_LAYER, lat, lon, 'BIG Satu Peta — Peta Lahan Gambut'),
      queryArcGisPoint(PEAT_FUNCTION_LAYER, lat, lon, 'BIG Satu Peta — Fungsi Ekosistem Gambut'),
      queryArcGisPoint(FOREST_LAYER, lat, lon, 'Geoportal Kementerian Kehutanan — Kawasan Hutan'),
    ]);

    const risk = buildRisk({
      hgu,
      peat,
      peatFunction,
      forest,
      claimedLandStatus: body?.claimed_land_status || 'Unknown',
    });

    return NextResponse.json({
      checked_at: new Date().toISOString(),
      coordinate: { latitude: lat, longitude: lon },
      supplier_name: body?.supplier_name || null,
      claimed_land_status: body?.claimed_land_status || 'Unknown',
      results: { hgu, peat, peat_function: peatFunction, forest },
      risk,
      source_links: {
        bhumi: 'https://bhumi.atrbpn.go.id/',
        atlas: 'https://atlas.atrbpn.go.id/',
        forest: 'https://geoportal.menlhk.go.id/',
        big_one_map: 'https://tanahair.indonesia.go.id/portal-web',
      },
      disclaimer: 'Hasil ini adalah screening spasial, bukan penetapan legal. BHUMI/ATLAS dan geoportal dapat berubah atau tidak tersedia. Verifikasi legal final tetap melalui dokumen dan layanan resmi instansi berwenang.',
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Gagal menjalankan spatial screening.' }, { status: 500 });
  }
}
