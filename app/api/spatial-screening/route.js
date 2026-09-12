import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Official/public services used for screening.
const FOREST_PRIMARY_LAYER = 'https://geoportal.menlhk.go.id/server/rest/services/jsdgejawfvrdtasdt/KWS_HUTAN/MapServer/0';
const FOREST_PRIMARY_MAP = 'https://geoportal.menlhk.go.id/server/rest/services/jsdgejawfvrdtasdt/KWS_HUTAN/MapServer';
const FOREST_FALLBACK_MAP = 'https://geoportal.menlhk.go.id/server/rest/services/SIGAP_Interaktif/Kawasan_Hutan/MapServer';

const BIG_NATURAL_RESOURCES = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer';
const PEAT_LAYER = `${BIG_NATURAL_RESOURCES}/6`;
const PEAT_FUNCTION_LAYER = `${BIG_NATURAL_RESOURCES}/48`;
const KHG_LAYER = `${BIG_NATURAL_RESOURCES}/37`;

const BHUMI_WMS = 'https://bhumi.atrbpn.go.id/mapproxy/mapproxy/service';

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function withTimeout(ms = 18000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(id) };
}

async function fetchText(url, options = {}) {
  const timer = withTimeout(options.timeout || 18000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SystemMonitoring/8.18; +supplier-spatial-screening)',
        accept: options.accept || 'application/json,text/plain,text/html,application/xml,text/xml,*/*',
        ...(options.headers || {}),
      },
      body: options.body,
      signal: timer.controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    return { text, contentType: response.headers.get('content-type') || '', status: response.status };
  } finally {
    timer.clear();
  }
}

function parseMaybeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function cleanHtml(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function lonLatTo3857(lon, lat) {
  const x = lon * 20037508.34 / 180;
  const capped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  let y = Math.log(Math.tan((90 + capped) * Math.PI / 360)) / (Math.PI / 180);
  y = y * 20037508.34 / 180;
  return [x, y];
}

function pointQueryParams(lat, lon) {
  return new URLSearchParams({
    f: 'json',
    where: '1=1',
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
    resultRecordCount: '10',
  });
}

function normalizeArcFeatures(payload) {
  if (Array.isArray(payload?.features)) return payload.features;
  if (Array.isArray(payload?.results)) {
    return payload.results.map((x) => ({ attributes: x.attributes || x.value || {}, layerName: x.layerName, layerId: x.layerId }));
  }
  return [];
}

function pickUsefulAttributes(feature, max = 16) {
  const attrs = feature?.attributes || feature?.properties || {};
  const out = {};
  if (feature?.layerName) out._layer_name = feature.layerName;
  if (feature?.layerId !== undefined) out._layer_id = feature.layerId;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || String(value).trim() === '') continue;
    if (Object.keys(out).length >= max) break;
    out[key] = value;
  }
  return out;
}

function stringifyFeature(feature) {
  return Object.entries(feature || {}).map(([k, v]) => `${k}:${v}`).join(' | ');
}

function compactError(error) {
  if (!error) return 'Unknown error';
  if (error?.name === 'AbortError') return 'Source timeout';
  return String(error?.message || error).slice(0, 300);
}

async function queryArcGisLayerRobust(layerUrl, mapServerUrl, layerId, lat, lon, sourceLabel) {
  const attempts = [];

  // Attempt 1: layer GET query.
  try {
    const url = `${layerUrl}/query?${pointQueryParams(lat, lon)}`;
    const { text } = await fetchText(url, { timeout: 18000, accept: 'application/json,*/*' });
    const payload = parseMaybeJson(text);
    if (!payload) throw new Error(`Non-JSON response: ${text.slice(0, 100)}`);
    if (payload?.error) throw new Error(payload.error?.message || 'ArcGIS query error');
    const features = normalizeArcFeatures(payload);
    return {
      status: 'OK', source: sourceLabel, method: 'query-get', matched: features.length > 0,
      count: features.length, features: features.slice(0, 8).map((f) => pickUsefulAttributes(f)),
      diagnostics: attempts, error: null,
    };
  } catch (error) { attempts.push(`query-get: ${compactError(error)}`); }

  // Attempt 2: layer POST query. Some ArcGIS servers behave better with POST.
  try {
    const body = pointQueryParams(lat, lon).toString();
    const { text } = await fetchText(`${layerUrl}/query`, {
      method: 'POST', timeout: 18000, accept: 'application/json,*/*',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body,
    });
    const payload = parseMaybeJson(text);
    if (!payload) throw new Error(`Non-JSON response: ${text.slice(0, 100)}`);
    if (payload?.error) throw new Error(payload.error?.message || 'ArcGIS POST query error');
    const features = normalizeArcFeatures(payload);
    return {
      status: 'OK', source: sourceLabel, method: 'query-post', matched: features.length > 0,
      count: features.length, features: features.slice(0, 8).map((f) => pickUsefulAttributes(f)),
      diagnostics: attempts, error: null,
    };
  } catch (error) { attempts.push(`query-post: ${compactError(error)}`); }

  // Attempt 3: MapServer Identify. Useful for tiled/dynamic MapServer services.
  try {
    const [x, y] = lonLatTo3857(lon, lat);
    const pad = 1500;
    const params = new URLSearchParams({
      f: 'json',
      geometry: JSON.stringify({ x, y, spatialReference: { wkid: 3857 } }),
      geometryType: 'esriGeometryPoint',
      sr: '3857',
      tolerance: '3',
      mapExtent: `${x - pad},${y - pad},${x + pad},${y + pad}`,
      imageDisplay: '800,800,96',
      returnGeometry: 'false',
      layers: layerId === null || layerId === undefined ? 'all' : `all:${layerId}`,
    });
    const { text } = await fetchText(`${mapServerUrl}/identify?${params}`, { timeout: 18000, accept: 'application/json,*/*' });
    const payload = parseMaybeJson(text);
    if (!payload) throw new Error(`Non-JSON identify response: ${text.slice(0, 100)}`);
    if (payload?.error) throw new Error(payload.error?.message || 'ArcGIS identify error');
    const features = normalizeArcFeatures(payload);
    return {
      status: 'OK', source: sourceLabel, method: 'map-identify', matched: features.length > 0,
      count: features.length, features: features.slice(0, 8).map((f) => pickUsefulAttributes(f)),
      diagnostics: attempts, error: null,
    };
  } catch (error) { attempts.push(`map-identify: ${compactError(error)}`); }

  return {
    status: 'UNAVAILABLE', source: sourceLabel, method: null, matched: null, count: 0, features: [],
    diagnostics: attempts, error: attempts.join(' | '),
  };
}

async function queryForest(lat, lon) {
  const primary = await queryArcGisLayerRobust(
    FOREST_PRIMARY_LAYER, FOREST_PRIMARY_MAP, 0, lat, lon,
    'Kementerian Kehutanan — KWSHUTAN_AR_250K_122025'
  );
  if (primary.status === 'OK') return primary;

  // Retry once because the geoportal can intermittently return gateway errors.
  await sleep(700);
  const retry = await queryArcGisLayerRobust(
    FOREST_PRIMARY_LAYER, FOREST_PRIMARY_MAP, 0, lat, lon,
    'Kementerian Kehutanan — KWSHUTAN_AR_250K_122025 (retry)'
  );
  if (retry.status === 'OK') return retry;

  // Fallback to the public SIGAP interactive forest MapServer using Identify.
  const fallback = await queryArcGisLayerRobust(
    `${FOREST_FALLBACK_MAP}/0`, FOREST_FALLBACK_MAP, null, lat, lon,
    'Kementerian Kehutanan — SIGAP Kawasan Hutan fallback'
  );
  if (fallback.status === 'OK') return fallback;

  return {
    ...primary,
    source: 'Kementerian Kehutanan — Kawasan Hutan',
    diagnostics: [...(primary.diagnostics || []), ...(retry.diagnostics || []), ...(fallback.diagnostics || [])],
    error: [primary.error, retry.error, fallback.error].filter(Boolean).join(' || '),
  };
}

function hasHguText(value) {
  const text = String(value || '').toUpperCase();
  return /(^|[^A-Z])HGU([^A-Z]|$)|HAK\s+GUNA\s+USAHA/.test(text);
}

function hasParcelSignal(value) {
  const text = String(value || '').toUpperCase();
  return /NIB|PERSIL|BIDANG|HAK|SHM|HGB|HGU|HAK GUNA/.test(text);
}

async function queryBhumiFeatureInfoOnce(lat, lon, version, infoFormat) {
  const [x, y] = lonLatTo3857(lon, lat);
  const half = 90;
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: version, REQUEST: 'GetFeatureInfo',
    LAYERS: 'bhumi_persil', QUERY_LAYERS: 'bhumi_persil',
    CRS: version === '1.3.0' ? 'EPSG:3857' : undefined,
    SRS: version === '1.1.1' ? 'EPSG:3857' : undefined,
    BBOX: `${x - half},${y - half},${x + half},${y + half}`,
    WIDTH: '256', HEIGHT: '256',
    I: version === '1.3.0' ? '128' : undefined,
    J: version === '1.3.0' ? '128' : undefined,
    X: version === '1.1.1' ? '128' : undefined,
    Y: version === '1.1.1' ? '128' : undefined,
    FEATURE_COUNT: '20', INFO_FORMAT: infoFormat,
    FORMAT: 'image/png', STYLES: '', TRANSPARENT: 'TRUE',
  });
  // Remove undefined entries serialized by URLSearchParams.
  for (const [k, v] of [...params.entries()]) if (v === 'undefined') params.delete(k);

  const { text, contentType } = await fetchText(`${BHUMI_WMS}?${params}`, {
    timeout: 18000,
    headers: { referer: 'https://bhumi.atrbpn.go.id/' },
  });
  const payload = parseMaybeJson(text);
  if (payload) {
    const features = normalizeArcFeatures(payload);
    const compact = features.slice(0, 8).map((f) => pickUsefulAttributes(f, 20));
    const joined = compact.map(stringifyFeature).join(' | ');
    return { ok: true, kind: 'json', features: compact, text: joined, rawLength: text.length, contentType };
  }
  const cleaned = cleanHtml(text);
  if (/ServiceException|ExceptionReport|LayerNotQueryable/i.test(cleaned)) {
    throw new Error(cleaned.slice(0, 240));
  }
  // If the server returns useful text/GML/HTML, still inspect it.
  if (cleaned && (hasHguText(cleaned) || hasParcelSignal(cleaned))) {
    return { ok: true, kind: 'text', features: [], text: cleaned.slice(0, 3000), rawLength: text.length, contentType };
  }
  throw new Error(`No queryable feature payload (${contentType || 'unknown content type'})`);
}

async function queryBhumiHgu(lat, lon) {
  const attempts = [];
  const combos = [
    ['1.1.1', 'application/json'],
    ['1.3.0', 'application/json'],
    ['1.1.1', 'text/plain'],
    ['1.1.1', 'text/html'],
  ];

  for (const [version, infoFormat] of combos) {
    try {
      const result = await queryBhumiFeatureInfoOnce(lat, lon, version, infoFormat);
      const evidenceText = result.text || '';
      const hguFound = hasHguText(evidenceText);
      return {
        status: 'OK',
        source: `BHUMI ATR/BPN — bhumi_persil WMS ${version}`,
        method: `GetFeatureInfo ${infoFormat}`,
        result: hguFound ? 'HGU_INDICATION' : 'PARCEL_INFO_NO_HGU_LABEL',
        matched: hguFound,
        evidence: result.features?.length ? result.features : (evidenceText ? [{ response_excerpt: evidenceText.slice(0, 1200) }] : []),
        returned_features: result.features?.length || 0,
        note: hguFound
          ? 'Indikasi HGU ditemukan pada respons publik BHUMI. Verifikasi legal final tetap melalui dokumen/layanan resmi ATR/BPN.'
          : 'BHUMI merespons, tetapi tidak ditemukan label HGU pada respons yang dapat dibaca otomatis. Ini bukan bukti bahwa lokasi pasti bukan HGU.',
        diagnostics: attempts,
      };
    } catch (error) {
      attempts.push(`${version}/${infoFormat}: ${compactError(error)}`);
    }
  }

  return {
    status: 'UNAVAILABLE',
    source: 'BHUMI ATR/BPN',
    method: null,
    result: 'AUTOMATIC_CHECK_UNAVAILABLE',
    matched: null,
    evidence: [],
    returned_features: 0,
    note: 'Pemeriksaan HGU otomatis tidak berhasil mengambil atribut queryable dari BHUMI. Gunakan tombol Open BHUMI untuk verifikasi manual; hasil ini tidak boleh ditafsirkan sebagai tidak ada HGU.',
    diagnostics: attempts,
    error: attempts.join(' | '),
  };
}

function firstText(result) {
  if (!Array.isArray(result?.features) || !result.features.length) return '';
  return result.features.map((f) => Object.values(f).join(' ')).join(' | ');
}

function findValue(features, keys) {
  const list = Array.isArray(features) ? features : [];
  for (const f of list) {
    for (const [k, v] of Object.entries(f || {})) {
      const key = k.toLowerCase();
      if (keys.some((needle) => key.includes(needle)) && v !== null && v !== undefined && String(v).trim()) return String(v).trim();
    }
  }
  return null;
}

function classifyForest(result) {
  if (result.status !== 'OK') return { class: 'UNKNOWN', label: 'Kawasan hutan belum berhasil diperiksa', score: 0, value: null };
  if (!result.matched) return { class: 'NO_MATCH', label: 'Tidak ada polygon kawasan hutan pada titik', score: 0, value: 'No overlap detected' };
  const text = firstText(result).toUpperCase();
  const explicit = findValue(result.features, ['fungsi', 'kws', 'kawasan', 'status', 'kelas', 'nama']);
  if (/APL|AREA PENGGUNAAN LAIN/.test(text)) return { class: 'APL', label: 'Area Penggunaan Lain (APL)', score: 0, value: explicit || 'APL' };
  if (/HUTAN LINDUNG|(^|\W)HL(\W|$)|KONSERVASI|KSA|KPA|TAMAN NASIONAL|CAGAR ALAM/.test(text)) return { class: 'PROTECTED_FOREST', label: 'Kawasan lindung / konservasi', score: 35, value: explicit || 'Protected / conservation forest' };
  if (/HPK|HUTAN PRODUKSI.*KONVERSI/.test(text)) return { class: 'HPK', label: 'Hutan Produksi yang dapat Dikonversi (HPK)', score: 25, value: explicit || 'HPK' };
  if (/HPT|HUTAN PRODUKSI TERBATAS/.test(text)) return { class: 'HPT', label: 'Hutan Produksi Terbatas (HPT)', score: 30, value: explicit || 'HPT' };
  if (/HUTAN PRODUKSI|(^|\W)HP(\W|$)/.test(text)) return { class: 'HP', label: 'Hutan Produksi (HP)', score: 25, value: explicit || 'HP' };
  return { class: 'FOREST_AREA', label: explicit ? `Kawasan Hutan: ${explicit}` : 'Polygon kawasan hutan terdeteksi', score: 25, value: explicit || 'Forest-area polygon' };
}

function classifyPeat(peat, peatFunction, khg) {
  const anyAvailable = [peat, peatFunction, khg].some((x) => x?.status === 'OK');
  if (!anyAvailable) return { class: 'UNKNOWN', label: 'Gambut belum berhasil diperiksa', score: 0, value: null, functionValue: null, khgValue: null };
  const matched = [peat, peatFunction, khg].some((x) => x?.matched === true);
  if (!matched) return { class: 'NO_MATCH', label: 'Tidak terindikasi berada pada polygon gambut yang diperiksa', score: 0, value: 'No overlap detected', functionValue: null, khgValue: null };
  const text = `${firstText(peat)} | ${firstText(peatFunction)} | ${firstText(khg)}`.toUpperCase();
  const landform = findValue(peat?.features, ['landform', 'namobj', 'wadmpu', 'peat']);
  const functionValue = findValue(peatFunction?.features, ['feg_50k', 'feg_peat', 'fungsi']);
  const khgValue = findValue(khg?.features, ['kode_khg', 'khg']);
  if (/LINDUNG|PROTECT/.test(text)) return { class: 'PEAT_PROTECTION', label: 'Gambut — Fungsi Lindung', score: 25, value: landform || 'Peat', functionValue: functionValue || 'Fungsi Lindung', khgValue };
  if (/BUDIDAYA|CULTIV/.test(text)) return { class: 'PEAT_CULTIVATION', label: 'Gambut — Fungsi Budidaya', score: 12, value: landform || 'Peat', functionValue: functionValue || 'Fungsi Budidaya', khgValue };
  return { class: 'PEAT', label: 'Indikasi gambut', score: 15, value: landform || 'Peat', functionValue, khgValue };
}

function classifyHgu(hgu, claimedLandStatus, documentStatus, landDocumentNo) {
  const claim = String(claimedLandStatus || 'Unknown').toUpperCase();
  const docStatus = String(documentStatus || 'Unverified');
  const docNo = String(landDocumentNo || '').trim();
  if (hgu.status !== 'OK') {
    return {
      class: 'UNKNOWN', label: 'Pemeriksaan HGU ATR/BPN belum berhasil', score: 0,
      claimed: claim, documentStatus: docStatus, documentNo: docNo || null,
    };
  }
  if (hgu.result === 'HGU_INDICATION') {
    if (claim === 'HGU') return { class: 'CONSISTENT_HGU', label: 'Klaim HGU konsisten dengan indikasi HGU BHUMI', score: 0, claimed: claim, documentStatus: docStatus, documentNo: docNo || null };
    if (['SHM', 'SHGB', 'GIRIK/LETTER C', 'CUSTOMARY/ADAT'].includes(claim)) return { class: 'LAND_TENURE_CONFLICT', label: `${claim} diklaim, tetapi titik terindikasi berada pada HGU`, score: 35, claimed: claim, documentStatus: docStatus, documentNo: docNo || null };
    if (['NO DOCUMENT', 'UNKNOWN', ''].includes(claim)) return { class: 'HGU_UNVERIFIED_CLAIM', label: 'Indikasi HGU ditemukan tetapi status hak supplier belum jelas', score: 30, claimed: claim, documentStatus: docStatus, documentNo: docNo || null };
    return { class: 'HGU_REVIEW', label: 'Indikasi HGU memerlukan review tenure', score: 30, claimed: claim, documentStatus: docStatus, documentNo: docNo || null };
  }
  if (claim === 'HGU') return { class: 'HGU_NOT_CONFIRMED', label: 'Supplier mengklaim HGU, tetapi respons otomatis BHUMI belum mengonfirmasi label HGU', score: 20, claimed: claim, documentStatus: docStatus, documentNo: docNo || null };
  return { class: 'NO_HGU_PUBLIC_INDICATION', label: 'Tidak ada label HGU pada respons otomatis yang berhasil dibaca', score: 0, claimed: claim, documentStatus: docStatus, documentNo: docNo || null };
}

function overallLevel(score) {
  if (score >= 70) return 'Critical';
  if (score >= 40) return 'High';
  if (score >= 20) return 'Medium';
  return 'Low';
}

function buildNarrative({ supplierName, lat, lon, hguRisk, peatRisk, forestRisk, hgu, forest, claimedLandStatus, documentStatus, landDocumentNo, assessmentStatus, level, score }) {
  const supplier = supplierName || 'Supplier';
  const sentences = [];
  sentences.push(`Hasil screening otomatis untuk ${supplier} pada koordinat ${lat.toFixed(6)}, ${lon.toFixed(6)}:`);

  if (forest.status !== 'OK') {
    sentences.push('Status kawasan hutan belum dapat dipastikan karena layanan sumber kawasan hutan belum berhasil diakses pada saat pemeriksaan.');
  } else if (forestRisk.class === 'NO_MATCH') {
    sentences.push('Pada layer kawasan hutan yang berhasil diperiksa, titik tidak menunjukkan overlap dengan polygon kawasan hutan.');
  } else if (forestRisk.class === 'APL') {
    sentences.push(`Titik teridentifikasi sebagai ${forestRisk.label}; pada screening ini tidak ditambahkan skor risiko kawasan hutan.`);
  } else {
    sentences.push(`Titik terindikasi masuk ${forestRisk.label}${forestRisk.value ? ` (${forestRisk.value})` : ''}, sehingga memerlukan verifikasi kesesuaian penggunaan lahan dan dokumen pendukung.`);
  }

  if (peatRisk.class === 'UNKNOWN') {
    sentences.push('Status gambut belum dapat dipastikan karena sumber gambut tidak berhasil diperiksa.');
  } else if (peatRisk.class === 'NO_MATCH') {
    sentences.push('Titik tidak terindikasi berada pada polygon gambut dari layer publik yang berhasil diperiksa.');
  } else {
    const detail = [peatRisk.value, peatRisk.functionValue, peatRisk.khgValue].filter(Boolean).join('; ');
    sentences.push(`Titik terindikasi berada pada area gambut${detail ? ` dengan informasi ${detail}` : ''}.`);
  }

  const claim = String(claimedLandStatus || 'Unknown');
  const doc = String(documentStatus || 'Unverified');
  const no = String(landDocumentNo || '').trim();
  if (claim && claim !== 'Unknown') {
    sentences.push(`Status hak yang diinput untuk supplier adalah ${claim}${no ? ` (${no})` : ''} dengan status dokumen ${doc}.`);
  } else {
    sentences.push('Status hak/dokumen supplier belum diinput atau masih Unknown.');
  }

  if (hgu.status !== 'OK') {
    sentences.push('Pemeriksaan HGU otomatis ke BHUMI ATR/BPN belum berhasil, sehingga sistem belum dapat menyatakan apakah titik berada di dalam HGU atau tidak. Verifikasi manual di BHUMI/ATR-BPN tetap diperlukan.');
  } else if (hgu.result === 'HGU_INDICATION') {
    if (hguRisk.class === 'LAND_TENURE_CONFLICT') {
      sentences.push(`BHUMI memberikan indikasi HGU pada titik yang sama, sedangkan supplier mengklaim ${claim}; kondisi ini merupakan red flag tenure dan perlu klarifikasi dokumen.`);
    } else {
      sentences.push('BHUMI memberikan indikasi HGU pada titik tersebut. Hasil ini masih berupa screening publik dan perlu konfirmasi legal melalui dokumen resmi ATR/BPN.');
    }
  } else {
    sentences.push('Respons BHUMI yang dapat dibaca otomatis tidak menunjukkan label HGU. Hal ini bukan bukti final bahwa lokasi bebas HGU.');
  }

  if (assessmentStatus === 'INCOMPLETE') {
    sentences.push('Kesimpulan keseluruhan: assessment belum lengkap karena satu atau lebih sumber kritis belum tersedia, sehingga level risiko final belum dapat ditetapkan.');
  } else {
    sentences.push(`Kesimpulan keseluruhan: tingkat risiko screening adalah ${level} dengan skor ${score}/100. Hasil ini digunakan sebagai due-diligence screening dan bukan penetapan legal.`);
  }
  return sentences.join(' ');
}

function buildRisk({ hgu, peat, peatFunction, khg, forest, claimedLandStatus, documentStatus, landDocumentNo, supplierName, lat, lon }) {
  const hguRisk = classifyHgu(hgu, claimedLandStatus, documentStatus, landDocumentNo);
  const peatRisk = classifyPeat(peat, peatFunction, khg);
  const forestRisk = classifyForest(forest);

  const preliminaryScore = Math.min(100, hguRisk.score + peatRisk.score + forestRisk.score);
  const preliminaryLevel = overallLevel(preliminaryScore);

  // Critical data completeness rule: HGU and forest-area check must succeed before a final overall rating is issued.
  const criticalUnavailable = hgu.status !== 'OK' || forest.status !== 'OK';
  const assessmentStatus = criticalUnavailable ? 'INCOMPLETE' : 'COMPLETE';
  const score = assessmentStatus === 'COMPLETE' ? preliminaryScore : null;
  const level = assessmentStatus === 'COMPLETE' ? preliminaryLevel : 'Incomplete';

  const sourceAvailability = [hgu.status, peat.status, peatFunction.status, khg.status, forest.status];
  const availableCount = sourceAvailability.filter((x) => x === 'OK').length;
  const confidence = assessmentStatus === 'INCOMPLETE' ? 'Low' : (availableCount === 5 ? 'High' : availableCount >= 3 ? 'Medium' : 'Low');

  const drivers = [];
  if (hguRisk.score) drivers.push(`Land tenure / HGU: ${hguRisk.label} (+${hguRisk.score})`);
  if (peatRisk.score) drivers.push(`Peat: ${peatRisk.label} (+${peatRisk.score})`);
  if (forestRisk.score) drivers.push(`Forest area: ${forestRisk.label} (+${forestRisk.score})`);
  if (!drivers.length && assessmentStatus === 'COMPLETE') drivers.push('Tidak ada risk driver positif yang terdeteksi dari sumber yang berhasil diperiksa.');
  if (assessmentStatus === 'INCOMPLETE') drivers.push('Assessment incomplete: HGU dan/atau Kawasan Hutan belum berhasil diperiksa secara otomatis.');

  const recommendation = assessmentStatus === 'INCOMPLETE'
    ? 'Jangan tetapkan supplier sebagai Low Risk. Lakukan ulang screening dan verifikasi manual HGU/Kawasan Hutan sebelum keputusan sourcing final.'
    : preliminaryLevel === 'Critical'
      ? 'Hold onboarding/sourcing sampai temuan spasial dan legal diverifikasi melalui dokumen resmi dan verifikasi lapangan bila diperlukan.'
      : preliminaryLevel === 'High'
        ? 'Lakukan enhanced due diligence: verifikasi status hak, overlay resmi, dan bukti penguasaan lahan sebelum approval.'
        : preliminaryLevel === 'Medium'
          ? 'Lakukan klarifikasi dokumen dan verifikasi spasial tambahan sebelum keputusan sourcing.'
          : 'Lanjutkan due diligence normal, simpan bukti dokumen, dan lakukan rescreening berkala.';

  const narrative = buildNarrative({
    supplierName, lat, lon, hguRisk, peatRisk, forestRisk, hgu, forest,
    claimedLandStatus, documentStatus, landDocumentNo,
    assessmentStatus, level: preliminaryLevel, score: preliminaryScore,
  });

  return {
    assessment_status: assessmentStatus,
    score,
    level,
    preliminary_score: preliminaryScore,
    preliminary_level: preliminaryLevel,
    confidence,
    drivers,
    recommendation,
    ai_explanation: narrative,
    components: { hgu: hguRisk, peat: peatRisk, forest: forestRisk },
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const lat = finiteNumber(body?.latitude);
    const lon = finiteNumber(body?.longitude);
    if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json({ error: 'Latitude / longitude tidak valid.' }, { status: 400 });
    }

    const [hgu, peat, peatFunction, khg, forest] = await Promise.all([
      queryBhumiHgu(lat, lon),
      queryArcGisLayerRobust(PEAT_LAYER, BIG_NATURAL_RESOURCES, 6, lat, lon, 'BIG Satu Peta — Peta Lahan Gambut'),
      queryArcGisLayerRobust(PEAT_FUNCTION_LAYER, BIG_NATURAL_RESOURCES, 48, lat, lon, 'BIG Satu Peta — Fungsi Ekosistem Gambut'),
      queryArcGisLayerRobust(KHG_LAYER, BIG_NATURAL_RESOURCES, 37, lat, lon, 'BIG Satu Peta — Kesatuan Hidrologis Gambut'),
      queryForest(lat, lon),
    ]);

    const risk = buildRisk({
      hgu, peat, peatFunction, khg, forest,
      claimedLandStatus: body?.claimed_land_status || 'Unknown',
      documentStatus: body?.document_status || 'Unverified',
      landDocumentNo: body?.land_document_no || '',
      supplierName: body?.supplier_name || null,
      lat, lon,
    });

    return NextResponse.json({
      checked_at: new Date().toISOString(),
      coordinate: { latitude: lat, longitude: lon },
      supplier_name: body?.supplier_name || null,
      claimed_land_status: body?.claimed_land_status || 'Unknown',
      document_status: body?.document_status || 'Unverified',
      land_document_no: body?.land_document_no || null,
      results: { hgu, peat, peat_function: peatFunction, khg, forest },
      risk,
      source_links: {
        bhumi: 'https://bhumi.atrbpn.go.id/peta',
        atlas: 'https://atlas.atrbpn.go.id/',
        forest: 'https://geoportal.menlhk.go.id/',
        big_one_map: 'https://tanahair.indonesia.go.id/portal-web',
      },
      disclaimer: 'Hasil ini adalah screening spasial dan penjelasan otomatis berbasis data sumber yang berhasil dibaca. Bukan penetapan legal. Status HGU/SHM final harus dikonfirmasi melalui dokumen dan layanan resmi ATR/BPN; status kawasan hutan/gambut harus dikonfirmasi terhadap dataset resmi yang berlaku.',
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Gagal menjalankan spatial screening.' }, { status: 500 });
  }
}
