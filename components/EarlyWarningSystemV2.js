'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';

const ORDER={Critical:0,High:1,Medium:2,Low:3};
const isOpen=s=>!['Completed','Closed'].includes(s||'Open');
const daysUntil=v=>{if(!v)return null;const d=new Date(`${String(v).slice(0,10)}T00:00:00`);if(Number.isNaN(d.getTime()))return null;const t=new Date();t.setHours(0,0,0,0);return Math.round((d-t)/86400000)};
const clip=(v,n=105)=>{const s=String(v||'');return s.length>n?`${s.slice(0,n-1)}…`:s};

async function paged(factory,size=1000){
  const out=[];let from=0;
  while(true){const r=await factory().range(from,from+size-1);if(r.error)throw r.error;const rows=r.data||[];out.push(...rows);if(rows.length<size)break;from+=size}
  return out;
}
async function byIds(table,cols,field,ids){
  const all=[...new Set((ids||[]).filter(Boolean))],out=[];
  for(let i=0;i<all.length;i+=200){const part=all.slice(i,i+200);out.push(...await paged(()=>supabase.from(table).select(cols).in(field,part)))}
  return out;
}
async function optional(label,fn,soft){
  try{return await fn()}catch(e){soft.push(`${label}: ${e.message||e}`);return []}
}

export default function EarlyWarningSystemV2(){
  const currentYear=new Date().getFullYear();
  const [year,setYear]=useState(currentYear),[loading,setLoading]=useState(true),[error,setError]=useState(''),[soft,setSoft]=useState([]);
  const [companyFilter,setCompanyFilter]=useState('All'),[severityFilter,setSeverityFilter]=useState('All'),[categoryFilter,setCategoryFilter]=useState('All');
  const [data,setData]=useState({companies:[],assessments:[],items:[],indicators:[],actions:[],evidence:[],certifications:[],audits:[]});

  useEffect(()=>{load()},[year]);
  async function load(){
    const ce=getSupabaseConfigError();if(ce||!supabase){setError(ce||'Supabase not configured.');setLoading(false);return}
    setLoading(true);setError('');const softErrors=[];
    try{
      const [co,st]=await Promise.all([
        supabase.from('companies').select('id,company_code,company_name,region,province,status').eq('status','Active').order('company_code'),
        supabase.from('sims_standards').select('id,code,name,status').eq('code','NDPE-IMIS-KPN').eq('status','Active').maybeSingle(),
      ]);
      if(co.error||st.error)throw(co.error||st.error);if(!st.data)throw new Error('NDPE-IMIS-KPN master belum tersedia.');
      const assessments=await paged(()=>supabase.from('sims_assessments').select('id,company_id,standard_id,assessment_year,created_at').eq('standard_id',st.data.id).in('assessment_year',[Number(year),Number(year)-1]));
      const items=await byIds('sims_assessment_items','id,assessment_id,indicator_id,self_status,verifier_status,updated_at','assessment_id',assessments.map(a=>a.id));
      const itemIds=items.map(i=>i.id),indicatorIds=items.map(i=>i.indicator_id);
      const [indicators,actions,evidence,certifications,audits]=await Promise.all([
        optional('Indicators',()=>byIds('sims_indicators','id,code,description,criterion_id','id',indicatorIds),softErrors),
        optional('Action Plan',()=>byIds('sims_action_plans','id,assessment_item_id,status,priority,deadline,verifier_status,updated_at','assessment_item_id',itemIds),softErrors),
        optional('Evidence',()=>byIds('sims_evidence','id,assessment_item_id,uploaded_at','assessment_item_id',itemIds),softErrors),
        optional('Certification',()=>paged(()=>supabase.from('certifications').select('id,company_id,standard,certificate_number,status,valid_until')),softErrors),
        optional('Audit',()=>paged(()=>supabase.from('audit_events').select('id,company_id,audit_type,title,start_date,status')),softErrors),
      ]);
      setData({companies:co.data||[],assessments,items,indicators,actions,evidence,certifications,audits});setSoft(softErrors);
    }catch(e){setError(e.message||String(e));setSoft(softErrors)}finally{setLoading(false)}
  }

  const companyMap=useMemo(()=>Object.fromEntries(data.companies.map(c=>[c.id,c])),[data.companies]);
  const assessmentMap=useMemo(()=>Object.fromEntries(data.assessments.map(a=>[a.id,a])),[data.assessments]);
  const indicatorMap=useMemo(()=>Object.fromEntries(data.indicators.map(i=>[i.id,i])),[data.indicators]);
  const itemMap=useMemo(()=>Object.fromEntries(data.items.map(i=>[i.id,i])),[data.items]);
  const evidenceSet=useMemo(()=>new Set(data.evidence.map(e=>e.assessment_item_id)),[data.evidence]);

  const warnings=useMemo(()=>{
    const out=[];let n=0;const add=x=>out.push({id:`w${++n}`,...x});
    const company=id=>{const c=companyMap[id];return c?`${c.company_code} — ${c.company_name}`:'Unknown PT'};
    const aOf=i=>assessmentMap[i?.assessment_id];const companyId=i=>aOf(i)?.company_id||null;const yOf=i=>Number(aOf(i)?.assessment_year||0);
    const current=data.items.filter(i=>yOf(i)===Number(year)),previous=data.items.filter(i=>yOf(i)===Number(year)-1);
    const previousGap=new Set(previous.filter(i=>i.self_status==='Not Fulfilled').map(i=>`${companyId(i)}|${i.indicator_id}`));
    const assessedCompanies=new Set(data.assessments.filter(a=>Number(a.assessment_year)===Number(year)).map(a=>a.company_id));

    data.companies.forEach(c=>{if(!assessedCompanies.has(c.id))add({severity:'High',category:'Coverage',companyId:c.id,company:company(c.id),title:'NDPE assessment belum tersedia',detail:`Belum ada assessment NDPE ${year}.`,date:null,link:'/sims/assessment'})});
    current.forEach(i=>{const cid=companyId(i),ind=indicatorMap[i.indicator_id]||{},code=ind.code||'NDPE';
      if(i.verifier_status==='Need Revision')add({severity:'High',category:'Verification',companyId:cid,company:company(cid),title:'Verification needs revision',detail:`${code} · ${clip(ind.description)}`,date:null,link:'/sims/assessment'});
      if(i.self_status==='Fulfilled'&&!evidenceSet.has(i.id))add({severity:'Medium',category:'Evidence',companyId:cid,company:company(cid),title:'Fulfilled tanpa evidence',detail:`${code} · ${clip(ind.description)}`,date:null,link:'/sims/assessment'});
      if(i.self_status==='Not Fulfilled'&&previousGap.has(`${cid}|${i.indicator_id}`))add({severity:'High',category:'Repeated Gap',companyId:cid,company:company(cid),title:'Gap berulang antar tahun',detail:`${code} masih Not Fulfilled pada ${year-1} dan ${year}.`,date:null,link:'/sims/action-plan'});
    });
    data.actions.forEach(a=>{const i=itemMap[a.assessment_item_id];if(!i||yOf(i)!==Number(year)||!isOpen(a.status))return;const cid=companyId(i),ind=indicatorMap[i.indicator_id]||{},code=ind.code||'NDPE',d=daysUntil(a.deadline);
      if(d!==null&&d<0)add({severity:a.priority==='Critical'||d<=-30?'Critical':'High',category:'Action Plan',companyId:cid,company:company(cid),title:'Action Plan overdue',detail:`${code} · overdue ${Math.abs(d)} hari · ${a.priority||'Normal'} priority.`,date:a.deadline,link:'/sims/action-plan'});
      else if(d!==null&&d<=14)add({severity:a.priority==='Critical'||d<=3?'High':'Medium',category:'Action Plan',companyId:cid,company:company(cid),title:'Action Plan mendekati deadline',detail:`${code} · ${d===0?'jatuh tempo hari ini':`${d} hari lagi`}.`,date:a.deadline,link:'/sims/action-plan'});
      else if(a.priority==='Critical')add({severity:'High',category:'Action Plan',companyId:cid,company:company(cid),title:'Critical Action masih terbuka',detail:`${code} · status ${a.status||'Open'}.`,date:a.deadline||null,link:'/sims/action-plan'});
      if(a.verifier_status==='Need Revision')add({severity:'High',category:'Verification',companyId:cid,company:company(cid),title:'Action verification needs revision',detail:`${code} · corrective action perlu revisi.`,date:a.deadline||null,link:'/sims/action-plan'});
    });
    data.certifications.forEach(c=>{const d=daysUntil(c.valid_until),cid=c.company_id||null,label=c.standard||'Certification';
      if((d!==null&&d<0)||c.status==='Expired')add({severity:'Critical',category:'Certification',companyId:cid,company:company(cid),title:'Certificate expired',detail:`${label}${c.certificate_number?` · ${c.certificate_number}`:''}`,date:c.valid_until||null,link:'/certificates'});
      else if(d!==null&&d<=90)add({severity:d<=30?'High':'Medium',category:'Certification',companyId:cid,company:company(cid),title:'Certificate mendekati expiry',detail:`${label} · ${d} hari menuju expiry.`,date:c.valid_until,link:'/certificates'});
    });
    data.audits.forEach(a=>{if(['Done','Cancelled'].includes(a.status))return;const d=daysUntil(a.start_date);if(d===null)return;const cid=a.company_id||null,label=a.title||a.audit_type||'Audit';
      if(d<0)add({severity:'High',category:'Audit',companyId:cid,company:company(cid),title:'Audit schedule sudah terlewati',detail:`${label} · ${Math.abs(d)} hari lalu · status ${a.status||'Open'}.`,date:a.start_date,link:'/audits'});
      else if(d<=30)add({severity:d<=7?'High':'Medium',category:'Audit',companyId:cid,company:company(cid),title:'Upcoming audit',detail:`${label} · ${d===0?'hari ini':`${d} hari lagi`}.`,date:a.start_date,link:'/audits'});
    });
    return out.sort((a,b)=>ORDER[a.severity]-ORDER[b.severity]||String(a.company).localeCompare(String(b.company)));
  },[data,year,companyMap,assessmentMap,indicatorMap,itemMap,evidenceSet]);

  const categories=useMemo(()=>[...new Set(warnings.map(w=>w.category))].sort(),[warnings]);
  const filtered=useMemo(()=>warnings.filter(w=>(companyFilter==='All'||w.companyId===companyFilter)&&(severityFilter==='All'||w.severity===severityFilter)&&(categoryFilter==='All'||w.category===categoryFilter)),[warnings,companyFilter,severityFilter,categoryFilter]);
  const stats=useMemo(()=>({critical:warnings.filter(w=>w.severity==='Critical').length,high:warnings.filter(w=>w.severity==='High').length,medium:warnings.filter(w=>w.severity==='Medium').length,affected:new Set(warnings.map(w=>w.companyId).filter(Boolean)).size}),[warnings]);
  function exportCSV(){const rows=[['Severity','Category','Company','Title','Detail','Date'],...filtered.map(w=>[w.severity,w.category,w.company,w.title,w.detail,w.date||''])];const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=`SMD-Early-Warning-${year}.csv`;a.click();URL.revokeObjectURL(u)}

  return <main className="page-wrap"><style>{styles}</style>
    <section className="ewsHero"><div><span>PREVENTIVE SUSTAINABILITY MANAGEMENT</span><h1>Early Warning System</h1><p>Mendeteksi risiko operasional dari data live SMD sebelum menjadi overdue, audit issue, atau compliance gap yang terlambat ditangani.</p></div><div className="actions"><label>Year<select value={year} onChange={e=>setYear(Number(e.target.value))}>{[currentYear+1,currentYear,currentYear-1,currentYear-2].map(y=><option key={y}>{y}</option>)}</select></label><button onClick={load}>Refresh</button><button className="primary" onClick={exportCSV} disabled={!filtered.length}>Export CSV</button></div></section>
    {error?<div className="error"><strong>Load failed:</strong> {error}</div>:null}{soft.length?<div className="soft">Sebagian sumber data tidak tersedia: {soft.join(' · ')}</div>:null}
    <section className="kpis"><K label="Critical" value={loading?'…':stats.critical}/><K label="High" value={loading?'…':stats.high}/><K label="Medium" value={loading?'…':stats.medium}/><K label="PT Affected" value={loading?'…':stats.affected}/></section>
    <section className="panel"><div className="toolbar"><select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}><option value="All">All PT</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select><select value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)}><option>All</option><option>Critical</option><option>High</option><option>Medium</option></select><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option>All</option>{categories.map(c=><option key={c}>{c}</option>)}</select><strong>{filtered.length} warning</strong></div>
      <div className="list">{loading?<div className="empty">Loading warning engine…</div>:filtered.length?filtered.map(w=><div key={w.id} className={`row ${w.severity.toLowerCase()}`}><div className="sev">{w.severity}</div><div className="body"><div className="meta">{w.category} · {w.company}</div><h3>{w.title}</h3><p>{w.detail}</p>{w.date?<small>Date: {w.date}</small>:null}</div><Link href={w.link}>Open →</Link></div>):<div className="empty">Tidak ada warning untuk filter ini.</div>}</div>
    </section>
  </main>;
}
function K({label,value}){return <div className="kpi"><span>{label}</span><strong>{value}</strong></div>}
const styles=`.ewsHero{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:18px}.ewsHero span{font-size:10px;font-weight:900;letter-spacing:.12em;color:#6e7e75}.ewsHero h1{margin:5px 0 7px;font-size:28px;color:#163d2b}.ewsHero p{margin:0;max-width:760px;color:#6c7d73}.actions{display:flex;gap:8px;align-items:end}.actions label{display:flex;flex-direction:column;font-size:10px;font-weight:800;color:#617169}.actions select,.actions button,.toolbar select{height:40px;border:1px solid #d7e3db;border-radius:10px;background:#fff;padding:0 12px}.actions button{cursor:pointer;font-weight:800}.actions .primary{background:#173f2d;color:#fff;border-color:#173f2d}.error,.soft{padding:11px 13px;border-radius:10px;margin-bottom:12px;font-size:12px}.error{background:#fff0f0;color:#9b2c2c;border:1px solid #f1caca}.soft{background:#fff8e8;color:#765b18;border:1px solid #ecdba7}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.kpi,.panel{background:#fff;border:1px solid #dce7e0;border-radius:14px;box-shadow:0 5px 18px rgba(24,64,43,.05)}.kpi{padding:15px}.kpi span{font-size:11px;color:#73837a;font-weight:800}.kpi strong{display:block;font-size:28px;margin-top:4px;color:#173f2d}.panel{padding:16px}.toolbar{display:grid;grid-template-columns:1.2fr .7fr .8fr auto;gap:10px;align-items:center;margin-bottom:14px}.toolbar strong{text-align:right;color:#557064}.list{display:flex;flex-direction:column;gap:9px}.row{display:grid;grid-template-columns:78px 1fr auto;gap:12px;align-items:center;border:1px solid #e1e9e4;border-radius:12px;padding:12px}.row.critical{border-left:5px solid #b42318}.row.high{border-left:5px solid #d97706}.row.medium{border-left:5px solid #ca8a04}.sev{font-size:10px;font-weight:900;text-transform:uppercase}.body h3{margin:2px 0 4px;font-size:14px;color:#234a36}.body p{margin:0;font-size:12px;color:#65766c}.meta,.body small{font-size:10px;color:#87958d}.row a{font-size:11px;font-weight:900;color:#1d6543}.empty{text-align:center;padding:32px;color:#819087}@media(max-width:950px){.ewsHero{flex-direction:column;align-items:stretch}.actions{flex-wrap:wrap}.kpis{grid-template-columns:repeat(2,1fr)}.toolbar{grid-template-columns:1fr 1fr}.row{grid-template-columns:1fr}.row a{justify-self:start}}`;
