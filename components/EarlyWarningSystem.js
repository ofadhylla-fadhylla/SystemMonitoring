'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';

const SEVERITY_ORDER={Critical:0,High:1,Medium:2,Low:3};
const OPEN_ACTION=s=>!['Completed','Closed'].includes(s||'Open');
const fmt=n=>Number(n||0).toLocaleString('en-US');
const short=(v,n=115)=>{const s=String(v||'');return s.length>n?`${s.slice(0,n-1)}…`:s};

function daysUntil(date){
  if(!date)return null;
  const d=new Date(`${String(date).slice(0,10)}T00:00:00`);
  if(Number.isNaN(d.getTime()))return null;
  const t=new Date();t.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}

async function fetchPaged(makeQuery,pageSize=1000){
  const all=[];let from=0;
  while(true){
    const res=await makeQuery().range(from,from+pageSize-1);
    if(res.error)throw res.error;
    const rows=res.data||[];all.push(...rows);
    if(rows.length<pageSize)break;
    from+=pageSize;
  }
  return all;
}

async function fetchByIds(table,columns,field,ids,chunkSize=200){
  const uniq=[...new Set((ids||[]).filter(Boolean))];
  if(!uniq.length)return [];
  const out=[];
  for(let i=0;i<uniq.length;i+=chunkSize){
    const part=uniq.slice(i,i+chunkSize);
    const rows=await fetchPaged(()=>supabase.from(table).select(columns).in(field,part));
    out.push(...rows);
  }
  return out;
}

export default function EarlyWarningSystem(){
  const currentYear=new Date().getFullYear();
  const [year,setYear]=useState(currentYear);
  const [companyFilter,setCompanyFilter]=useState('All');
  const [severityFilter,setSeverityFilter]=useState('All');
  const [categoryFilter,setCategoryFilter]=useState('All');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [data,setData]=useState({companies:[],standard:null,assessments:[],items:[],indicators:[],actions:[],evidence:[],certifications:[],audits:[]});

  useEffect(()=>{load()},[year]);

  async function load(){
    const ce=getSupabaseConfigError();
    if(ce||!supabase){setError(ce||'Supabase is not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const [co,st,certs,audits]=await Promise.all([
        supabase.from('companies').select('id,company_code,company_name,region,province,status').eq('status','Active').order('company_code'),
        supabase.from('sims_standards').select('id,code,name,status').eq('code','NDPE-IMIS-KPN').eq('status','Active').maybeSingle(),
        fetchPaged(()=>supabase.from('certifications').select('*')),
        fetchPaged(()=>supabase.from('audit_events').select('*')),
      ]);
      if(co.error||st.error)throw(co.error||st.error);
      if(!st.data)throw new Error('NDPE-IMIS-KPN master belum tersedia.');

      const assessments=await fetchPaged(()=>supabase.from('sims_assessments')
        .select('id,company_id,standard_id,assessment_year,created_at')
        .eq('standard_id',st.data.id)
        .in('assessment_year',[Number(year),Number(year)-1]));
      const assessmentIds=assessments.map(x=>x.id);
      const items=await fetchByIds('sims_assessment_items','id,assessment_id,indicator_id,self_status,verifier_status,updated_at','assessment_id',assessmentIds);
      const itemIds=items.map(x=>x.id);
      const indicatorIds=items.map(x=>x.indicator_id);
      const [indicators,actions,evidence]=await Promise.all([
        fetchByIds('sims_indicators','id,code,description,criterion_id','id',indicatorIds),
        fetchByIds('sims_action_plans','id,assessment_item_id,status,priority,deadline,verifier_status,updated_at','assessment_item_id',itemIds),
        fetchByIds('sims_evidence','id,assessment_item_id,created_at','assessment_item_id',itemIds),
      ]);
      setData({companies:co.data||[],standard:st.data,assessments,items,indicators,actions,evidence,certifications:certs||[],audits:audits||[]});
    }catch(e){setError(e.message||String(e));}
    finally{setLoading(false);}
  }

  const companyMap=useMemo(()=>Object.fromEntries(data.companies.map(c=>[c.id,c])),[data.companies]);
  const assessmentMap=useMemo(()=>Object.fromEntries(data.assessments.map(a=>[a.id,a])),[data.assessments]);
  const indicatorMap=useMemo(()=>Object.fromEntries(data.indicators.map(i=>[i.id,i])),[data.indicators]);
  const evidenceSet=useMemo(()=>new Set(data.evidence.map(e=>e.assessment_item_id)),[data.evidence]);
  const itemMap=useMemo(()=>Object.fromEntries(data.items.map(i=>[i.id,i])),[data.items]);

  const warnings=useMemo(()=>{
    const out=[];let seq=0;
    const add=w=>out.push({id:`w${++seq}`,...w});
    const companyLabel=id=>{const c=companyMap[id];return c?`${c.company_code} — ${c.company_name}`:'Unknown PT'};
    const itemCompany=item=>assessmentMap[item?.assessment_id]?.company_id||null;
    const itemYear=item=>Number(assessmentMap[item?.assessment_id]?.assessment_year||0);
    const currentItems=data.items.filter(i=>itemYear(i)===Number(year));
    const previousItems=data.items.filter(i=>itemYear(i)===Number(year)-1);
    const previousGap=new Set(previousItems.filter(i=>i.self_status==='Not Fulfilled').map(i=>`${itemCompany(i)}|${i.indicator_id}`));
    const currentAssessmentCompanies=new Set(data.assessments.filter(a=>Number(a.assessment_year)===Number(year)).map(a=>a.company_id));

    for(const c of data.companies){
      if(!currentAssessmentCompanies.has(c.id))add({severity:'High',category:'Coverage',companyId:c.id,company:companyLabel(c.id),title:'NDPE assessment belum tersedia',detail:`Belum ada NDPE assessment ${year} untuk PT ini. Monitoring compliance dan gap belum memiliki baseline tahun berjalan.`,date:null,days:null,link:'/sims/assessment',source:'SIMS'});
    }

    for(const item of currentItems){
      const companyId=itemCompany(item);const ind=indicatorMap[item.indicator_id]||{};const code=ind.code||'NDPE';
      if(item.verifier_status==='Need Revision')add({severity:'High',category:'Verification',companyId,company:companyLabel(companyId),title:'Verification needs revision',detail:`${code} · ${short(ind.description)} — verifier meminta revisi.`,date:null,days:null,link:'/sims/assessment',source:'SIMS'});
      if(item.self_status==='Fulfilled'&&!evidenceSet.has(item.id))add({severity:'Medium',category:'Evidence',companyId,company:companyLabel(companyId),title:'Fulfilled tanpa evidence',detail:`${code} · ${short(ind.description)} — status Fulfilled tetapi belum ada evidence pada assessment item.`,date:null,days:null,link:'/sims/assessment',source:'SIMS'});
      if(item.self_status==='Not Fulfilled'&&previousGap.has(`${companyId}|${item.indicator_id}`))add({severity:'High',category:'Repeated Gap',companyId,company:companyLabel(companyId),title:'Gap berulang antar tahun',detail:`${code} · ${short(ind.description)} — Not Fulfilled pada ${year-1} dan masih Not Fulfilled pada ${year}.`,date:null,days:null,link:'/sims/action-plan',source:'SIMS'});
    }

    for(const a of data.actions){
      const item=itemMap[a.assessment_item_id];if(!item||itemYear(item)!==Number(year)||!OPEN_ACTION(a.status))continue;
      const companyId=itemCompany(item);const ind=indicatorMap[item.indicator_id]||{};const code=ind.code||'NDPE';const d=daysUntil(a.deadline);
      if(d!==null&&d<0){
        add({severity:a.priority==='Critical'||d<=-30?'Critical':'High',category:'Action Plan',companyId,company:companyLabel(companyId),title:'Action Plan overdue',detail:`${code} · ${a.priority||'Normal'} priority · overdue ${Math.abs(d)} hari.`,date:a.deadline,days:d,link:'/sims/action-plan',source:'SIMS'});
      }else if(d!==null&&d<=14){
        add({severity:a.priority==='Critical'||d<=3?'High':'Medium',category:'Action Plan',companyId,company:companyLabel(companyId),title:'Action Plan mendekati deadline',detail:`${code} · ${a.priority||'Normal'} priority · ${d===0?'jatuh tempo hari ini':`${d} hari lagi`}.`,date:a.deadline,days:d,link:'/sims/action-plan',source:'SIMS'});
      }else if(a.priority==='Critical'){
        add({severity:'High',category:'Action Plan',companyId,company:companyLabel(companyId),title:'Critical Action masih terbuka',detail:`${code} · action berprioritas Critical masih berstatus ${a.status||'Open'}.`,date:a.deadline||null,days:d,link:'/sims/action-plan',source:'SIMS'});
      }
      if(a.verifier_status==='Need Revision'&&item.verifier_status!=='Need Revision')add({severity:'High',category:'Verification',companyId,company:companyLabel(companyId),title:'Action verification needs revision',detail:`${code} · corrective action perlu revisi sebelum dapat ditutup.`,date:a.deadline||null,days:d,link:'/sims/action-plan',source:'SIMS'});
    }

    for(const c of data.certifications){
      const companyId=c.company_id||null;const d=daysUntil(c.valid_until);const standard=c.standard||c.scheme||'Certification';
      if((d!==null&&d<0)||c.status==='Expired')add({severity:'Critical',category:'Certification',companyId,company:companyLabel(companyId),title:'Certificate expired',detail:`${standard}${c.certificate_number?` · ${c.certificate_number}`:''} — masa berlaku telah berakhir.`,date:c.valid_until||null,days:d,link:'/certificates',source:'Certification'});
      else if(d!==null&&d>=0&&d<=90)add({severity:d<=30?'High':'Medium',category:'Certification',companyId,company:companyLabel(companyId),title:'Certificate mendekati expiry',detail:`${standard}${c.certificate_number?` · ${c.certificate_number}`:''} — ${d} hari menuju expiry.`,date:c.valid_until,days:d,link:'/certificates',source:'Certification'});
    }

    for(const a of data.audits){
      if(['Done','Cancelled'].includes(a.status))continue;
      const d=daysUntil(a.start_date);if(d===null)continue;
      const companyId=a.company_id||null;const label=a.standard||a.audit_type||a.audit_name||'Audit';
      if(d<0)add({severity:'High',category:'Audit',companyId,company:companyLabel(companyId),title:'Audit schedule sudah terlewati',detail:`${label} · jadwal ${Math.abs(d)} hari lalu tetapi status masih ${a.status||'Open'}.`,date:a.start_date,days:d,link:'/audits',source:'Audit'});
      else if(d<=30)add({severity:d<=7?'High':'Medium',category:'Audit',companyId,company:companyLabel(companyId),title:'Upcoming audit',detail:`${label} · ${d===0?'audit hari ini':`${d} hari lagi`} · status ${a.status||'Planned'}.`,date:a.start_date,days:d,link:'/audits',source:'Audit'});
    }

    return out.sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]||(a.days??9999)-(b.days??9999)||a.company.localeCompare(b.company));
  },[data,year,companyMap,assessmentMap,indicatorMap,evidenceSet,itemMap]);

  const categories=useMemo(()=>[...new Set(warnings.map(w=>w.category))].sort(),[warnings]);
  const filtered=useMemo(()=>warnings.filter(w=>(companyFilter==='All'||w.companyId===companyFilter)&&(severityFilter==='All'||w.severity===severityFilter)&&(categoryFilter==='All'||w.category===categoryFilter)),[warnings,companyFilter,severityFilter,categoryFilter]);
  const stats=useMemo(()=>({
    total:warnings.length,
    critical:warnings.filter(w=>w.severity==='Critical').length,
    high:warnings.filter(w=>w.severity==='High').length,
    medium:warnings.filter(w=>w.severity==='Medium').length,
    affected:new Set(warnings.map(w=>w.companyId).filter(Boolean)).size,
  }),[warnings]);
  const ruleCounts=useMemo(()=>({
    action:warnings.filter(w=>w.category==='Action Plan').length,
    verification:warnings.filter(w=>w.category==='Verification').length,
    evidence:warnings.filter(w=>w.category==='Evidence').length,
    repeated:warnings.filter(w=>w.category==='Repeated Gap').length,
    certification:warnings.filter(w=>w.category==='Certification').length,
    audit:warnings.filter(w=>w.category==='Audit').length,
    coverage:warnings.filter(w=>w.category==='Coverage').length,
  }),[warnings]);

  function exportCSV(){
    const rows=[['Severity','Category','Company','Title','Detail','Date','Days','Source'],...filtered.map(w=>[w.severity,w.category,w.company,w.title,w.detail,w.date||'',w.days??'',w.source])];
    const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`SMD-Early-Warning-${year}.csv`;a.click();URL.revokeObjectURL(url);
  }

  return <main className="page-wrap ews-wrap">
    <style>{styles}</style>
    <section className="ews-hero">
      <div><span className="ews-eyebrow">PREVENTIVE SUSTAINABILITY MANAGEMENT</span><h1>Early Warning System</h1><p>Rule-based warning engine yang membaca data live SMD untuk mengangkat risiko sebelum menjadi overdue, audit issue, atau compliance gap yang terlambat ditangani.</p></div>
      <div className="ews-hero-actions"><label><span>Monitoring Year</span><select value={year} onChange={e=>setYear(Number(e.target.value))}>{[currentYear+1,currentYear,currentYear-1,currentYear-2].map(y=><option key={y} value={y}>{y}</option>)}</select></label><button onClick={load}>Refresh</button><button className="accent" onClick={exportCSV} disabled={!filtered.length}>Export Warning CSV</button></div>
    </section>

    {error?<div className="ews-error"><strong>Data connection issue</strong><span>{error}</span></div>:null}

    <section className="ews-kpis">
      <KPI label="Critical" value={loading?'…':stats.critical} hint="Immediate management attention" tone="critical"/>
      <KPI label="High" value={loading?'…':stats.high} hint="Needs near-term action" tone="high"/>
      <KPI label="Medium" value={loading?'…':stats.medium} hint="Preventive follow-up" tone="medium"/>
      <KPI label="PT Affected" value={loading?'…':stats.affected} hint={`${stats.total} total warnings`} />
    </section>

    <section className="ews-grid">
      <div className="ews-card focus-card"><div className="ews-card-head"><div><span>MANAGEMENT FOCUS</span><h2>Top Priority</h2></div><strong>{warnings.slice(0,5).length}</strong></div><div className="focus-list">{loading?<Empty text="Loading warning engine…"/>:warnings.slice(0,5).length?warnings.slice(0,5).map(w=><WarningMini key={w.id} w={w}/>):<Empty text="Tidak ada warning prioritas pada data saat ini."/>}</div></div>
      <div className="ews-card"><div className="ews-card-head"><div><span>RULE ENGINE</span><h2>Active Detection Rules</h2></div><strong>7</strong></div><div className="rule-grid"><Rule name="Action overdue / due ≤14d" count={ruleCounts.action}/><Rule name="Need Revision" count={ruleCounts.verification}/><Rule name="Fulfilled without evidence" count={ruleCounts.evidence}/><Rule name="Repeated NDPE gap" count={ruleCounts.repeated}/><Rule name="Certificate ≤90d / expired" count={ruleCounts.certification}/><Rule name="Audit ≤30d / passed" count={ruleCounts.audit}/><Rule name="Missing annual assessment" count={ruleCounts.coverage}/></div></div>
    </section>

    <section className="ews-card warnings-card">
      <div className="ews-card-head warning-head"><div><span>LIVE WARNING REGISTER</span><h2>Preventive Alerts</h2><p>{filtered.length} of {warnings.length} warning(s) shown</p></div><div className="ews-filters"><select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}><option value="All">All PT</option>{data.companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select><select value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)}><option value="All">All Severity</option><option>Critical</option><option>High</option><option>Medium</option></select><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="All">All Category</option>{categories.map(c=><option key={c}>{c}</option>)}</select></div></div>
      <div className="warning-table">{loading?<Empty text="Loading warning register…"/>:filtered.length?filtered.map(w=><WarningRow key={w.id} w={w}/>):<Empty text="Tidak ada warning untuk filter yang dipilih."/>}</div>
    </section>

    <section className="ews-note"><strong>How to read this page</strong><span>Early Warning ini bersifat rule-based dan menggunakan data yang sudah tersimpan di SMD. Severity adalah prioritas operasional internal, bukan kesimpulan audit atau sertifikasi. Setelah sumber data diperbarui atau action ditutup, warning akan berubah otomatis saat halaman direfresh.</span></section>
  </main>
}

function KPI({label,value,hint,tone=''}){return <div className={`ews-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>}
function Rule({name,count}){return <div className="rule"><span>{name}</span><strong>{fmt(count)}</strong></div>}
function Empty({text}){return <div className="ews-empty">{text}</div>}
function Severity({value}){return <span className={`severity ${String(value).toLowerCase()}`}>{value}</span>}
function WarningMini({w}){return <Link href={w.link} className="focus-item"><Severity value={w.severity}/><div><strong>{w.title}</strong><span>{w.company}</span><small>{w.detail}</small></div></Link>}
function WarningRow({w}){return <div className="warning-row"><div className="warning-sev"><Severity value={w.severity}/><span>{w.category}</span></div><div className="warning-main"><strong>{w.title}</strong><span>{w.company}</span><p>{w.detail}</p></div><div className="warning-meta"><span>{w.date||'No fixed date'}</span>{w.days!==null&&w.days!==undefined?<small>{w.days<0?`${Math.abs(w.days)}d overdue`:w.days===0?'Today':`${w.days}d remaining`}</small>:<small>{w.source}</small>}</div><Link href={w.link} className="open-link">Open →</Link></div>}

const styles=`
.ews-wrap{padding-top:24px;padding-bottom:48px;color:#173f2d}.ews-hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:18px;padding:24px;border-radius:18px;background:linear-gradient(120deg,#123d2c,#1f5a3d);color:white;box-shadow:0 12px 30px rgba(14,57,38,.14)}.ews-eyebrow{font-size:10px;letter-spacing:.18em;font-weight:900;color:#d7f36a}.ews-hero h1{margin:6px 0 8px;font-size:30px}.ews-hero p{margin:0;max-width:760px;color:#d6e4dc;font-size:13px;line-height:1.6}.ews-hero-actions{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;justify-content:flex-end}.ews-hero-actions label{display:flex;flex-direction:column;gap:5px}.ews-hero-actions label span{font-size:9px;font-weight:800;color:#b8d1c1}.ews-hero select,.ews-hero button{height:39px;border-radius:10px;border:1px solid rgba(255,255,255,.22);padding:0 12px;font:inherit;font-size:12px}.ews-hero select{background:#fff;color:#173f2d}.ews-hero button{background:rgba(255,255,255,.1);color:#fff;cursor:pointer}.ews-hero button.accent{background:#d7f36a;color:#173f2d;border-color:#d7f36a;font-weight:900}.ews-hero button:disabled{opacity:.5;cursor:not-allowed}.ews-error{display:flex;gap:8px;align-items:center;padding:11px 14px;border:1px solid #f1c4c4;background:#fff6f6;color:#8c2e2e;border-radius:12px;margin-bottom:16px;font-size:12px}.ews-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.ews-kpi{background:#fff;border:1px solid #dce8e0;border-radius:14px;padding:16px;box-shadow:0 4px 14px rgba(31,69,47,.04)}.ews-kpi span{font-size:10px;font-weight:900;color:#718379;text-transform:uppercase;letter-spacing:.08em}.ews-kpi strong{display:block;font-size:27px;margin:6px 0 3px}.ews-kpi small{font-size:10px;color:#829187}.ews-kpi.critical{border-top:4px solid #a92b2b}.ews-kpi.critical strong{color:#a92b2b}.ews-kpi.high{border-top:4px solid #d16e1f}.ews-kpi.high strong{color:#a85516}.ews-kpi.medium{border-top:4px solid #d7ad1f}.ews-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;margin-bottom:14px}.ews-card{background:#fff;border:1px solid #dce8e0;border-radius:16px;padding:18px;box-shadow:0 5px 18px rgba(24,64,43,.045)}.ews-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.ews-card-head>div>span{font-size:9px;font-weight:900;letter-spacing:.13em;color:#759082}.ews-card-head h2{margin:4px 0 0;font-size:17px}.ews-card-head>strong{font-size:24px;color:#315b45}.focus-list{display:flex;flex-direction:column;gap:8px}.focus-item{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:11px;border:1px solid #e4ece7;border-radius:12px;color:inherit;text-decoration:none}.focus-item:hover{background:#f8fbf9}.focus-item div{display:flex;flex-direction:column;gap:2px}.focus-item strong{font-size:12px}.focus-item span{font-size:10px;color:#5d7668}.focus-item small{font-size:10px;color:#819087;line-height:1.4}.severity{display:inline-flex;align-items:center;justify-content:center;height:23px;padding:0 8px;border-radius:999px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}.severity.critical{background:#ffe7e7;color:#a21f1f}.severity.high{background:#fff0df;color:#ad5817}.severity.medium{background:#fff8d8;color:#8f7412}.severity.low{background:#eaf5ef;color:#2d6e4b}.rule-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rule{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px;border-radius:11px;background:#f7faf8;border:1px solid #e5eee8}.rule span{font-size:10.5px;color:#51695c}.rule strong{font-size:16px}.warning-head{align-items:end}.warning-head p{margin:4px 0 0;font-size:10px;color:#839188}.ews-filters{display:flex;gap:8px;flex-wrap:wrap}.ews-filters select{height:36px;border:1px solid #d8e5dc;border-radius:9px;background:#fff;padding:0 10px;font:inherit;font-size:11px;color:#294c39}.warning-table{display:flex;flex-direction:column}.warning-row{display:grid;grid-template-columns:120px minmax(260px,1fr) 140px 70px;gap:12px;align-items:center;padding:13px 4px;border-top:1px solid #e9efeb}.warning-row:first-child{border-top:0}.warning-sev{display:flex;flex-direction:column;align-items:flex-start;gap:5px}.warning-sev>span:last-child{font-size:9px;color:#70847a}.warning-main strong{font-size:12px}.warning-main>span{display:block;font-size:10px;color:#4e725e;margin-top:2px}.warning-main p{margin:4px 0 0;font-size:10.5px;color:#77867e;line-height:1.45}.warning-meta{display:flex;flex-direction:column;gap:3px;font-size:10px;color:#51685b}.warning-meta small{color:#89968f}.open-link{font-size:10px;font-weight:900;color:#225f40;text-decoration:none;text-align:right}.ews-empty{padding:28px;text-align:center;color:#89978f;font-size:11px;border:1px dashed #dce7df;border-radius:12px}.ews-note{margin-top:14px;padding:13px 15px;border-radius:12px;background:#f3f7f4;border:1px solid #dde8e0;display:flex;gap:12px;font-size:10.5px;color:#667a6e;line-height:1.5}.ews-note strong{color:#315a44;white-space:nowrap}
@media(max-width:1100px){.ews-hero{align-items:flex-start;flex-direction:column}.ews-hero-actions{justify-content:flex-start}.ews-kpis{grid-template-columns:repeat(2,1fr)}.ews-grid{grid-template-columns:1fr}.warning-row{grid-template-columns:100px 1fr 120px 55px}}
@media(max-width:720px){.ews-wrap{padding-left:14px!important;padding-right:14px!important}.ews-kpis{grid-template-columns:1fr 1fr}.ews-hero{padding:18px}.ews-hero h1{font-size:24px}.warning-head{align-items:flex-start;flex-direction:column}.warning-row{grid-template-columns:1fr;gap:7px;padding:14px 2px}.warning-sev{flex-direction:row;align-items:center}.warning-meta{flex-direction:row}.open-link{text-align:left}.rule-grid{grid-template-columns:1fr}.ews-note{flex-direction:column}}
`;
