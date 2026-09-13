'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';
import { daysUntil, formatDate } from '../../lib/monitoring';

export default function Company360(){
  const [data,setData]=useState({companies:[],sites:[],certifications:[],audits:[],grievances:[],actions:[],simsAssessments:[],simsItems:[],simsStandards:[],suppliers:[],riskAssessments:[]});
  const [companyId,setCompanyId]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{loadAll()},[]);

  async function loadAll(){
    const ce=getSupabaseConfigError();
    if(ce||!supabase){setError(ce||'Supabase is not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    const [c,s,cert,aud,g,act,sa,si,ss,sp,ra]=await Promise.all([
      supabase.from('companies').select('*').eq('status','Active').order('company_code'),
      supabase.from('sites').select('*').eq('status','Active').order('site_name'),
      supabase.from('certifications').select('*').order('valid_until'),
      supabase.from('audit_events').select('*').order('start_date'),
      supabase.from('grievances').select('*').order('opened_date',{ascending:false}),
      supabase.from('grievance_actions').select('*').order('target_date'),
      supabase.from('sims_assessments').select('*').order('assessment_year',{ascending:false}),
      supabase.from('sims_assessment_items').select('*'),
      supabase.from('sims_standards').select('*').order('name'),
      supabase.from('spatial_suppliers').select('*').order('supplier_name'),
      supabase.from('supplier_risk_assessments').select('*').order('assessed_at',{ascending:false}),
    ]);
    const hard=c.error||s.error||cert.error||aud.error||g.error||act.error;
    if(hard)setError(hard.message);
    const next={companies:c.data||[],sites:s.data||[],certifications:cert.data||[],audits:aud.data||[],grievances:g.data||[],actions:act.data||[],simsAssessments:sa.error?[]:(sa.data||[]),simsItems:si.error?[]:(si.data||[]),simsStandards:ss.error?[]:(ss.data||[]),suppliers:sp.error?[]:(sp.data||[]),riskAssessments:ra.error?[]:(ra.data||[])};
    setData(next);
    if(!companyId&&next.companies[0])setCompanyId(next.companies[0].id);
    setLoading(false);
  }

  const company=useMemo(()=>data.companies.find(c=>c.id===companyId)||null,[data.companies,companyId]);
  const sites=useMemo(()=>data.sites.filter(s=>s.company_id===companyId),[data.sites,companyId]);
  const matchesCompany=record=>{
    if(!company)return false;
    if(record?.company_id===company.id)return true;
    const hay=`${record?.company||''} ${record?.company_code||''} ${record?.entity||''}`.toLowerCase();
    const code=String(company.company_code||'').toLowerCase();
    const name=String(company.company_name||'').toLowerCase();
    return (!!code&&hay.includes(code))||!!name&&hay.includes(name);
  };
  const certifications=useMemo(()=>data.certifications.filter(matchesCompany),[data.certifications,company]);
  const audits=useMemo(()=>data.audits.filter(matchesCompany),[data.audits,company]);
  const grievances=useMemo(()=>data.grievances.filter(matchesCompany),[data.grievances,company]);
  const grievanceIds=useMemo(()=>new Set(grievances.map(g=>g.id)),[grievances]);
  const actions=useMemo(()=>data.actions.filter(a=>grievanceIds.has(a.grievance_id)),[data.actions,grievanceIds]);
  const suppliers=useMemo(()=>data.suppliers.filter(s=>s.company_id===companyId),[data.suppliers,companyId]);

  const latestRiskBySupplier=useMemo(()=>{
    const out={};
    for(const r of data.riskAssessments){if(!out[r.supplier_id])out[r.supplier_id]=r;}
    return out;
  },[data.riskAssessments]);

  const latestSims=useMemo(()=>{
    const rows=data.simsAssessments.filter(a=>a.company_id===companyId).sort((a,b)=>Number(b.assessment_year||0)-Number(a.assessment_year||0));
    const seen=new Set();return rows.filter(a=>{if(seen.has(a.standard_id))return false;seen.add(a.standard_id);return true;});
  },[data.simsAssessments,companyId]);
  const simsIds=useMemo(()=>new Set(latestSims.map(a=>a.id)),[latestSims]);
  const simsItems=useMemo(()=>data.simsItems.filter(i=>simsIds.has(i.assessment_id)),[data.simsItems,simsIds]);
  const standardMap=useMemo(()=>Object.fromEntries(data.simsStandards.map(s=>[s.id,s])),[data.simsStandards]);

  const stats=useMemo(()=>{
    const activeCert=certifications.filter(c=>c.status==='Certified'&&(daysUntil(c.valid_until)===null||daysUntil(c.valid_until)>=0)).length;
    const expiring90=certifications.filter(c=>{const d=daysUntil(c.valid_until);return d!==null&&d>=0&&d<=90}).length;
    const expired=certifications.filter(c=>{const d=daysUntil(c.valid_until);return c.status==='Expired'||(d!==null&&d<0)}).length;
    const openGrievance=grievances.filter(g=>g.status!=='Closed').length;
    const openActions=actions.filter(a=>a.status!=='Completed').length;
    const overdueActions=actions.filter(a=>a.status!=='Completed'&&daysUntil(a.target_date)!==null&&daysUntil(a.target_date)<0).length;
    const upcomingAudits=audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&d<=30&&!['Done','Cancelled'].includes(a.status)}).length;
    const verified=simsItems.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;
    const simsCompliance=simsItems.length?Math.round(verified/simsItems.length*100):null;
    const highRisk=suppliers.filter(s=>['High','Critical'].includes(latestRiskBySupplier[s.id]?.risk_level)).length;
    return{activeCert,expiring90,expired,openGrievance,openActions,overdueActions,upcomingAudits,simsCompliance,highRisk};
  },[certifications,grievances,actions,audits,simsItems,suppliers,latestRiskBySupplier]);

  const certSummary=useMemo(()=>{
    const map={};for(const c of certifications){const k=c.standard||'Other';if(!map[k])map[k]={standard:k,total:0,active:0,expiring:0,expired:0};map[k].total++;const d=daysUntil(c.valid_until);if(c.status==='Expired'||(d!==null&&d<0))map[k].expired++;else if(d!==null&&d<=90)map[k].expiring++;else if(c.status==='Certified')map[k].active++;}
    return Object.values(map);
  },[certifications]);

  const simsSummary=useMemo(()=>latestSims.map(a=>{const items=data.simsItems.filter(i=>i.assessment_id===a.id);const verified=items.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;const gaps=items.filter(i=>i.self_status==='Not Fulfilled').length;return{assessment:a,standard:standardMap[a.standard_id]?.name||standardMap[a.standard_id]?.code||'SIMS',total:items.length,verified,gaps,pct:items.length?Math.round(verified/items.length*100):0}}),[latestSims,data.simsItems,standardMap]);

  const upcoming=useMemo(()=>audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&!['Done','Cancelled'].includes(a.status)}).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).slice(0,5),[audits]);
  const expiry=useMemo(()=>certifications.filter(c=>c.valid_until&&daysUntil(c.valid_until)>=0).sort((a,b)=>String(a.valid_until).localeCompare(String(b.valid_until))).slice(0,5),[certifications]);
  const openGrievances=useMemo(()=>grievances.filter(g=>g.status!=='Closed').slice(0,5),[grievances]);
  const riskySuppliers=useMemo(()=>suppliers.map(s=>({supplier:s,risk:latestRiskBySupplier[s.id]})).filter(x=>x.risk).sort((a,b)=>Number(b.risk.risk_score||0)-Number(a.risk.risk_score||0)).slice(0,6),[suppliers,latestRiskBySupplier]);

  const attention=useMemo(()=>{
    const rows=[];
    if(stats.expired)rows.push({tone:'danger',text:`${stats.expired} expired certificate${stats.expired===1?'':'s'}`});
    if(stats.expiring90)rows.push({tone:'warning',text:`${stats.expiring90} certificate${stats.expiring90===1?'':'s'} expire within 90 days`});
    if(stats.overdueActions)rows.push({tone:'danger',text:`${stats.overdueActions} corrective action${stats.overdueActions===1?'':'s'} overdue`});
    if(stats.openGrievance)rows.push({tone:'warning',text:`${stats.openGrievance} open grievance${stats.openGrievance===1?'':'s'}`});
    if(stats.highRisk)rows.push({tone:'danger',text:`${stats.highRisk} supplier${stats.highRisk===1?'':'s'} with High/Critical spatial risk`});
    if(!rows.length)rows.push({tone:'good',text:'No critical attention item from the connected modules.'});
    return rows;
  },[stats]);

  return <div className="page-wrap">
    <style>{`
      .c360-hero{background:linear-gradient(135deg,#0d4d34,#123d2d);color:#fff;border-radius:20px;padding:22px 24px;margin-bottom:18px;box-shadow:0 14px 34px rgba(17,57,41,.12)}.c360-hero-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.c360-hero h1{margin:0;font-size:28px}.c360-hero-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.c360-chip{font-size:10px;font-weight:800;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.12)}.c360-filter{margin-top:18px;display:grid;grid-template-columns:minmax(280px,1fr) auto;gap:10px;align-items:end}.c360-filter label{display:grid;gap:6px}.c360-filter label span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#bdd0c5;font-weight:800}.c360-filter select{height:43px;border:0;border-radius:10px;padding:0 12px;font-weight:800;color:#153c2c}.c360-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.c360-kpis .kpi-card strong{font-size:28px}.c360-attention{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px}.c360-attention span{padding:8px 10px;border-radius:10px;font-size:10.5px;font-weight:800;border:1px solid #dce8e0;background:#f6faf7;color:#2e5e45}.c360-attention .danger{background:#fff1ef;border-color:#f0c7c2;color:#9c3d35}.c360-attention .warning{background:#fff8e8;border-color:#eedba9;color:#8a6514}.c360-attention .good{background:#edf8f0;border-color:#cfe7d6;color:#267044}.c360-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;margin-bottom:18px}.c360-panel{background:#fff;border:1px solid #dce7e0;border-radius:16px;padding:18px;box-shadow:0 4px 16px rgba(24,64,43,.04)}.c360-panel h2{margin:0 0 4px;font-size:16px;color:#173e2c}.c360-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:15px}.c360-panel-head p{margin:0;color:#7a8981;font-size:11px}.c360-standard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.c360-standard{border:1px solid #e3ebe6;border-radius:12px;padding:12px;background:#fafcfb}.c360-standard>div{display:flex;justify-content:space-between;gap:8px}.c360-standard strong{font-size:12px}.c360-standard small{color:#7e8c84;font-size:9px}.c360-metrics{display:flex;gap:10px;margin-top:9px;font-size:10px;color:#67776e}.c360-metrics b{color:#173e2c}.c360-sims{display:grid;gap:11px}.c360-sims-row{border:1px solid #e3ebe6;border-radius:12px;padding:12px;background:#fafcfb}.c360-sims-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px}.c360-sims-head strong{font-size:11.5px}.c360-sims-head span{font-size:11px;font-weight:900;color:#236844}.c360-track{height:9px;background:#e8efea;border-radius:999px;overflow:hidden}.c360-track i{display:block;height:100%;background:linear-gradient(90deg,#26734c,#8bc65b);border-radius:999px}.c360-list{display:grid}.c360-list-row{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid #edf1ef}.c360-list-row:last-child{border-bottom:0}.c360-list-row strong{display:block;font-size:11px;color:#244433}.c360-list-row span{display:block;font-size:10px;color:#78877f;margin-top:3px}.c360-list-row>div:last-child{text-align:right}.c360-risk{display:grid;gap:9px}.c360-risk-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid #e3ebe6;border-radius:11px;padding:11px}.c360-risk-row strong{font-size:11px}.c360-risk-row span{font-size:10px;color:#76867d}.c360-risk-pill{font-size:9px!important;font-weight:900;padding:5px 7px;border-radius:999px;background:#edf5f0;color:#266445!important}.c360-risk-pill.high,.c360-risk-pill.critical{background:#fff0ed;color:#a34338!important}.c360-empty{padding:22px;text-align:center;color:#7e8d85;border:1px dashed #d4dfd8;border-radius:11px;font-size:11px}.c360-links{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.c360-links a{padding:11px;border-radius:10px;background:#f3f8f5;border:1px solid #dce8e0;text-align:center;font-size:10px;font-weight:800;color:#245c3e;text-decoration:none}.c360-links a:hover{background:#eaf4ee}@media(max-width:1100px){.c360-kpis{grid-template-columns:repeat(2,1fr)}.c360-grid{grid-template-columns:1fr}}@media(max-width:700px){.c360-hero-top{flex-direction:column}.c360-filter{grid-template-columns:1fr}.c360-kpis{grid-template-columns:1fr 1fr}.c360-standard-grid{grid-template-columns:1fr}.c360-links{grid-template-columns:1fr}}
    `}</style>

    <section className="c360-hero">
      <div className="c360-hero-top"><div><h1>{company?`${company.company_code} — ${company.company_name}`:'PT 360° Sustainability Profile'}</h1>{company?<div className="c360-hero-meta"><span className="c360-chip">{company.region||'Region not set'}</span><span className="c360-chip">{company.province||'Province not set'}</span><span className="c360-chip">{sites.length} active site{sites.length===1?'':'s'}</span></div>:null}</div><button className="secondary-btn" onClick={loadAll}>Refresh Data</button></div>
      <div className="c360-filter"><label><span>Select Company / PT</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}>{data.companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></label><Link className="primary-btn" href="/master-data">Open Master Company</Link></div>
    </section>

    {error?<div className="sync-error"><strong>Data issue</strong><span>{error}</span></div>:null}
    {company?<>
      <div className="c360-attention">{attention.map((x,i)=><span key={i} className={x.tone}>{x.text}</span>)}</div>
      <section className="kpi-grid c360-kpis"><KPI label="Active Certificates" value={loading?'…':stats.activeCert} hint={`${stats.expiring90} expiring ≤90 days`}/><KPI label="Upcoming Audits" value={loading?'…':stats.upcomingAudits} hint="Within 30 days"/><KPI label="Open Grievances" value={loading?'…':stats.openGrievance} hint={`${stats.openActions} open corrective actions`}/><KPI label="SIMS Compliance" value={loading?'…':stats.simsCompliance===null?'—':`${stats.simsCompliance}%`} hint="Latest assessment per standard"/><KPI label="Expired Certificates" value={loading?'…':stats.expired} hint="Immediate validity attention"/><KPI label="Overdue Actions" value={loading?'…':stats.overdueActions} hint="Corrective actions past target"/><KPI label="Spatial Supplier Risk" value={loading?'…':stats.highRisk} hint="High / Critical suppliers"/><KPI label="Active Sites" value={loading?'…':sites.length} hint="Master Company & Site"/></section>

      <section className="c360-grid"><div className="c360-panel"><div className="c360-panel-head"><div><h2>Certification Portfolio</h2><p>Certification posture for this PT.</p></div><Link className="text-link" href="/certificates">Open Monitoring →</Link></div>{certSummary.length?<div className="c360-standard-grid">{certSummary.map(x=><div className="c360-standard" key={x.standard}><div><strong>{x.standard}</strong><small>{x.total} record(s)</small></div><div className="c360-metrics"><span><b>{x.active}</b> active</span><span><b>{x.expiring}</b> expiring</span><span><b>{x.expired}</b> expired</span></div></div>)}</div>:<div className="c360-empty">No certification records for this PT.</div>}</div><div className="c360-panel"><div className="c360-panel-head"><div><h2>SIMS Compliance</h2><p>Latest ISPO / NDPE assessment by standard.</p></div><Link className="text-link" href="/sims/compliance">Compliance →</Link></div>{simsSummary.length?<div className="c360-sims">{simsSummary.map(x=><div className="c360-sims-row" key={x.assessment.id}><div className="c360-sims-head"><strong>{x.standard} · {x.assessment.assessment_year}</strong><span>{x.pct}%</span></div><div className="c360-track"><i style={{width:`${x.pct}%`}}/></div><div className="c360-metrics"><span>{x.verified}/{x.total} verified fulfilled</span><span>{x.gaps} gap(s)</span></div></div>)}</div>:<div className="c360-empty">No SIMS assessment yet.</div>}</div></section>

      <section className="c360-grid"><div className="c360-panel"><div className="c360-panel-head"><div><h2>Upcoming Audit & Certificate Expiry</h2><p>Nearest events requiring planning.</p></div></div><div className="c360-list">{upcoming.map(a=><div className="c360-list-row" key={`a-${a.id}`}><div><strong>{a.title||a.audit_type||'Audit'}</strong><span>{a.audit_type||'Audit'} · {a.status}</span></div><div><strong>{formatDate(a.start_date)}</strong><span>{daysUntil(a.start_date)} day(s)</span></div></div>)}{expiry.map(c=><div className="c360-list-row" key={`c-${c.id}`}><div><strong>{c.standard} expiry</strong><span>{c.certificate_number||'No certificate number'}</span></div><div><strong>{formatDate(c.valid_until)}</strong><span>{daysUntil(c.valid_until)} day(s)</span></div></div>)}{!upcoming.length&&!expiry.length?<div className="c360-empty">No upcoming audit or certificate expiry.</div>:null}</div></div><div className="c360-panel"><div className="c360-panel-head"><div><h2>Open Grievances</h2><p>Cases requiring follow-up.</p></div><Link className="text-link" href="/grievances">Tracker →</Link></div><div className="c360-list">{openGrievances.length?openGrievances.map(g=><Link className="c360-list-row" style={{textDecoration:'none'}} href={`/grievances/${g.case_id||g.id}`} key={g.id}><div><strong>{g.case_id||'Case'} · {g.issue_title||g.category||'Grievance'}</strong><span>{g.status}</span></div><div><strong>{Number(g.progress||0)}%</strong><span>progress</span></div></Link>):<div className="c360-empty">No open grievance.</div>}</div></div></section>

      <section className="c360-grid"><div className="c360-panel"><div className="c360-panel-head"><div><h2>Supplier Spatial Risk</h2><p>Latest saved supplier screening linked to this PT.</p></div><Link className="text-link" href="/spatial-monitoring">Spatial Monitoring →</Link></div>{riskySuppliers.length?<div className="c360-risk">{riskySuppliers.map(x=><div className="c360-risk-row" key={x.supplier.id}><div><strong>{x.supplier.supplier_name}</strong><span>{x.supplier.land_status||'Unknown land status'} · {x.supplier.province||'Province not set'}</span></div><span className={`c360-risk-pill ${String(x.risk.risk_level||'').toLowerCase()}`}>{x.risk.risk_level} · {x.risk.risk_score}/100</span></div>)}</div>:<div className="c360-empty">No saved supplier risk assessment linked to this PT.</div>}</div><div className="c360-panel"><div className="c360-panel-head"><div><h2>Quick Access</h2><p>Open the PT's main sustainability workflows.</p></div></div><div className="c360-links"><Link href="/sims/assessment">SIMS Assessment</Link><Link href="/actions">Action Monitoring</Link><Link href="/non-spatial-monitoring">Non-Spatial Monitoring</Link><Link href="/audits">Audit Monitoring</Link><Link href="/certificates">Certification</Link><Link href="/weekly-report">Weekly Report</Link></div></div></section>
    </>:<div className="c360-empty">Select a company to open its 360° profile.</div>}
  </div>
}

function KPI({label,value,hint}){return <div className="kpi-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>}
