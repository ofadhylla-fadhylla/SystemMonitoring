import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';

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

async function fetchGdelt({ query, start, end, maxRecords, sentiment }) {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${GDELT}?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'SystemMonitoring/1.0 (+Vercel)' },
    });
    if (!response.ok) throw new Error(`GDELT ${response.status}`);
    const json = await response.json();
    return (json?.articles || []).map(a => normalizeArticle(a, sentiment));
  } finally {
    clearTimeout(timeout);
  }
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

    let query = exactPhrase(entity);
    if (extra) query += ` ${extra}`;
    if (language === 'indonesian') query += ' sourcelang:indonesian';

    const [positive, negative] = await Promise.all([
      fetchGdelt({ query, start, end, maxRecords, sentiment: 'positive' }),
      fetchGdelt({ query, start, end, maxRecords, sentiment: 'negative' }),
    ]);

    const seen = new Set();
    const clean = (rows) => rows.filter(row => {
      const key = row.url || `${row.title}|${row.domain}`;
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });

    const pos = clean(positive);
    const neg = clean(negative);
    return NextResponse.json({
      meta: {
        source: 'GDELT DOC 2.0',
        entity,
        extra,
        language: language || 'all',
        start,
        end,
        generatedAt: new Date().toISOString(),
        toneRule: { positive: '> 1', negative: '< -1' },
      },
      positive: pos,
      negative: neg,
      totals: { positive: pos.length, negative: neg.length, total: pos.length + neg.length },
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Sumber berita terlalu lama merespons. Silakan coba lagi.'
      : (error?.message || 'Gagal mengambil berita.');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
