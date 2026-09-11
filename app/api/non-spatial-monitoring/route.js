import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GDELT_HTTPS = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_HTTP = 'http://api.gdeltproject.org/api/v2/doc/doc';
const GOOGLE_NEWS = 'https://news.google.com/rss/search';

function ymdhms(dateText, end = false) {
  return String(dateText || '').replaceAll('-', '') + (end ? '235959' : '000000');
}

function safeText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function exactPhrase(value) {
  return `"${String(value || '').replaceAll('"', '').trim()}"`;
}

function parseSeenDate(value) {
  const s = String(value || '');
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return value || null;
  const [, y, mo, d, h = '00', mi = '00', sec = '00'] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${sec}Z`;
}

function daysBetween(a, b) {
  const x = new Date(`${a}T00:00:00Z`), y = new Date(`${b}T00:00:00Z`);
  return Math.floor((y - x) / 86400000);
}

function addDays(text, n) {
  const d = new Date(`${text}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function normalizeArticle(article, sentiment) {
  return {
    title: article?.title || '(tanpa judul)',
    url: article?.url || '',
    domain: article?.domain || '',
    seenDate: parseSeenDate(article?.seendate),
    language: article?.language || '',
    sourceCountry: article?.sourcecountry || '',
    socialImage: article?.socialimage || '',
    tone: typeof article?.tone === 'number' ? article.tone : (article?.tone ?? null),
    sentiment,
  };
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SystemMonitoring/1.0; +https://vercel.app)',
        'Accept': 'application/json,text/xml,application/xml,text/plain,*/*',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGdeltFrom(base, { query, start, end, maxRecords, sentiment }) {
  const tone = sentiment === 'positive' ? 'tone>1' : 'tone<-1';
  const params = new URLSearchParams({
    query: `${query} ${tone}`,
    mode: 'artlist',
    maxrecords: String(maxRecords),
    format: 'json',
    sort: 'datedesc',
    startdatetime: ymdhms(start),
    enddatetime: ymdhms(end, true),
  });
  const text = await fetchText(`${base}?${params.toString()}`, 18000);
  const json = JSON.parse(text);
  return (json?.articles || []).map(a => normalizeArticle(a, sentiment));
}

async function tryGdelt(args) {
  const failures = [];
  for (const base of [GDELT_HTTPS, GDELT_HTTP]) {
    try {
      const [positive, negative] = await Promise.all([
        fetchGdeltFrom(base, { ...args, sentiment: 'positive' }),
        fetchGdeltFrom(base, { ...args, sentiment: 'negative' }),
      ]);
      return { positive, negative, source: 'GDELT DOC 2.0', failures };
    } catch (e) {
      failures.push(`${base.startsWith('https') ? 'GDELT HTTPS' : 'GDELT HTTP'}: ${e?.message || 'failed'}`);
    }
  }
  throw new Error(failures.join(' | '));
}

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function between(text, startTag, endTag) {
  const a = text.indexOf(startTag);
  if (a < 0) return '';
  const b = text.indexOf(endTag, a + startTag.length);
  if (b < 0) return '';
  return text.slice(a + startTag.length, b);
}

function parseSource(item) {
  const m = item.match(/<source(?:\s+url="([^"]*)")?>([\s\S]*?)<\/source>/i);
  if (!m) return { name: '', url: '' };
  return { url: decodeXml(m[1] || ''), name: decodeXml(m[2] || '') };
}

function domainFromUrl(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const NEGATIVE_TERMS = [
  'kebakaran','terbakar','hotspot','konflik','sengketa','pencemaran','polusi','limbah','deforestasi','perambahan',
  'pelanggaran','gugatan','protes','demo','grievance','keluhan','aduan','kerusakan','ilegal','korupsi','suap','krisis',
  'kecelakaan','meninggal','tewas','banjir','denda','sanksi','penolakan','masalah','ancaman','investigasi','diselidiki',
  'pollution','conflict','fire','wildfire','deforestation','violation','lawsuit','protest','complaint','illegal','corruption','sanction'
];
const POSITIVE_TERMS = [
  'penghargaan','sertifikasi','sertifikat','keberlanjutan','berkelanjutan','konservasi','restorasi','pelatihan','program',
  'kemitraan','kolaborasi','bantuan','pemberdayaan','penanaman','rehabilitasi','komitmen','prestasi','peresmian','inovasi',
  'award','certification','certified','sustainability','sustainable','conservation','restoration','training','partnership',
  'collaboration','community','achievement','innovation','support'
];

function sentimentScore(text) {
  const s = String(text || '').toLowerCase();
  let pos = 0, neg = 0;
  for (const t of POSITIVE_TERMS) if (s.includes(t)) pos++;
  for (const t of NEGATIVE_TERMS) if (s.includes(t)) neg++;
  return { pos, neg };
}

function parseGoogleRss(xml, defaultSentiment = null) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.map(item => {
    const title = decodeXml(between(item, '<title>', '</title>'));
    const link = decodeXml(between(item, '<link>', '</link>'));
    const pubDate = decodeXml(between(item, '<pubDate>', '</pubDate>'));
    const description = decodeXml(between(item, '<description>', '</description>'));
    const source = parseSource(item);
    const score = sentimentScore(`${title} ${description}`);
    let sentiment = defaultSentiment;
    if (score.neg > score.pos) sentiment = 'negative';
    else if (score.pos > score.neg) sentiment = 'positive';
    return {
      title: title || '(tanpa judul)',
      url: link,
      domain: source.name || domainFromUrl(source.url || link),
      seenDate: pubDate ? new Date(pubDate).toISOString() : null,
      language: 'Indonesian',
      sourceCountry: 'Indonesia',
      socialImage: '',
      tone: null,
      sentiment,
      _description: description,
    };
  }).filter(x => x.sentiment === 'positive' || x.sentiment === 'negative');
}

async function fetchGoogleFeed(query, language, maxRecords) {
  const params = new URLSearchParams({ q: query });
  if (language === 'indonesian') {
    params.set('hl', 'id'); params.set('gl', 'ID'); params.set('ceid', 'ID:id');
  } else {
    params.set('hl', 'en'); params.set('gl', 'US'); params.set('ceid', 'US:en');
  }
  const xml = await fetchText(`${GOOGLE_NEWS}?${params.toString()}`, 15000);
  return xml;
}

async function fetchGoogleFallback({ entity, extra, start, end, language, maxRecords }) {
  const dateQuery = `after:${start} before:${addDays(end, 1)}`;
  const entityQuery = exactPhrase(entity);
  const extraQuery = extra ? ` ${extra}` : '';
  const negBlock = '(kebakaran OR konflik OR pencemaran OR deforestasi OR pelanggaran OR sengketa OR protes OR keluhan OR grievance OR pollution OR conflict OR fire)';
  const posBlock = '(sertifikasi OR penghargaan OR keberlanjutan OR konservasi OR pelatihan OR kemitraan OR sustainability OR certification OR award OR conservation)';

  const [generalXml, posXml, negXml] = await Promise.all([
    fetchGoogleFeed(`${entityQuery}${extraQuery} ${dateQuery}`, language, maxRecords),
    fetchGoogleFeed(`${entityQuery}${extraQuery} ${posBlock} ${dateQuery}`, language, maxRecords),
    fetchGoogleFeed(`${entityQuery}${extraQuery} ${negBlock} ${dateQuery}`, language, maxRecords),
  ]);

  const general = parseGoogleRss(generalXml, null);
  const pos = parseGoogleRss(posXml, 'positive');
  const neg = parseGoogleRss(negXml, 'negative');
  const all = [...pos, ...neg, ...general];

  const seen = new Set();
  const unique = [];
  for (const row of all) {
    const key = row.url || `${row.title}|${row.domain}`;
    if (!key || seen.has(key)) continue;
    seen.add(key); unique.push(row);
  }
  return {
    positive: unique.filter(x => x.sentiment === 'positive').slice(0, maxRecords),
    negative: unique.filter(x => x.sentiment === 'negative').slice(0, maxRecords),
    source: 'Google News RSS fallback',
  };
}

function dedupeBySentiment(positive, negative) {
  const seen = new Set();
  const clean = rows => rows.filter(row => {
    const key = row.url || `${row.title}|${row.domain}`;
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  return { positive: clean(positive), negative: clean(negative) };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = safeText(searchParams.get('start'), 10);
    const end = safeText(searchParams.get('end'), 10);
    const entity = safeText(searchParams.get('entity'), 180);
    const extra = safeText(searchParams.get('extra'), 180);
    const language = safeText(searchParams.get('language'), 30);
    const maxRecords = Math.max(10, Math.min(100, Number(searchParams.get('max') || 50)));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return NextResponse.json({ error: 'Tanggal mulai dan akhir wajib diisi.' }, { status: 400 });
    }
    if (!entity) return NextResponse.json({ error: 'Entity / keyword wajib diisi.' }, { status: 400 });
    if (new Date(start) > new Date(end)) return NextResponse.json({ error: 'Tanggal mulai tidak boleh setelah tanggal akhir.' }, { status: 400 });
    if (daysBetween(start, end) > 92) {
      return NextResponse.json({ error: 'Monitoring otomatis versi ini mendukung maksimum sekitar 3 bulan per pencarian.' }, { status: 400 });
    }

    const today = new Date();
    const endDate = new Date(`${end}T23:59:59Z`);
    if (endDate > new Date(today.getTime() + 86400000)) {
      return NextResponse.json({ error: 'Tanggal akhir tidak boleh berada di masa depan.' }, { status: 400 });
    }

    let gdeltQuery = exactPhrase(entity);
    if (extra) gdeltQuery += ` ${extra}`;
    if (language === 'indonesian') gdeltQuery += ' sourcelang:indonesian';

    let result;
    let fallbackReason = null;
    try {
      result = await tryGdelt({ query: gdeltQuery, start, end, maxRecords });
    } catch (gdeltError) {
      fallbackReason = gdeltError?.message || 'GDELT unavailable';
      result = await fetchGoogleFallback({ entity, extra, start, end, language, maxRecords });
    }

    const clean = dedupeBySentiment(result.positive || [], result.negative || []);
    return NextResponse.json({
      meta: {
        source: result.source,
        entity,
        extra,
        language: language || 'all',
        start,
        end,
        generatedAt: new Date().toISOString(),
        toneRule: result.source.startsWith('GDELT') ? { positive: '> 1', negative: '< -1' } : null,
        sentimentMethod: result.source.startsWith('GDELT') ? 'GDELT machine tone' : 'Google News + keyword-assisted classification',
        fallbackReason,
      },
      positive: clean.positive,
      negative: clean.negative,
      totals: { positive: clean.positive.length, negative: clean.negative.length, total: clean.positive.length + clean.negative.length },
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Sumber berita terlalu lama merespons. Silakan coba lagi.'
      : (error?.message || 'Gagal mengambil berita.');
    return NextResponse.json({ error: `Sumber berita tidak dapat diakses: ${message}` }, { status: 502 });
  }
}
