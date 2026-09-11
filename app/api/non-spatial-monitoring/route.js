import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GDELT_HTTPS = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GOOGLE_NEWS = 'https://news.google.com/rss/search';

function ymdhms(dateText, end = false) {
  return String(dateText || '').replaceAll('-', '') + (end ? '235959' : '000000');
}
function safeText(value, max = 300) { return String(value || '').trim().slice(0, max); }
function exactPhrase(value) { return `"${String(value || '').replaceAll('"', '').trim()}"`; }
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
  const d = new Date(`${text}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function inRange(value, start, end) {
  if (!value) return true;
  const d = new Date(value); if (Number.isNaN(d.getTime())) return true;
  const a = new Date(`${start}T00:00:00Z`), b = new Date(`${end}T23:59:59Z`);
  return d >= a && d <= b;
}
function normalizeTitle(value='') {
  return String(value).toLowerCase().replace(/\s+-\s+[^-]+$/,'').replace(/[^a-z0-9à-ÿ]+/gi,' ').replace(/\s+/g,' ').trim();
}
function buildAliases(entity, code) {
  const e = safeText(entity, 180);
  const c = safeText(code, 30).toUpperCase();
  const list = [];
  const add = v => { const s = safeText(v, 180); if (s && !list.some(x => x.toLowerCase() === s.toLowerCase())) list.push(s); };
  add(e);
  if (e && !/^pt\.?\s/i.test(e) && !/kpn/i.test(e)) add(`PT ${e}`);
  if (c && c !== 'GROUP' && c !== 'CUSTOM' && c !== 'KPN') add(`PT ${c}`);
  if (/kpn/i.test(e) || c === 'KPN') { add('KPN Plantations'); add('KPN Plantation'); add('KPN Corp'); }
  return list.slice(0, 6);
}
function aliasExpression(aliases) { return `(${aliases.map(exactPhrase).join(' OR ')})`; }

async function fetchText(url, timeoutMs = 18000) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache:'no-store', signal:controller.signal, headers:{'User-Agent':'Mozilla/5.0 (compatible; SystemMonitoring/1.0; +https://vercel.app)','Accept':'application/json,text/xml,application/xml,text/plain,*/*'} });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}

const NEGATIVE_TERMS = [
  'kebakaran','terbakar','hotspot','konflik','sengketa','pencemaran','polusi','limbah','deforestasi','perambahan','pelanggaran','gugatan','protes','demo','grievance','keluhan','aduan','kerusakan','ilegal','korupsi','suap','krisis','kecelakaan','meninggal','tewas','banjir','denda','sanksi','penolakan','masalah','ancaman','investigasi','diselidiki','dugaan','penganiayaan','pemerkosaan','air keras','tersangka','pidana','pollution','conflict','fire','wildfire','deforestation','violation','lawsuit','protest','complaint','illegal','corruption','sanction','alleged','allegation','investigation'
];
const POSITIVE_TERMS = [
  'penghargaan','sertifikasi','sertifikat','keberlanjutan','berkelanjutan','konservasi','restorasi','pelatihan','program','kemitraan','kolaborasi','bantuan','pemberdayaan','penanaman','rehabilitasi','komitmen','prestasi','peresmian','inovasi','dukung','mendukung','dukungan','peduli','pencegahan','cegah','kesiapsiagaan','serah terima','aksi iklim','lingkungan hidup','award','certification','certified','sustainability','sustainable','conservation','restoration','training','partnership','collaboration','community','achievement','innovation','support','climate action','prevention','assistance'
];
function sentimentScore(text) {
  const s = String(text || '').toLowerCase(); let pos=0, neg=0;
  for (const t of POSITIVE_TERMS) if (s.includes(t)) pos++;
  for (const t of NEGATIVE_TERMS) if (s.includes(t)) neg++;
  return {pos,neg};
}
function classifyText(text, fallback='needs_review') {
  const score=sentimentScore(text); if (score.neg>score.pos) return 'negative'; if (score.pos>score.neg) return 'positive'; return fallback;
}
function classifyTone(tone, text='') {
  const n = Number(tone);
  if (Number.isFinite(n)) { if (n > 1) return 'positive'; if (n < -1) return 'negative'; }
  return classifyText(text, 'needs_review');
}
function normalizeGdelt(article) {
  return { title:article?.title||'(tanpa judul)', url:article?.url||'', domain:article?.domain||'', seenDate:parseSeenDate(article?.seendate), language:article?.language||'', sourceCountry:article?.sourcecountry||'', socialImage:article?.socialimage||'', tone:article?.tone??null, sentiment:classifyTone(article?.tone, article?.title||''), sourceEngine:'GDELT' };
}
async function fetchGdelt({aliases, extra, start, end, language, maxRecords}) {
  let query = aliasExpression(aliases);
  if (extra) query += ` ${extra}`;
  if (language === 'indonesian') query += ' sourcelang:indonesian';
  const params = new URLSearchParams({query, mode:'artlist', maxrecords:String(Math.min(250, Math.max(maxRecords*3,50))), format:'json', sort:'datedesc', startdatetime:ymdhms(start), enddatetime:ymdhms(end,true)});
  const text = await fetchText(`${GDELT_HTTPS}?${params.toString()}`, 20000);
  const json = JSON.parse(text);
  return (json?.articles||[]).map(normalizeGdelt).filter(x=>inRange(x.seenDate,start,end));
}

function decodeXml(value='') { return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function between(text,startTag,endTag){const a=text.indexOf(startTag);if(a<0)return'';const b=text.indexOf(endTag,a+startTag.length);if(b<0)return'';return text.slice(a+startTag.length,b)}
function parseSource(item){const m=item.match(/<source(?:\s+url="([^"]*)")?>([\s\S]*?)<\/source>/i);if(!m)return{name:'',url:''};return{url:decodeXml(m[1]||''),name:decodeXml(m[2]||'')}}
function domainFromUrl(value){try{return new URL(value).hostname.replace(/^www\./,'')}catch{return''}}
function parseGoogleRss(xml,start,end){
  const items=xml.match(/<item>[\s\S]*?<\/item>/gi)||[];
  return items.map(item=>{const title=decodeXml(between(item,'<title>','</title>'));const link=decodeXml(between(item,'<link>','</link>'));const pubDate=decodeXml(between(item,'<pubDate>','</pubDate>'));const description=decodeXml(between(item,'<description>','</description>'));const source=parseSource(item);const seenDate=pubDate?new Date(pubDate).toISOString():null;return{title:title||'(tanpa judul)',url:link,domain:source.name||domainFromUrl(source.url||link),seenDate,language:'Indonesian',sourceCountry:'Indonesia',socialImage:'',tone:null,sentiment:classifyText(`${title} ${description}`,'needs_review'),sourceEngine:'Google News'};}).filter(x=>inRange(x.seenDate,start,end));
}
async function fetchGoogleFeed(query,language){const params=new URLSearchParams({q:query});if(language==='indonesian'){params.set('hl','id');params.set('gl','ID');params.set('ceid','ID:id')}else{params.set('hl','en');params.set('gl','US');params.set('ceid','US:en')}return await fetchText(`${GOOGLE_NEWS}?${params.toString()}`,18000)}
async function fetchGoogle({aliases, extra, start, end, language}) {
  const dateQuery=`after:${start} before:${addDays(end,1)}`;
  const aliasQuery=aliasExpression(aliases);
  const extraQuery=extra?` ${extra}`:'';
  const queries=[`${aliasQuery}${extraQuery} ${dateQuery}`];
  // A second broad query helps articles whose headline uses only the legal name or acronym.
  if (aliases.length>1) queries.push(`${aliases.map(a=>exactPhrase(a)).join(' OR ')}${extraQuery} ${dateQuery}`);
  const xmls=await Promise.all(queries.map(q=>fetchGoogleFeed(q,language)));
  return xmls.flatMap(xml=>parseGoogleRss(xml,start,end));
}

function dedupe(rows) {
  const map=new Map();
  const priority={negative:3,positive:2,needs_review:1};
  for(const row of rows){const key=normalizeTitle(row.title)||row.url;if(!key)continue;const prev=map.get(key);if(!prev||priority[row.sentiment]>priority[prev.sentiment])map.set(key,row)}
  return [...map.values()].sort((a,b)=>new Date(b.seenDate||0)-new Date(a.seenDate||0));
}

export async function GET(request) {
  try {
    const {searchParams}=new URL(request.url);
    const start=safeText(searchParams.get('start'),10), end=safeText(searchParams.get('end'),10), entity=safeText(searchParams.get('entity'),180), code=safeText(searchParams.get('code'),30), extra=safeText(searchParams.get('extra'),180), language=safeText(searchParams.get('language'),30);
    const maxRecords=Math.max(10,Math.min(100,Number(searchParams.get('max')||50)));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return NextResponse.json({error:'Tanggal mulai dan akhir wajib diisi.'},{status:400});
    if(!entity)return NextResponse.json({error:'Entity / keyword wajib diisi.'},{status:400});
    if(new Date(start)>new Date(end))return NextResponse.json({error:'Tanggal mulai tidak boleh setelah tanggal akhir.'},{status:400});
    if(daysBetween(start,end)>92)return NextResponse.json({error:'Monitoring otomatis versi ini mendukung maksimum sekitar 3 bulan per pencarian.'},{status:400});
    const endDate=new Date(`${end}T23:59:59Z`); if(endDate>new Date(Date.now()+86400000))return NextResponse.json({error:'Tanggal akhir tidak boleh berada di masa depan.'},{status:400});

    const aliases=buildAliases(entity,code);
    const failures=[];
    const resultRows=[];
    const [gdeltSettled,googleSettled]=await Promise.allSettled([
      fetchGdelt({aliases,extra,start,end,language,maxRecords}),
      fetchGoogle({aliases,extra,start,end,language})
    ]);
    if(gdeltSettled.status==='fulfilled') resultRows.push(...gdeltSettled.value); else failures.push(`GDELT: ${gdeltSettled.reason?.message||'failed'}`);
    if(googleSettled.status==='fulfilled') resultRows.push(...googleSettled.value); else failures.push(`Google News: ${googleSettled.reason?.message||'failed'}`);
    if(!resultRows.length && failures.length===2) return NextResponse.json({error:`Sumber berita tidak dapat diakses: ${failures.join(' | ')}`},{status:502});

    const clean=dedupe(resultRows);
    const positive=clean.filter(x=>x.sentiment==='positive').slice(0,maxRecords);
    const negative=clean.filter(x=>x.sentiment==='negative').slice(0,maxRecords);
    const needsReview=clean.filter(x=>x.sentiment==='needs_review').slice(0,maxRecords);
    return NextResponse.json({
      meta:{source:gdeltSettled.status==='fulfilled'&&googleSettled.status==='fulfilled'?'GDELT + Google News':gdeltSettled.status==='fulfilled'?'GDELT DOC 2.0':'Google News RSS',entity,code,aliases,extra,language:language||'all',start,end,generatedAt:new Date().toISOString(),sentimentMethod:'GDELT tone + expanded Indonesian/English keyword classification',failures},
      positive,negative,needsReview,
      totals:{positive:positive.length,negative:negative.length,needsReview:needsReview.length,total:positive.length+negative.length+needsReview.length,raw:clean.length}
    });
  } catch(error){const message=error?.name==='AbortError'?'Sumber berita terlalu lama merespons. Silakan coba lagi.':(error?.message||'Gagal mengambil berita.');return NextResponse.json({error:`Sumber berita tidak dapat diakses: ${message}`},{status:502})}
}
