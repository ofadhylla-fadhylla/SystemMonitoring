'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';
import { daysUntil, formatDate } from '../lib/monitoring';
import { calculateExecutiveRisk } from '../lib/riskScore';

export default function Company360V2(){
  const [data,setData]=useState({companies:[],sites:[],certifications:[],audits:[],grievances:[],actions:[],simsAssessments:[],simsItems:[],simsStandards:[],suppliers:[],riskAssessments:[],auditLog:[]});
  const [companyId,setCompanyId]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [auditAvailable,setAuditAvailable]=useState(true);

  useEffect(()=>{loadAll()},[]);

  async function loadAll(){
    const ce=getSupabaseConfigError();
    if(ce||!supabase){setError(ce||'Supabase is not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    const [c,s,cert,aud,g,act,sa,si,ss,sp,ra,al]=await Promise.all([
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
      supabase.from('audit_log').select('*').order('changed_at',{ascending:false}).limit(300),
    ]);
    const hard=c.error||s.error||cert.error||aud.error||g.error||act.error;
    if(hard)setError(hard.message);
    setAuditAvailable(!al.error);
    const next={companies:c.data||[],sites:s.data||[],certifications:cert.data||[],audits:aud.data||[],grievances:g.data||[],actions:act.data||[],simsAssessments:sa.error?[]:(sa.data||[]),simsItems:si.error?[]:(si.data||[]),simsStandards:ss.error?[]:(ss.data||[]),suppliers:sp.error?[]:(sp.data||[]),riskAssessments:ra.error?[]:(ra.data||[]),auditLog:al.error?[]:(al.data||[])};
    setData(next);
    const requested=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('company'):'';
    const valid=requested&&next.companies.some(x=>x.id===requested)?requested:'';
    setCompanyId(current=>current||valid||next.companies[0]?.id||'');
    setLoading(false);
  }

  const company=useMemo(()=>data.companies.find(c=>c.id===companyId)||null,[data.companies,companyId]);
  const sites=useMemo(()=>data.sites.filter(s=>s.company_id===companyId),[data.sites,companyId]);
  const match=record=>{if(!company)return false;if(record?.company_id===company.id)return true;const hay=`${record?.company||''} ${record?.company_code||''} ${record?.entity||''}`.toLowerCase();return hay.includes(String(company.company_code||'').toLowerCase())||hay.includes(String(company.company_name||'').toLowerCase())};
  const certifications=useMemo(()=>data.certifications.filter(match),[data.certifications,company]);
  const audits=useMemo(()=>data.audits.filter(match),[data.audits,company]);
  const grievances=useMemo(()=>data.grievances.filter(match),[data.grievances,company]);
  const grievanceIds=useMemo(()=>new Set(grievances.map(g=>g.id)),[grievances]);
  const actions=useMemo(()=>data.actions.filter(a=>grievanceIds.has(a.grievance_id)),[data.actions,grievanceIds]);
  const suppliers=useMemo(()=>data.suppliers.filter(s=>s.company_id===companyId),[data.suppliers,companyId]);
  const latestRiskBySupplier=useMemo(()=>{const o={};for(const r of data.riskAssessments){if(!o[r.supplier_id])o[r.supplier_id]=r}return o},[data.riskAssessments]);

  const latestSims=useMemo(()=>{const rows=data.simsAssessments.filter(a=>a.company_id===companyId).sort((a,b)=>Number(b.assessment_year||0)-Number(a.assessment_year||0));const seen=new Set();return rows.filter(a=>{if(seen.has(a.standard_id))return false;seen.add(a.standard_id);return true})},[data.simsAssessments,companyId]);
  const simsIds=useMemo(()=>new Set(latestSims.map(a=>a.id)),[latestSims]);
  const simsItems=useMemo(()=>data.simsItems.filter(i=>simsIds.has(i.assessment_id)),[data.simsItems,simsIds]);
  const standardMap=useMemo(()=>Object.fromEntries(data.simsStandards.map(s=>[s.id,s])),[data.simsStandards]);
  const risk=useMemo(()=>calculateExecutiveRisk({certifications,grievances,actions,simsItems,suppliers,latestRiskBySupplier}),[certifications,grievances,actions,simsItems,suppliers,latestRiskBySupplier]);

  const stats=useMemo(()=>({
    activeCert:certifications.filter(c=>c.status==='Certified'&&(daysUntil(c.valid_until)===null||daysUntil(c.valid_until)>=0)).length,
    expiring:certifications.filter(c=>{const d=daysUntil(c.valid_until);return d!==null&&d>=0&&d<=90}).length,
    expired:certifications.filter(c=>{const d=daysUntil(c.valid_until);return c.status==='Expired'||(d!==null&&d<0)}).length,
    openGrievance:grievances.filter(g=>g.status!=='Closed').length,
    openActions:actions.filter(a=>a.status!=='Completed').length,
    overdue:actions.filter(a=>a.status!=='Completed'&&daysUntil(a.target_date)!==null&&daysUntil(a.target_date)<0).length,
    audits30:audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&d<=30&&!['Done','Cancelled'].includes(a.status)}).length,
  }),[certifications,grievances,actions,audits]);

  const simsSummary=useMemo(()=>latestSims.map(a=>{const items=data.simsItems.filter(i=>i.assessment_id===a.id);const verified=items.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;const gaps=items.filter(i=>i.self_status==='Not Fulfilled').length;return{standard:standardMap[a.standard_id]?.name||standardMap[a.standard_id]?.code||'SIMS',year:a.assessment_year,total:items.length,verified,gaps,pct:items.length?Math.round(verified/items.length*100):0}}),[latestSims,data.simsItems,standardMap]);
  const expiry=useMemo(()=>certifications.filter(c=>c.valid_until&&daysUntil(c.valid_until)>=0).sort((a,b)=>String(a.valid_until).localeCompare(String(b.valid_until))).slice(0,6),[certifications]);
  const upcoming=useMemo(()=>audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&!['Done','Cancelled'].includes(a.status)}).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).slice(0,6),[audits]);
  const riskySuppliers=useMemo(()=>suppliers.map(s=>({supplier:s,risk:latestRiskBySupplier[s.id]})).filter(x=>x.risk).sort((a,b)=>Number(b.risk.risk_score||0)-Number(a.risk.risk_score||0)).slice(0,6),[suppliers,latestRiskBySupplier]);
  const auditRows=useMemo(()=>data.auditLog.filter(r=>r.company_id===companyId).slice(0,30),[data.auditLog,companyId]);

  return <div className="page-wrap"><style>{styles}</style>
    <section className="c360v2-hero"><div><h1>PT 360° Sustainability Profile</h1><p>{company?`${company.company_code} — ${company.company_name}`:'Select company'}</p></div><div className="c360v2-filter"><select value={companyId} onChange={e=>setCompanyId(e.target.value)}>{data.companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select><button onClick={loadAll}>Refresh</button><Link href="/">Dashboard</Link></div></section>
    {error?<div className="sync-error"><strong>Supabase connection issue</strong><span>{error}</span></div>:null}

    <section className={`c360v2-risk ${risk.level.toLowerCase()}`}><div className="score"><strong>{loading?'…':risk.score}</strong><span>/100</span></div><div><div className="rtitle"><h2>Executive Risk Score</h2><b>{risk.level}</b></div><p>Management risk indicator calculated from connected certification, grievance/action, SIMS and saved spatial supplier risk data.</p><small>Coverage {risk.coverage.available}/{risk.coverage.total} risk components</small></div><div className="components">{risk.components.map(c=><div key={c.key}><span>{c.label} · {c.weight}%</span><strong>{c.available?c.score:'N/A'}</strong><small>{c.detail}</small></div>)}</div></section>

    <section className="c360v2-kpis"><Card label="Active Certificates" value={stats.activeCert}/><Card label="Expiring ≤90d" value={stats.expiring} tone={stats.expiring?'warn':''}/><Card label="Expired" value={stats.expired} tone={stats.expired?'bad':''}/><Card label="Audits ≤30d" value={stats.audits30}/><Card label="Open Grievances" value={stats.openGrievance} tone={stats.openGrievance?'warn':''}/><Card label="Open Actions" value={stats.openActions} sub={`${stats.overdue} overdue`} tone={stats.overdue?'bad':''}/><Card label="Sites / Units" value={sites.length}/><Card label="Saved Suppliers" value={suppliers.length}/></section>

    <section className="c360v2-grid"><Panel title="SIMS Compliance" action={<Link href="/sims/compliance">Open Compliance →</Link>}>{simsSummary.length?<div className="bars">{simsSummary.map(s=><div className="bar" key={s.standard}><div><strong>{s.standard}</strong><span>{s.year} · {s.verified}/{s.total} verified · {s.gaps} gap</span></div><div className="track"><i style={{width:`${s.pct}%`}}/></div><b>{s.pct}%</b></div>)}</div>:<Empty text="No SIMS assessment yet."/>}</Panel><Panel title="Supplier Spatial Risk" action={<Link href="/spatial-monitoring">Open Risk Assessment →</Link>}>{riskySuppliers.length?<div className="rows">{riskySuppliers.map(({supplier,risk:r})=><div className="row" key={supplier.id}><div><strong>{supplier.supplier_name}</strong><span>{supplier.land_status||'Unknown'} · {supplier.province||'-'}</span></div><div><b className={`pill ${String(r.risk_level||'').toLowerCase()}`}>{r.risk_level}</b><span>{r.risk_score}/100</span></div></div>)}</div>:<Empty text="No saved supplier risk for this PT."/>}</Panel></section>

    <section className="c360v2-grid"><Panel title="Nearest Certificate Expiry" action={<Link href="/certificates">Open Certification →</Link>}><div className="rows">{expiry.length?expiry.map(c=><div className="row" key={c.id}><div><strong>{c.standard}</strong><span>{c.certificate_number||'No certificate number'}</span></div><div><b>{formatDate(c.valid_until)}</b><span>{daysUntil(c.valid_until)} days</span></div></div>):<Empty text="No upcoming certificate expiry."/>}</div></Panel><Panel title="Upcoming Audits" action={<Link href="/audits">Open Audit Monitoring →</Link>}><div className="rows">{upcoming.length?upcoming.map(a=><div className="row" key={a.id}><div><strong>{a.title||a.audit_type}</strong><span>{a.audit_type||'-'}</span></div><div><b>{formatDate(a.start_date)}</b><span>{a.status}</span></div></div>):<Empty text="No upcoming audit."/>}</div></Panel></section>

    <section className="c360v2-panel audit"><div className="head"><div><h2>Audit Trail / Change History</h2><p>Who changed what and when for this PT.</p></div>{auditAvailable?<span className="ready">Live</span>:<span className="needsql">SQL activation required</span>}</div>{auditAvailable?<>{auditRows.length?<div className="timeline">{auditRows.map(r=><div className="event" key={r.id}><i className={String(r.operation).toLowerCase()}/><div><strong>{tableLabel(r.table_name)} · {r.operation}</strong><span>{auditSummary(r)}</span><small>{r.changed_by_email||'System / unknown user'} · {formatDateTime(r.changed_at)}</small></div></div>)}</div>:<Empty text="No change history recorded for this PT yet."/>}</>:<div className="sql-note"><strong>Audit Trail UI is ready.</strong><span>Run SUPABASE-AUDIT-TRAIL-V8-20.sql in Supabase SQL Editor once to start recording future INSERT / UPDATE / DELETE changes.</span></div>}</section>

    <section className="quick"><Link href="/certificates">Certification</Link><Link href="/grievances">Grievance</Link><Link href="/sims/assessment">SIMS Assessment</Link><Link href="/spatial-monitoring">Spatial Risk</Link><Link href="/non-spatial-monitoring">Non-Spatial Risk</Link></section>
  </div>
}

function Card({label,value,sub,tone=''}){return <div className={`card ${tone}`}><span>{label}</span><strong>{value}</strong>{sub?<small>{sub}</small>:null}</div>}
function Panel({title,action,children}){return <section className="c360v2-panel"><div className="head"><h2>{title}</h2>{action}</div>{children}</section>}
function Empty({text}){return <div className="empty">{text}</div>}
function tableLabel(t){return({certifications:'Certification',audit_events:'Audit',grievances:'Grievance',grievance_actions:'Corrective Action',sims_assessments:'SIMS Assessment',sims_assessment_items:'SIMS Indicator',sims_action_plans:'SIMS Action Plan',spatial_suppliers:'Spatial Supplier',supplier_risk_assessments:'Supplier Risk Assessment'})[t]||t}
function auditSummary(r){if(r.operation==='INSERT')return `New record ${r.record_id||''}`.trim();if(r.operation==='DELETE')return `Deleted record ${r.record_id||''}`.trim();const keys=Object.keys(r.changed_fields||{}).filter(k=>!['updated_at','created_at'].includes(k));if(!keys.length)return `Updated record ${r.record_id||''}`.trim();return `Changed: ${keys.slice(0,5).join(', ')}${keys.length>5?' + more':''}`}
function formatDateTime(v){if(!v)return'-';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}

const styles=`
.c360v2-hero{display:flex;justify-content:space-between;gap:18px;align-items:end;background:linear-gradient(135deg,#0e4e35,#153b2c);border-radius:20px;padding:22px 24px;color:#fff;margin-bottom:15px}.c360v2-hero h1{margin:0;font-size:28px}.c360v2-hero p{margin:5px 0 0;color:#cadbd2;font-size:12px}.c360v2-filter{display:flex;gap:8px}.c360v2-filter select{min-width:300px;height:42px;border:0;border-radius:10px;padding:0 11px;font-weight:800;color:#153c2c}.c360v2-filter button,.c360v2-filter a{height:42px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.1);color:#fff;padding:0 12px;font-weight:800;display:grid;place-items:center;text-decoration:none;font-size:11px;cursor:pointer}.c360v2-risk{display:grid;grid-template-columns:105px 1fr 1.3fr;gap:18px;align-items:center;background:#fff;border:1px solid #dce7e0;border-radius:16px;padding:17px;margin-bottom:14px}.score{width:90px;height:90px;border-radius:50%;border:8px solid #5ba879;background:#eef7f1;display:grid;place-items:center;align-content:center}.score strong{font-size:31px;line-height:1;color:#173e2c}.score span{font-size:9px;color:#73847a}.c360v2-risk.moderate .score{border-color:#d1aa3e;background:#fff8e6}.c360v2-risk.high .score{border-color:#df8b3f;background:#fff4e9}.c360v2-risk.critical .score{border-color:#c94f43;background:#fff0ee}.rtitle{display:flex;align-items:center;gap:10px}.rtitle h2{font-size:17px;margin:0}.rtitle b{font-size:9px;padding:5px 8px;border-radius:999px;background:#eef6f1;color:#256743}.c360v2-risk p{font-size:10.5px;color:#718178;line-height:1.45;margin:7px 0}.c360v2-risk small{font-size:9.5px;color:#587061}.components{display:grid;grid-template-columns:1fr 1fr;gap:8px}.components>div{border:1px solid #e2e9e5;background:#fafcfb;border-radius:10px;padding:9px}.components span,.components small{display:block;font-size:8.8px;color:#76867d}.components strong{display:block;font-size:16px;color:#204632;margin:3px 0}.c360v2-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:15px}.card{background:#fff;border:1px solid #dce7e0;border-radius:14px;padding:14px}.card span{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#728179;font-weight:800}.card strong{display:block;font-size:26px;color:#183f2d;margin:7px 0 2px}.card small{font-size:9.5px;color:#7a8981}.card.warn{background:#fffaf0;border-color:#ead29e}.card.bad{background:#fff3f1;border-color:#eac2bd}.c360v2-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px}.c360v2-panel{background:#fff;border:1px solid #dce7e0;border-radius:15px;padding:16px}.head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:13px}.head h2{font-size:15px;margin:0;color:#193f2d}.head p{font-size:9.5px;color:#77877e;margin:4px 0 0}.head a{font-size:9.5px;color:#286849;text-decoration:none;font-weight:800}.rows{display:grid}.row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #edf1ef}.row:last-child{border-bottom:0}.row strong,.row b{display:block;font-size:10.5px;color:#294a38}.row span{display:block;font-size:9px;color:#7b8982;margin-top:3px}.row>div:last-child{text-align:right}.pill{display:inline-block!important;padding:4px 7px;border-radius:999px;background:#eef6f1;color:#256743!important}.pill.high,.pill.critical{background:#fff0ed;color:#a3443a!important}.bars{display:grid;gap:11px}.bar{display:grid;grid-template-columns:155px 1fr 45px;gap:9px;align-items:center}.bar strong{display:block;font-size:10px;color:#294a38}.bar span{display:block;font-size:8.8px;color:#7b8982;margin-top:2px}.track{height:9px;background:#edf2ef;border-radius:999px;overflow:hidden}.track i{display:block;height:100%;background:linear-gradient(90deg,#256f49,#8ac35c)}.bar>b{text-align:right;font-size:11px;color:#255d40}.audit{margin-bottom:15px}.ready,.needsql{font-size:9px;font-weight:900;border-radius:999px;padding:5px 8px}.ready{background:#edf8f0;color:#267044}.needsql{background:#fff7e3;color:#8b6619}.timeline{display:grid}.event{display:grid;grid-template-columns:12px 1fr;gap:11px;padding:10px 0;border-bottom:1px solid #edf1ef}.event:last-child{border-bottom:0}.event>i{width:9px;height:9px;border-radius:50%;background:#4f8d69;margin-top:4px}.event>i.delete{background:#c94f43}.event>i.update{background:#d0a737}.event strong{font-size:10.5px;color:#294a38}.event span,.event small{display:block;font-size:9px;color:#78877f;margin-top:3px}.sql-note{display:grid;gap:5px;padding:13px;border:1px dashed #d8d09f;background:#fffdf5;border-radius:10px}.sql-note strong{font-size:11px}.sql-note span{font-size:9.5px;color:#786e43;line-height:1.45}.empty{text-align:center;padding:22px;border:1px dashed #d6dfda;border-radius:10px;color:#7c8a83;font-size:10px}.quick{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.quick a{text-align:center;padding:10px;border:1px solid #dce8e0;background:#f5f9f6;border-radius:10px;color:#285f41;text-decoration:none;font-size:9.5px;font-weight:800}@media(max-width:1100px){.c360v2-risk{grid-template-columns:100px 1fr}.components{grid-column:1/-1}.c360v2-kpis{grid-template-columns:repeat(2,1fr)}.c360v2-grid{grid-template-columns:1fr}.quick{grid-template-columns:1fr 1fr 1fr}}@media(max-width:750px){.c360v2-hero{flex-direction:column;align-items:stretch}.c360v2-filter{flex-direction:column}.c360v2-filter select{min-width:0;width:100%}.c360v2-risk{grid-template-columns:1fr}.score{margin:auto}.components{grid-template-columns:1fr}.c360v2-kpis{grid-template-columns:1fr 1fr}.bar{grid-template-columns:110px 1fr}.bar>b{grid-column:2}.quick{grid-template-columns:1fr 1fr}}
`;
