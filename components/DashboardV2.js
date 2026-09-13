'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';
import { daysUntil, formatDate, todayISO } from '../lib/monitoring';
import { calculateExecutiveRisk } from '../lib/riskScore';

const CERT_STANDARDS=['ISPO','ISCC EU','ISCC CORSIA','INS','GGL','EUDR','SMETA','VDF'];

export default function DashboardV2(){
  const [data,setData]=useState({grievances:[],certifications:[],audits:[],companies:[],actions:[],simsAssessments:[],simsItems:[],simsStandards:[],suppliers:[],riskAssessments:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [companyFilter,setCompanyFilter]=useState('All');
  const [drill,setDrill]=useState('');

  useEffect(()=>{loadDashboard()},[]);

  async function loadDashboard(){
    const ce=getSupabaseConfigError();
    if(ce||!supabase){setError(ce||'Supabase is not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    const [g,c,a,co,ac,sa,si,ss,sp,ra]=await Promise.all([
      supabase.from('grievances').select('*').order('opened_date',{ascending:false}),
      supabase.from('certifications').select('*').order('valid_until'),
      supabase.from('audit_events').select('*').order('start_date'),
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('grievance_actions').select('*').order('target_date'),
      supabase.from('sims_assessments').select('*').order('assessment_year',{ascending:false}),
      supabase.from('sims_assessment_items').select('*'),
      supabase.from('sims_standards').select('*').order('name'),
      supabase.from('spatial_suppliers').select('*').order('supplier_name'),
      supabase.from('supplier_risk_assessments').select('*').order('assessed_at',{ascending:false}),
    ]);
    const hard=g.error||c.error||a.error||co.error||ac.error;
    if(hard)setError(hard.message);
    setData({
      grievances:g.data||[],certifications:c.data||[],audits:a.data||[],companies:co.data||[],actions:ac.data||[],
      simsAssessments:sa.error?[]:(sa.data||[]),simsItems:si.error?[]:(si.data||[]),simsStandards:ss.error?[]:(ss.data||[]),
      suppliers:sp.error?[]:(sp.data||[]),riskAssessments:ra.error?[]:(ra.data||[]),
    });
    setLoading(false);
  }

  const companyMap=useMemo(()=>Object.fromEntries(data.companies.map(c=>[c.id,c])),[data.companies]);
  const standardMap=useMemo(()=>Object.fromEntries(data.simsStandards.map(s=>[s.id,s])),[data.simsStandards]);
  const selectedCompany=companyFilter==='All'?null:data.companies.find(c=>c.id===companyFilter)||null;

  const scoped=useMemo(()=>{
    const match=record=>{
      if(!selectedCompany)return true;
      if(record?.company_id===selectedCompany.id)return true;
      const hay=`${record?.company||''} ${record?.company_code||''} ${record?.entity||''}`.toLowerCase();
      const code=String(selectedCompany.company_code||'').toLowerCase();
      const name=String(selectedCompany.company_name||'').toLowerCase();
      return (!!code&&hay.includes(code))||!!name&&hay.includes(name);
    };
    const grievances=data.grievances.filter(match);
    const grievanceIds=new Set(grievances.map(g=>g.id));
    return {
      grievances,
      certifications:data.certifications.filter(match),
      audits:data.audits.filter(match),
      actions:data.actions.filter(a=>grievanceIds.has(a.grievance_id)),
      simsAssessments:data.simsAssessments.filter(a=>!selectedCompany||a.company_id===selectedCompany.id),
      suppliers:data.suppliers.filter(s=>!selectedCompany||s.company_id===selectedCompany.id),
    };
  },[data,selectedCompany]);

  const latestSimsAssessments=useMemo(()=>{
    const sorted=[...scoped.simsAssessments].sort((a,b)=>Number(b.assessment_year||0)-Number(a.assessment_year||0));
    const seen=new Set();return sorted.filter(a=>{const key=`${a.company_id}|${a.standard_id}`;if(seen.has(key))return false;seen.add(key);return true});
  },[scoped.simsAssessments]);
  const simsAssessmentMap=useMemo(()=>Object.fromEntries(latestSimsAssessments.map(a=>[a.id,a])),[latestSimsAssessments]);
  const scopedSimsItems=useMemo(()=>data.simsItems.filter(i=>simsAssessmentMap[i.assessment_id]),[data.simsItems,simsAssessmentMap]);

  const latestRiskBySupplier=useMemo(()=>{
    const map={};for(const r of data.riskAssessments){if(!map[r.supplier_id])map[r.supplier_id]=r}return map;
  },[data.riskAssessments]);

  const stats=useMemo(()=>{
    const activeCert=scoped.certifications.filter(c=>c.status==='Certified'&&(daysUntil(c.valid_until)===null||daysUntil(c.valid_until)>=0)).length;
    const expiring90=scoped.certifications.filter(c=>{const d=daysUntil(c.valid_until);return d!==null&&d>=0&&d<=90}).length;
    const expired=scoped.certifications.filter(c=>{const d=daysUntil(c.valid_until);return c.status==='Expired'||(d!==null&&d<0)}).length;
    const upcoming30=scoped.audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&d<=30&&!['Done','Cancelled'].includes(a.status)}).length;
    const openGrievance=scoped.grievances.filter(g=>g.status!=='Closed').length;
    const openActions=scoped.actions.filter(a=>a.status!=='Completed').length;
    const overdueActions=scoped.actions.filter(a=>a.status!=='Completed'&&daysUntil(a.target_date)!==null&&daysUntil(a.target_date)<0).length;
    const verified=scopedSimsItems.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;
    const simsCompliance=scopedSimsItems.length?Math.round(verified/scopedSimsItems.length*100):null;
    return{activeCert,expiring90,expired,upcoming30,openGrievance,openActions,overdueActions,simsCompliance};
  },[scoped,scopedSimsItems]);

  const risk=useMemo(()=>calculateExecutiveRisk({certifications:scoped.certifications,grievances:scoped.grievances,actions:scoped.actions,simsItems:scopedSimsItems,suppliers:scoped.suppliers,latestRiskBySupplier}),[scoped,scopedSimsItems,latestRiskBySupplier]);

  const standardSummary=useMemo(()=>{
    const map={};for(const c of scoped.certifications){const key=normalizeStandardLabel(c.standard);if(!map[key])map[key]={standard:key,total:0,active:0,expiring:0,expired:0};map[key].total++;const d=daysUntil(c.valid_until);if(c.status==='Certified'&&(d===null||d>=0))map[key].active++;if(d!==null&&d>=0&&d<=90)map[key].expiring++;if(c.status==='Expired'||(d!==null&&d<0))map[key].expired++;}return Object.values(map).sort((x,y)=>standardRank(x.standard)-standardRank(y.standard));
  },[scoped.certifications]);

  const certHealth=useMemo(()=>{let healthy=0,expiring=0,expired=0,other=0;for(const c of scoped.certifications){const d=daysUntil(c.valid_until);if(c.status==='Expired'||(d!==null&&d<0)){expired++;continue}if(d!==null&&d>=0&&d<=90){expiring++;continue}if(c.status==='Certified'){healthy++;continue}other++}return{healthy,expiring,expired,other,total:healthy+expiring+expired+other}},[scoped.certifications]);
  const expiryForecast=useMemo(()=>{const now=new Date(),months=[];for(let i=0;i<6;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;months.push({key,label:d.toLocaleDateString('en-US',{month:'short'}),count:0})}const byKey=Object.fromEntries(months.map(m=>[m.key,m]));scoped.certifications.forEach(c=>{if(!c.valid_until)return;const d=new Date(`${c.valid_until}T00:00:00`);if(Number.isNaN(d.getTime()))return;const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;if(byKey[key])byKey[key].count++});return months},[scoped.certifications]);
  const simsByStandard=useMemo(()=>{const groups={};for(const item of scopedSimsItems){const a=simsAssessmentMap[item.assessment_id];if(!a)continue;const std=standardMap[a.standard_id];const key=std?.name||std?.code||'SIMS';if(!groups[key])groups[key]={name:key,total:0,verified:0,year:a.assessment_year};groups[key].total++;if(item.self_status==='Fulfilled'&&item.verifier_status==='Verified')groups[key].verified++;groups[key].year=Math.max(Number(groups[key].year||0),Number(a.assessment_year||0))}return Object.values(groups).map(g=>({...g,pct:g.total?Math.round(g.verified/g.total*100):0}))},[scopedSimsItems,simsAssessmentMap,standardMap]);

  const nextAudits=useMemo(()=>scoped.audits.filter(a=>a.start_date>=todayISO()&&!['Done','Cancelled'].includes(a.status)).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).slice(0,5),[scoped.audits]);
  const nextExpiry=useMemo(()=>scoped.certifications.filter(c=>c.valid_until&&daysUntil(c.valid_until)>=0).sort((a,b)=>String(a.valid_until).localeCompare(String(b.valid_until))).slice(0,5),[scoped.certifications]);
  const openGrievances=useMemo(()=>scoped.grievances.filter(g=>g.status!=='Closed').sort((a,b)=>String(b.opened_date||'').localeCompare(String(a.opened_date||''))).slice(0,5),[scoped.grievances]);
  const scopeLabel=selectedCompany?`${selectedCompany.company_code} — ${selectedCompany.company_name}`:'All Companies';
  const activeCompanies=data.companies.filter(c=>c.status!=='Inactive').length;

  const drillConfig=useMemo(()=>buildDrilldown(drill,scoped,stats,companyMap,simsByStandard,risk),[drill,scoped,stats,companyMap,simsByStandard,risk]);

  return <div className="page-wrap">
    <style>{styles}</style>
    <section className="v2-hero">
      <div><h1>{selectedCompany?'Company Sustainability Overview':'Executive Sustainability Dashboard'}</h1></div>
      <div className="v2-controls"><label><span>Overview Filter · Company / PT</span><select value={companyFilter} onChange={e=>{setCompanyFilter(e.target.value);setDrill('')}}><option value="All">All Companies</option>{data.companies.filter(c=>c.status!=='Inactive').map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></label><button onClick={()=>{setCompanyFilter('All');setDrill('')}}>Reset</button><button className="accent" onClick={loadDashboard}>Refresh Data</button>{selectedCompany?<Link className="v2-button" href={`/company-360?company=${selectedCompany.id}`}>Open PT 360°</Link>:null}</div>
    </section>

    {error?<div className="sync-error"><strong>Supabase connection issue</strong><span>{error}</span></div>:!loading?<div className="sync-success">● Live Supabase data · {scopeLabel}</div>:null}

    <section className={`risk-hero risk-${risk.level.toLowerCase()}`}>
      <div className="risk-score"><strong>{loading?'…':risk.score}</strong><span>/100</span></div>
      <div className="risk-copy"><div className="risk-title"><h2>Executive Risk Score</h2><span>{risk.level}</span></div><p>Rule-based management risk indicator from currently connected Certification, Grievance/Actions, SIMS and saved Supplier Spatial Risk data.</p><div className="risk-coverage">Data coverage: {risk.coverage.available}/{risk.coverage.total} components</div></div>
      <div className="risk-components">{risk.components.map(c=><button key={c.key} disabled={!c.available} onClick={()=>setDrill('risk')}><span>{c.label} · weight {c.weight}%</span><strong>{c.available?`${c.score}/100`:'N/A'}</strong><small>{c.detail}</small></button>)}</div>
    </section>

    <section className="v2-kpis">
      <KPI label="Active Certificates" value={loading?'…':stats.activeCert} hint="Currently certified" onClick={()=>setDrill('activeCert')}/>
      <KPI label="Expiring ≤90 Days" value={loading?'…':stats.expiring90} hint="Renewal attention" tone={stats.expiring90?'warning':''} onClick={()=>setDrill('expiring')}/>
      <KPI label="Expired" value={loading?'…':stats.expired} hint="Validity ended" tone={stats.expired?'danger':''} onClick={()=>setDrill('expired')}/>
      <KPI label="Upcoming Audits ≤30 Days" value={loading?'…':stats.upcoming30} hint="Planned / confirmed" onClick={()=>setDrill('audits')}/>
      <KPI label="Open Grievances" value={loading?'…':stats.openGrievance} hint="Need follow-up" tone={stats.openGrievance?'warning':''} onClick={()=>setDrill('grievances')}/>
      <KPI label="Open Actions" value={loading?'…':stats.openActions} hint={`${stats.overdueActions} overdue`} tone={stats.overdueActions?'danger':''} onClick={()=>setDrill('actions')}/>
      <KPI label="SIMS Compliance" value={loading?'…':stats.simsCompliance===null?'—':`${stats.simsCompliance}%`} hint="Verified Fulfilled" onClick={()=>setDrill('sims')}/>
      <KPI label="Overview Scope" value={loading?'…':selectedCompany?.company_code||activeCompanies} hint={selectedCompany?.company_name||'Active companies'} onClick={()=>selectedCompany?null:setDrill('companies')}/>
    </section>

    {drillConfig?<Drilldown config={drillConfig} close={()=>setDrill('')}/>:null}

    <section className="v2-grid two"><Panel title="Certification Health" tag={`${certHealth.total} records`}><CertificationHealth health={certHealth}/></Panel><Panel title="Expiry Forecast · 6 Months" tag="Forward view"><ExpiryForecast rows={expiryForecast}/></Panel></section>
    <section className="v2-grid wide"><Panel title="Certification Portfolio by Standard" action={<Link href="/certificates">Open Certification →</Link>}><StandardBars rows={standardSummary}/></Panel><Panel title="SIMS Compliance" action={<Link href="/sims/compliance">Open Compliance →</Link>}><SimsBars rows={simsByStandard}/></Panel></section>
    <section className="v2-grid two"><Panel title="Risk Breakdown" action={<button className="plain-link" onClick={()=>setDrill('risk')}>View detail →</button>}><RiskBars risk={risk}/></Panel><Panel title="Nearest Certificate Expiry" action={<Link href="/certificates">Open register →</Link>}><div className="v2-list">{nextExpiry.length?nextExpiry.map(c=>{const d=daysUntil(c.valid_until);return <div className="v2-row" key={c.id}><div><strong>{normalizeStandardLabel(c.standard)}</strong><span>{companyMap[c.company_id]?.company_code||'-'} · {c.certificate_number||'No certificate number'}</span></div><div><strong>{formatDate(c.valid_until)}</strong><span className={d<=30?'red':d<=90?'amber':''}>{d} days</span></div></div>}):<Empty text="No certificate expiry recorded."/>}</div></Panel></section>
    <section className="v2-grid two"><Panel title="Upcoming Audits" action={<Link href="/audits">Open Audit Monitoring →</Link>}><div className="v2-list">{nextAudits.length?nextAudits.map(a=><div className="v2-row" key={a.id}><div><strong>{a.title||a.audit_type}</strong><span>{companyMap[a.company_id]?.company_code||'-'} · {a.audit_type}</span></div><div><strong>{formatDate(a.start_date)}</strong><span>{a.status}</span></div></div>):<Empty text="No upcoming audits."/>}</div></Panel><Panel title="Open Grievances" action={<Link href="/grievances">Open Tracker →</Link>}><div className="v2-list">{openGrievances.length?openGrievances.map(g=><Link href={`/grievances/${g.case_id||g.id}`} className="v2-row row-link" key={g.id}><div><strong>{g.case_id||'-'} · {g.company||companyMap[g.company_id]?.company_code||'-'}</strong><span>{g.issue_title||g.category||'Grievance'}</span></div><div><strong>{g.status}</strong><span>{Number(g.progress||0)}% progress</span></div></Link>):<Empty text="No open grievances."/>}</div></Panel></section>
  </div>
}

function KPI({label,value,hint,tone='',onClick}){return <button type="button" className={`v2-kpi ${tone}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{hint}</small><em>Click to drill down →</em></button>}
function Panel({title,tag,action,children}){return <section className="v2-panel"><div className="panel-head2"><h2>{title}</h2>{tag?<span>{tag}</span>:action}</div>{children}</section>}
function Empty({text}){return <div className="v2-empty">{text}</div>}
function CertificationHealth({health}){const total=Math.max(health.total,1),a=health.healthy/total*100,b=a+health.expiring/total*100,c=b+health.expired/total*100;return <div className="health"><div className="donut" style={{background:`conic-gradient(#2e7d4f 0 ${a}%,#d69b29 ${a}% ${b}%,#c85a4e ${b}% ${c}%,#d8e0db ${c}% 100%)`}}><i/><b>{health.total}</b></div><div className="legend"><p><i className="g"/>Healthy <b>{health.healthy}</b></p><p><i className="w"/>Expiring <b>{health.expiring}</b></p><p><i className="r"/>Expired <b>{health.expired}</b></p><p><i className="m"/>Other <b>{health.other}</b></p></div></div>}
function ExpiryForecast({rows}){const max=Math.max(1,...rows.map(r=>r.count));return <div className="forecast2">{rows.map(r=><div key={r.key}><b>{r.count}</b><span><i style={{height:`${Math.max(4,r.count/max*100)}%`}}/></span><small>{r.label}</small></div>)}</div>}
function StandardBars({rows}){if(!rows.length)return <Empty text="No certification records in this scope."/>;return <div className="bar-list">{rows.map(r=>{const p=r.total?Math.round(r.active/r.total*100):0;return <div className="bar-row" key={r.standard}><strong>{r.standard}</strong><span><i style={{width:`${p}%`}}/></span><em>{r.active}/{r.total} · {r.expiring} expiring</em></div>})}</div>}
function SimsBars({rows}){if(!rows.length)return <Empty text="No SIMS assessment yet."/>;return <div className="bar-list">{rows.map(r=><div className="bar-row" key={r.name}><strong>{r.name}</strong><span><i style={{width:`${r.pct}%`}}/></span><em>{r.pct}% · {r.verified}/{r.total} · {r.year}</em></div>)}</div>}
function RiskBars({risk}){return <div className="bar-list">{risk.components.map(c=><div className="bar-row" key={c.key}><strong>{c.label}</strong><span><i className={`riskfill ${riskTone(c.score)}`} style={{width:`${c.available?c.score:0}%`}}/></span><em>{c.available?`${c.score}/100 · ${c.weight}% weight`:'N/A'}</em></div>)}</div>}
function riskTone(score){const n=Number(score||0);return n>=75?'crit':n>=50?'high':n>=25?'mod':'low'}

function Drilldown({config,close}){return <section className="drill"><div className="drill-head"><div><h2>{config.title}</h2><p>{config.subtitle}</p></div><div>{config.href?<Link href={config.href}>Open module ↗</Link>:null}<button onClick={close}>Close</button></div></div>{config.type==='risk'?<div className="risk-detail">{config.rows.map(r=><div key={r.label}><strong>{r.label}</strong><b>{r.value}</b><span>{r.detail}</span></div>)}</div>:config.type==='sims'?<SimsBars rows={config.rows}/>:<div className="drill-table">{config.rows.length?config.rows.map((r,i)=><div className="drill-row" key={r.id||i}><div><strong>{r.title}</strong><span>{r.detail}</span></div><div><strong>{r.value}</strong><span>{r.meta}</span></div></div>):<Empty text="No records in this drill-down."/>}</div>}</section>}

function buildDrilldown(type,scoped,stats,companyMap,simsByStandard,risk){
  if(!type)return null;
  if(type==='risk')return{title:'Executive Risk Score Breakdown',subtitle:`Overall ${risk.score}/100 · ${risk.level}. Weights are re-normalized when a component has no available data.`,type:'risk',rows:risk.components.map(c=>({label:c.label,value:c.available?`${c.score}/100`:'N/A',detail:`Weight ${c.weight}% · ${c.detail}`}))};
  if(type==='sims')return{title:'SIMS Compliance Drill-down',subtitle:'Latest assessment per active standard.',type:'sims',rows:simsByStandard,href:'/sims/compliance'};
  if(type==='activeCert')return{title:'Active Certificates',subtitle:`${stats.activeCert} currently certified record(s).`,href:'/certificates',rows:scoped.certifications.filter(c=>c.status==='Certified'&&(daysUntil(c.valid_until)===null||daysUntil(c.valid_until)>=0)).map(c=>({id:c.id,title:normalizeStandardLabel(c.standard),detail:`${companyMap[c.company_id]?.company_code||'-'} · ${c.certificate_number||'No certificate number'}`,value:c.valid_until?formatDate(c.valid_until):'-',meta:'Valid until'}))};
  if(type==='expiring')return{title:'Certificates Expiring ≤90 Days',subtitle:'Renewal attention list.',href:'/certificates',rows:scoped.certifications.filter(c=>{const d=daysUntil(c.valid_until);return d!==null&&d>=0&&d<=90}).sort((a,b)=>String(a.valid_until).localeCompare(String(b.valid_until))).map(c=>({id:c.id,title:normalizeStandardLabel(c.standard),detail:`${companyMap[c.company_id]?.company_code||'-'} · ${c.certificate_number||'-'}`,value:`${daysUntil(c.valid_until)} days`,meta:formatDate(c.valid_until)}))};
  if(type==='expired')return{title:'Expired Certificates',subtitle:'Certificate validity already ended.',href:'/certificates',rows:scoped.certifications.filter(c=>{const d=daysUntil(c.valid_until);return c.status==='Expired'||(d!==null&&d<0)}).map(c=>({id:c.id,title:normalizeStandardLabel(c.standard),detail:`${companyMap[c.company_id]?.company_code||'-'} · ${c.certificate_number||'-'}`,value:formatDate(c.valid_until),meta:'Expired'}))};
  if(type==='audits')return{title:'Upcoming Audits ≤30 Days',subtitle:'Nearest audit schedules requiring preparation.',href:'/audits',rows:scoped.audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&d<=30&&!['Done','Cancelled'].includes(a.status)}).map(a=>({id:a.id,title:a.title||a.audit_type,detail:`${companyMap[a.company_id]?.company_code||'-'} · ${a.audit_type}`,value:formatDate(a.start_date),meta:a.status}))};
  if(type==='grievances')return{title:'Open Grievances',subtitle:'Cases requiring follow-up.',href:'/grievances',rows:scoped.grievances.filter(g=>g.status!=='Closed').map(g=>({id:g.id,title:`${g.case_id||'-'} · ${g.company||companyMap[g.company_id]?.company_code||'-'}`,detail:g.issue_title||g.category||'Grievance',value:g.status,meta:`${Number(g.progress||0)}% progress`}))};
  if(type==='actions')return{title:'Open Corrective Actions',subtitle:`${stats.overdueActions} overdue action(s).`,href:'/actions',rows:scoped.actions.filter(a=>a.status!=='Completed').map(a=>({id:a.id,title:a.action_id||'Corrective Action',detail:a.action_description||'-',value:a.target_date?formatDate(a.target_date):'-',meta:daysUntil(a.target_date)!==null&&daysUntil(a.target_date)<0?`${Math.abs(daysUntil(a.target_date))} days overdue`:a.status}))};
  if(type==='companies')return{title:'Active Company Scope',subtitle:'Companies available in the current master.',href:'/master-data',rows:[]};
  return null;
}

function normalizeStandardLabel(value){const s=String(value||'').trim();if(!s)return'Other';const u=s.toUpperCase();if(u.includes('ISCC CORSIA'))return'ISCC CORSIA';if(u.includes('ISCC EU'))return'ISCC EU';if(u==='ISCC'||u.includes('ISCC'))return'ISCC';if(u.includes('ISPO'))return'ISPO';if(/\bINS\b/.test(u))return'INS';if(u.includes('EUDR'))return'EUDR';if(u.includes('GGL'))return'GGL';if(u.includes('SMETA'))return'SMETA';if(u.includes('VDF'))return'VDF';return s}
function standardRank(s){const i=CERT_STANDARDS.indexOf(s);return i<0?99:i}

const styles=`
.v2-hero{background:linear-gradient(135deg,#0e4e35,#123d2d 62%,#153526);border-radius:20px;padding:22px 24px;color:#fff;margin-bottom:14px}.v2-hero h1{margin:0;font-size:29px}.v2-controls{display:grid;grid-template-columns:minmax(280px,1fr) auto auto auto;gap:9px;align-items:end;margin-top:18px}.v2-controls label{display:grid;gap:6px}.v2-controls label span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#c5d8cd;font-weight:800}.v2-controls select{height:43px;border:0;border-radius:10px;padding:0 12px;font-weight:800;color:#183c2b}.v2-controls button,.v2-button{height:43px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.1);color:#fff;padding:0 13px;font-weight:800;cursor:pointer;text-decoration:none;display:grid;place-items:center;font-size:12px}.v2-controls .accent{background:#d7f36a;color:#153c2c;border-color:#d7f36a}.risk-hero{display:grid;grid-template-columns:120px 1fr 1.25fr;gap:18px;align-items:center;border:1px solid #dce7e0;border-radius:17px;background:#fff;padding:17px 18px;margin:14px 0;box-shadow:0 5px 18px rgba(18,62,43,.05)}.risk-score{width:98px;height:98px;border-radius:50%;display:grid;place-items:center;align-content:center;background:#eef7f1;border:8px solid #5ba879}.risk-score strong{font-size:33px;line-height:1;color:#163d2b}.risk-score span{font-size:10px;color:#718178}.risk-high .risk-score{border-color:#df8b3f;background:#fff6eb}.risk-critical .risk-score{border-color:#c94f43;background:#fff0ee}.risk-moderate .risk-score{border-color:#d5ac3f;background:#fff9e8}.risk-title{display:flex;gap:10px;align-items:center}.risk-title h2{font-size:18px;margin:0}.risk-title span{font-size:10px;font-weight:900;padding:5px 8px;border-radius:999px;background:#edf6f0;color:#256641}.risk-copy p{font-size:11px;color:#718178;line-height:1.45;margin:7px 0}.risk-coverage{font-size:10px;font-weight:800;color:#476655}.risk-components{display:grid;grid-template-columns:1fr 1fr;gap:8px}.risk-components button{border:1px solid #e1e9e4;border-radius:10px;background:#fafcfb;padding:9px;text-align:left;cursor:pointer}.risk-components button:disabled{opacity:.55;cursor:default}.risk-components span,.risk-components small{display:block;color:#718178;font-size:9px}.risk-components strong{display:block;color:#1c4632;font-size:16px;margin:3px 0}.v2-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0 18px}.v2-kpi{border:1px solid #dce7e0;border-radius:15px;background:#fff;padding:15px;text-align:left;min-height:118px;cursor:pointer;box-shadow:0 4px 14px rgba(18,62,43,.04);transition:.15s}.v2-kpi:hover{transform:translateY(-2px);box-shadow:0 9px 22px rgba(18,62,43,.08)}.v2-kpi>span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#708077;font-weight:800}.v2-kpi strong{display:block;font-size:29px;color:#183e2d;margin:7px 0 4px}.v2-kpi small{display:block;color:#7c8b83;font-size:10px}.v2-kpi em{display:block;color:#3e7356;font-size:9px;font-style:normal;margin-top:8px}.v2-kpi.warning{background:#fffaf0;border-color:#ead19b}.v2-kpi.danger{background:#fff4f2;border-color:#ecc5c0}.drill{border:1px solid #bdd9c8;background:#f8fcf9;border-radius:16px;padding:17px;margin:-3px 0 18px}.drill-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.drill-head h2{font-size:16px;margin:0 0 3px}.drill-head p{font-size:10px;color:#76867d;margin:0}.drill-head>div:last-child{display:flex;gap:7px}.drill-head a,.drill-head button{border:1px solid #d3e2d9;background:#fff;border-radius:8px;padding:7px 9px;color:#245d3f;font-size:10px;font-weight:800;text-decoration:none;cursor:pointer}.drill-table{display:grid}.drill-row{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid #e4ece7}.drill-row strong{font-size:11px;color:#234433}.drill-row span{display:block;font-size:9.5px;color:#78877f;margin-top:3px}.drill-row>div:last-child{text-align:right}.risk-detail{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.risk-detail>div{background:#fff;border:1px solid #e1e9e4;border-radius:10px;padding:10px}.risk-detail strong,.risk-detail span{display:block;font-size:9.5px;color:#718178}.risk-detail b{display:block;font-size:20px;margin:5px 0;color:#1e4733}.v2-grid{display:grid;gap:16px;margin-bottom:16px}.v2-grid.two{grid-template-columns:1fr 1fr}.v2-grid.wide{grid-template-columns:1.3fr .7fr}.v2-panel{background:#fff;border:1px solid #dce7e0;border-radius:16px;padding:17px;box-shadow:0 4px 15px rgba(18,62,43,.04)}.panel-head2{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:15px}.panel-head2 h2{font-size:16px;margin:0;color:#183e2d}.panel-head2>span{font-size:9px;font-weight:800;color:#557161;background:#eef6f1;padding:5px 8px;border-radius:999px}.panel-head2 a,.plain-link{font-size:10px;font-weight:800;color:#286849;text-decoration:none;border:0;background:transparent;cursor:pointer}.health{display:grid;grid-template-columns:170px 1fr;gap:22px;align-items:center;min-height:210px}.donut{width:150px;height:150px;border-radius:50%;display:grid;place-items:center;position:relative;margin:auto}.donut>i{position:absolute;width:98px;height:98px;background:#fff;border-radius:50%}.donut>b{z-index:1;font-size:29px;color:#173f2c}.legend{display:grid;gap:10px}.legend p{display:grid;grid-template-columns:10px 1fr auto;gap:8px;align-items:center;margin:0;border-bottom:1px solid #edf1ee;padding-bottom:8px;font-size:11px;color:#66766d}.legend i{width:9px;height:9px;border-radius:50%}.legend .g{background:#2e7d4f}.legend .w{background:#d69b29}.legend .r{background:#c85a4e}.legend .m{background:#cfd8d2}.forecast2{height:210px;display:flex;gap:10px;align-items:flex-end}.forecast2>div{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;text-align:center}.forecast2 b{font-size:10px;color:#3f5f4d}.forecast2 span{height:155px;display:flex;align-items:flex-end;justify-content:center}.forecast2 i{width:55%;min-height:4px;background:linear-gradient(#d7f36a,#2e7d4f);border-radius:8px 8px 2px 2px}.forecast2 small{margin-top:7px;color:#7c8a82;font-size:10px;font-weight:800}.bar-list{display:grid;gap:12px}.bar-row{display:grid;grid-template-columns:120px 1fr 145px;gap:10px;align-items:center}.bar-row>strong{font-size:10.5px;color:#294a38}.bar-row>span{height:10px;background:#edf2ef;border-radius:999px;overflow:hidden}.bar-row>span>i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#246f4a,#8ac35c)}.bar-row>em{text-align:right;font-style:normal;color:#78877f;font-size:9.5px}.riskfill.low{background:#55a873!important}.riskfill.mod{background:#d0aa3d!important}.riskfill.high{background:#df8b3f!important}.riskfill.crit{background:#c94f43!important}.v2-list{display:grid}.v2-row{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid #edf1ee;color:inherit;text-decoration:none}.v2-row:last-child{border-bottom:0}.v2-row strong{display:block;font-size:10.5px;color:#274735}.v2-row span{display:block;font-size:9.5px;color:#7a8880;margin-top:3px}.v2-row>div:last-child{text-align:right}.v2-row .red{color:#b7443b}.v2-row .amber{color:#9c7115}.row-link:hover{background:#f8fbf9}.v2-empty{text-align:center;padding:22px;border:1px dashed #d5dfd9;border-radius:10px;color:#7b8981;font-size:10px}@media(max-width:1100px){.risk-hero{grid-template-columns:110px 1fr}.risk-components{grid-column:1/-1}.v2-kpis{grid-template-columns:repeat(2,1fr)}.v2-grid.two,.v2-grid.wide{grid-template-columns:1fr}}@media(max-width:750px){.v2-controls{grid-template-columns:1fr}.risk-hero{grid-template-columns:1fr}.risk-score{margin:auto}.risk-components{grid-template-columns:1fr}.v2-kpis{grid-template-columns:1fr 1fr}.health{grid-template-columns:1fr}.bar-row{grid-template-columns:80px 1fr}.bar-row>em{grid-column:2;text-align:left}.risk-detail{grid-template-columns:1fr 1fr}}
`;
