'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import styles from './page.module.css';

const STOP = new Set('yang dan di ke dari untuk dengan pada dalam ini itu atau karena sebagai oleh akan telah agar juga tidak ada lebih dapat tentang atas antara terhadap saat setelah sebelum masih menjadi sebuah para mereka kami kita the a an and or of to in on for with by from is are was were be been this that as at'.split(/\s+/));

function isoDate(d){return d.toISOString().slice(0,10)}
function daysAgo(n){const d=new Date();d.setDate(d.getDate()-n);return isoDate(d)}
function formatDate(v){if(!v)return '-';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
function topTerms(rows){const c={};for(const r of rows){for(const w of String(r.title||'').toLowerCase().replace(/[^a-z0-9à-ÿ\s-]/gi,' ').split(/\s+/)){if(w.length<4||STOP.has(w))continue;c[w]=(c[w]||0)+1}}return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,8)}
function csvCell(v){const s=String(v??'');return `"${s.replaceAll('"','""')}"`}

export default function NonSpatialMonitoring(){
  const [companies,setCompanies]=useState([]);
  const [company,setCompany]=useState('GROUP');
  const [customEntity,setCustomEntity]=useState('KPN Plantations');
  const [start,setStart]=useState(daysAgo(7));
  const [end,setEnd]=useState(isoDate(new Date()));
  const [extra,setExtra]=useState('');
  const [language,setLanguage]=useState('indonesian');
  const [max,setMax]=useState('50');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [data,setData]=useState(null);
  const [tab,setTab]=useState('all');

  useEffect(()=>{(async()=>{if(!supabase)return;const{data}=await supabase.from('companies').select('company_code,company_name,status').eq('status','Active').order('company_code');setCompanies(data||[])})()},[]);
  const selected=companies.find(c=>c.company_code===company);
  const entity=company==='GROUP'?'KPN Plantations':company==='CUSTOM'?customEntity:(selected?.company_name||customEntity);
  const rows=useMemo(()=>data?[...(data.positive||[]),...(data.negative||[])]:[],[data]);
  const visible=tab==='positive'?(data?.positive||[]):tab==='negative'?(data?.negative||[]):rows;
  const posTerms=useMemo(()=>topTerms(data?.positive||[]),[data]);
  const negTerms=useMemo(()=>topTerms(data?.negative||[]),[data]);
  const share=data?.totals?.total?Math.round((data.totals.positive/data.totals.total)*100):0;

  async function generate(e){e.preventDefault();setLoading(true);setError('');setData(null);try{const p=new URLSearchParams({start,end,entity,extra,language,max});const r=await fetch(`/api/non-spatial-monitoring?${p.toString()}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Gagal generate monitoring.');setData(j)}catch(err){setError(err.message||'Gagal generate monitoring.')}finally{setLoading(false)}}
  function exportCsv(){if(!data)return;const lines=[['Sentiment','Tanggal','Judul','Media','Negara Sumber','Bahasa','URL'],...rows.map(r=>[r.sentiment,formatDate(r.seenDate),r.title,r.domain,r.sourceCountry,r.language,r.url])];const csv=lines.map(r=>r.map(csvCell).join(',')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Monitoring_Non_Spasial_${start}_${end}.csv`;a.click();URL.revokeObjectURL(a.href)}

  return <div className={styles.page}>
    <div className={styles.heading}><div><h1>Monitoring Non Spasial</h1><p>Monitoring pemberitaan positif dan negatif berdasarkan periode, entity, serta keyword yang dipilih.</p></div></div>
    <section className={styles.panel}>
      <form className={styles.formGrid} onSubmit={generate}>
        <div className={styles.field}><label>Entity / Company</label><select value={company} onChange={e=>setCompany(e.target.value)}><option value="GROUP">KPN Plantations Group</option>{companies.map(c=><option key={c.company_code} value={c.company_code}>{c.company_code} — {c.company_name}</option>)}<option value="CUSTOM">Custom keyword / entity</option></select></div>
        {company==='CUSTOM'&&<div className={styles.field}><label>Custom Entity</label><input value={customEntity} onChange={e=>setCustomEntity(e.target.value)} placeholder="Contoh: KPN Plantations" required/></div>}
        <div className={styles.field}><label>Periode Mulai</label><input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></div>
        <div className={styles.field}><label>Periode Sampai</label><input type="date" value={end} onChange={e=>setEnd(e.target.value)} required/></div>
        <div className={`${styles.field} ${styles.wide}`}><label>Keyword Tambahan (opsional)</label><input value={extra} onChange={e=>setExtra(e.target.value)} placeholder="Contoh: kebakaran OR konflik OR penghargaan"/></div>
        <div className={styles.field}><label>Bahasa Sumber</label><select value={language} onChange={e=>setLanguage(e.target.value)}><option value="indonesian">Indonesia</option><option value="all">Semua bahasa</option></select></div>
        <div className={styles.field}><label>Maks. hasil / sentiment</label><select value={max} onChange={e=>setMax(e.target.value)}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></div>
        <div className={styles.actions}><button className={styles.primary} disabled={loading}>{loading?'Generating…':'Generate Monitoring'}</button></div>
      </form>
      <div className={styles.source}>Sumber otomatis: GDELT DOC 2.0 dengan fallback Google News RSS jika GDELT tidak dapat diakses dari server. Sentiment bersifat indikatif dan tetap perlu review manusia. Rentang otomatis maksimum sekitar 3 bulan per pencarian.</div>
    </section>
    {error&&<div className={`${styles.notice} ${styles.error}`}><strong>Monitoring gagal: </strong>{error}</div>}
    {data&&<>
      <div className={`${styles.notice} ${styles.info}`}>Generated untuk <strong>{data.meta.entity}</strong> · {data.meta.start} s.d. {data.meta.end} · {data.totals.total} berita terindikasi positif/negatif. · Source: <strong>{data.meta.source}</strong></div>
      <section className={styles.kpis}><div className={styles.kpi}><span>Total Coverage</span><strong>{data.totals.total}</strong></div><div className={`${styles.kpi} ${styles.positive}`}><span>Positive</span><strong>{data.totals.positive}</strong></div><div className={`${styles.kpi} ${styles.negative}`}><span>Negative</span><strong>{data.totals.negative}</strong></div><div className={styles.kpi}><span>Positive Share</span><strong>{share}%</strong></div></section>
      <section className={styles.panel}><div className={styles.reportActions}><button className={styles.secondary} onClick={()=>window.print()}>Print / Save PDF</button><button className={styles.secondary} onClick={exportCsv}>Download CSV</button></div><div className={styles.insight}><div className={styles.insightBox}><h3>Executive Insight</h3><p>{data.totals.total===0?'Tidak ada coverage positif/negatif yang ditemukan pada parameter ini.':data.totals.negative>data.totals.positive?'Coverage negatif lebih dominan pada periode ini. Prioritaskan review headline negatif, sumber, dan isu berulang sebelum eskalasi.':data.totals.positive>data.totals.negative?'Coverage positif lebih dominan pada periode ini. Tetap review isu negatif yang muncul agar potensi risiko reputasi tidak terlewat.':'Coverage positif dan negatif relatif seimbang. Review isu dengan pengulangan terbanyak dan sumber dengan jangkauan penting.'}</p><p>Positive: {data.totals.positive} · Negative: {data.totals.negative} · Positive share: {share}%.</p></div><div className={styles.insightBox}><h3>Headline Themes</h3><p>Positive themes</p><div className={styles.topics}>{posTerms.length?posTerms.map(([t,n])=><span className={styles.topic} key={t}>{t} · {n}</span>):<span className={styles.topic}>No recurring theme</span>}</div><p>Negative themes</p><div className={styles.topics}>{negTerms.length?negTerms.map(([t,n])=><span className={styles.topic} key={t}>{t} · {n}</span>):<span className={styles.topic}>No recurring theme</span>}</div></div></div></section>
      <section className={styles.panel}><div className={styles.tabs}><button className={`${styles.tab} ${tab==='all'?styles.active:''}`} onClick={()=>setTab('all')}>All ({rows.length})</button><button className={`${styles.tab} ${tab==='positive'?styles.active:''}`} onClick={()=>setTab('positive')}>Positive ({data.totals.positive})</button><button className={`${styles.tab} ${tab==='negative'?styles.active:''}`} onClick={()=>setTab('negative')}>Negative ({data.totals.negative})</button></div>{visible.length?<div className={styles.articleGrid}>{visible.map((r,i)=><article className={styles.article} key={`${r.url}-${i}`}><div className={styles.articleTop}><span className={`${styles.badge} ${r.sentiment==='positive'?styles.badgePos:styles.badgeNeg}`}>{r.sentiment}</span><span className={styles.meta}>{formatDate(r.seenDate)}</span></div><h3>{r.title}</h3><div className={styles.meta}><span>{r.domain||'Unknown source'}</span><span>{r.sourceCountry||''}</span><span>{r.language||''}</span></div>{r.url&&<a className={styles.link} href={r.url} target="_blank" rel="noreferrer">Open article ↗</a>}</article>)}</div>:<div className={styles.empty}>Tidak ada artikel pada kategori ini.</div>}</section>
    </>}
  </div>
}
