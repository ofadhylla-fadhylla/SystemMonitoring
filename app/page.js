'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';
import { daysUntil, formatDate, todayISO } from '../lib/monitoring';

const CERT_STANDARDS = ['ISPO','ISCC EU','ISCC CORSIA','INS','GGL','EUDR','SMETA','VDF'];

export default function Dashboard() {
  const [data,setData]=useState({grievances:[],certifications:[],audits:[],companies:[],actions:[],simsAssessments:[],simsItems:[],simsStandards:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [companyFilter,setCompanyFilter]=useState('All');

  useEffect(()=>{ loadDashboard(); },[]);

  async function loadDashboard(){
    const configError=getSupabaseConfigError();
    if(configError||!supabase){setError(configError||'Supabase is not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    const [g,c,a,co,ac,sa,si,ss]=await Promise.all([
      supabase.from('grievances').select('*').order('opened_date',{ascending:false}),
      supabase.from('certifications').select('*').order('valid_until'),
      supabase.from('audit_events').select('*').order('start_date'),
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('grievance_actions').select('*').order('target_date'),
      supabase.from('sims_assessments').select('*').order('assessment_year',{ascending:false}),
      supabase.from('sims_assessment_items').select('*'),
      supabase.from('sims_standards').select('*').order('name'),
    ]);
    const hardError=g.error||c.error||a.error||co.error||ac.error;
    if(hardError)setError(hardError.message);
    setData({
      grievances:g.data||[],certifications:c.data||[],audits:a.data||[],companies:co.data||[],actions:ac.data||[],
      simsAssessments:sa.error?[]:(sa.data||[]),simsItems:si.error?[]:(si.data||[]),simsStandards:ss.error?[]:(ss.data||[])
    });
    setLoading(false);
  }

  const companyMap=useMemo(()=>Object.fromEntries(data.companies.map(c=>[c.id,c])),[data.companies]);
  const standardMap=useMemo(()=>Object.fromEntries(data.simsStandards.map(s=>[s.id,s])),[data.simsStandards]);
  const selectedCompany=companyFilter==='All'?null:data.companies.find(c=>c.id===companyFilter)||null;

  const scoped=useMemo(()=>{
    const match=(record)=>{
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
      simsAssessments:data.simsAssessments.filter(a=>!selectedCompany||a.company_id===selectedCompany.id)
    };
  },[data,selectedCompany]);

  const latestSimsAssessments=useMemo(()=>{
    const sorted=[...scoped.simsAssessments].sort((a,b)=>Number(b.assessment_year||0)-Number(a.assessment_year||0));
    const seen=new Set();
    return sorted.filter(a=>{const key=`${a.company_id}|${a.standard_id}`;if(seen.has(key))return false;seen.add(key);return true;});
  },[scoped.simsAssessments]);

  const simsAssessmentMap=useMemo(()=>Object.fromEntries(latestSimsAssessments.map(a=>[a.id,a])),[latestSimsAssessments]);
  const scopedSimsItems=useMemo(()=>data.simsItems.filter(i=>simsAssessmentMap[i.assessment_id]),[data.simsItems,simsAssessmentMap]);

  const stats=useMemo(()=>{
    const activeCert=scoped.certifications.filter(c=>c.status==='Certified'&&(daysUntil(c.valid_until)===null||daysUntil(c.valid_until)>=0)).length;
    const expiring90=scoped.certifications.filter(c=>{const d=daysUntil(c.valid_until);return d!==null&&d>=0&&d<=90;}).length;
    const expired=scoped.certifications.filter(c=>{const d=daysUntil(c.valid_until);return c.status==='Expired'||(d!==null&&d<0);}).length;
    const upcoming30=scoped.audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&d<=30&&!['Done','Cancelled'].includes(a.status);}).length;
    const openGrievance=scoped.grievances.filter(g=>g.status!=='Closed').length;
    const openActions=scoped.actions.filter(a=>a.status!=='Completed').length;
    const overdueActions=scoped.actions.filter(a=>a.status!=='Completed'&&daysUntil(a.target_date)!==null&&daysUntil(a.target_date)<0).length;
    const simsVerified=scopedSimsItems.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;
    const simsCompliance=scopedSimsItems.length?Math.round(simsVerified/scopedSimsItems.length*100):0;
    return {activeCert,expiring90,expired,upcoming30,openGrievance,openActions,overdueActions,simsCompliance};
  },[scoped,scopedSimsItems]);

  const nextAudits=useMemo(()=>scoped.audits.filter(a=>a.start_date>=todayISO()&&!['Done','Cancelled'].includes(a.status)).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).slice(0,5),[scoped.audits]);
  const nextExpiry=useMemo(()=>scoped.certifications.filter(c=>c.valid_until&&daysUntil(c.valid_until)>=0).sort((a,b)=>String(a.valid_until).localeCompare(String(b.valid_until))).slice(0,5),[scoped.certifications]);
  const openGrievances=useMemo(()=>scoped.grievances.filter(g=>g.status!=='Closed').sort((a,b)=>String(b.opened_date||'').localeCompare(String(a.opened_date||''))).slice(0,5),[scoped.grievances]);

  const standardSummary=useMemo(()=>{
    const map={};
    for(const c of scoped.certifications){
      const key=normalizeStandardLabel(c.standard);
      if(!map[key])map[key]={standard:key,total:0,active:0,expiring:0,expired:0};
      map[key].total++;
      const d=daysUntil(c.valid_until);
      if(c.status==='Certified'&&(d===null||d>=0))map[key].active++;
      if(d!==null&&d>=0&&d<=90)map[key].expiring++;
      if(c.status==='Expired'||(d!==null&&d<0))map[key].expired++;
    }
    return Object.values(map).sort((x,y)=>standardRank(x.standard)-standardRank(y.standard));
  },[scoped.certifications]);

  const certHealth=useMemo(()=>{
    let healthy=0,expiring=0,expired=0,other=0;
    for(const c of scoped.certifications){
      const d=daysUntil(c.valid_until);
      if(c.status==='Expired'||(d!==null&&d<0)){expired++;continue;}
      if(d!==null&&d>=0&&d<=90){expiring++;continue;}
      if(c.status==='Certified'){healthy++;continue;}
      other++;
    }
    return {healthy,expiring,expired,other,total:healthy+expiring+expired+other};
  },[scoped.certifications]);

  const expiryForecast=useMemo(()=>{
    const now=new Date();const months=[];
    for(let i=0;i<6;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;months.push({key,label:d.toLocaleDateString('en-US',{month:'short'}),count:0});}
    const byKey=Object.fromEntries(months.map(m=>[m.key,m]));
    scoped.certifications.forEach(c=>{if(!c.valid_until)return;const d=new Date(`${c.valid_until}T00:00:00`);if(Number.isNaN(d.getTime()))return;const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;if(byKey[key])byKey[key].count++;});
    return months;
  },[scoped.certifications]);

  const simsByStandard=useMemo(()=>{
    const groups={};
    for(const item of scopedSimsItems){
      const assessment=simsAssessmentMap[item.assessment_id];if(!assessment)continue;
      const std=standardMap[assessment.standard_id];const key=std?.name||std?.code||'SIMS';
      if(!groups[key])groups[key]={name:key,total:0,verified:0,year:assessment.assessment_year};
      groups[key].total++;
      if(item.self_status==='Fulfilled'&&item.verifier_status==='Verified')groups[key].verified++;
      groups[key].year=Math.max(Number(groups[key].year||0),Number(assessment.assessment_year||0));
    }
    return Object.values(groups).map(g=>({...g,pct:g.total?Math.round(g.verified/g.total*100):0}));
  },[scopedSimsItems,simsAssessmentMap,standardMap]);

  const attention=useMemo(()=>[
    {label:'Open grievances',value:stats.openGrievance},
    {label:'Open actions',value:stats.openActions},
    {label:'Overdue actions',value:stats.overdueActions},
    {label:'Audits ≤30d',value:stats.upcoming30}
  ],[stats]);

  const scopeLabel=selectedCompany?`${selectedCompany.company_code} — ${selectedCompany.company_name}`:'All Companies';
  const activeCompanies=data.companies.filter(c=>c.status!=='Inactive').length;

  return <div className="page-wrap">
    <style>{`
      .dash-hero{background:linear-gradient(135deg,#0e4e35 0%,#123d2d 58%,#183b2d 100%);border-radius:22px;padding:24px 26px;color:#fff;margin-bottom:18px;box-shadow:0 16px 36px rgba(16,60,43,.12);position:relative;overflow:hidden}.dash-hero:after{content:"";position:absolute;width:280px;height:280px;border-radius:50%;background:rgba(215,243,106,.08);right:-90px;top:-140px}.dash-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;position:relative;z-index:1}.dash-hero h1{font-size:30px;margin:0 0 7px}.dash-hero p{margin:0;color:#d2dfd7;max-width:720px;line-height:1.5}.dash-scope{display:grid;grid-template-columns:minmax(280px,1fr) auto auto;gap:10px;align-items:end;margin-top:22px;position:relative;z-index:1}.dash-scope label{display:flex;flex-direction:column;gap:6px}.dash-scope label span{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#bdd0c5;font-weight:800}.dash-scope select{height:44px;border-radius:11px;border:1px solid rgba(255,255,255,.18);background:#fff;color:#153c2c;padding:0 13px;font-weight:700;min-width:280px}.dash-scope .secondary-btn{background:rgba(255,255,255,.11);color:#fff;border:1px solid rgba(255,255,255,.16)}.dash-scope .primary-btn{background:#d7f36a;color:#153c2c}.dash-live{margin:0 0 18px}.dash-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.dash-kpis .kpi-card{min-height:118px;position:relative;overflow:hidden}.dash-kpis .kpi-card:after{content:"";position:absolute;width:70px;height:70px;border-radius:50%;right:-24px;top:-24px;background:#f2f6f3}.dash-kpis .kpi-card strong{font-size:31px}.dash-kpis .kpi-card small{line-height:1.4}.dash-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.dash-wide-grid{display:grid;grid-template-columns:1.35fr .85fr;gap:18px;margin-bottom:18px}.dash-chart{min-height:320px}.dash-chart-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px}.dash-chart-head h2{margin:0 0 4px;font-size:17px}.dash-chart-head p{margin:0;color:#7b8b82;font-size:12px}.dash-tag{display:inline-flex;padding:6px 9px;border-radius:999px;background:#eef6f1;color:#276744;font-size:10px;font-weight:800}.health-layout{display:grid;grid-template-columns:190px 1fr;align-items:center;gap:24px;min-height:225px}.health-ring{width:170px;height:170px;border-radius:50%;display:grid;place-items:center;margin:auto;position:relative}.health-ring:after{content:"";position:absolute;width:112px;height:112px;border-radius:50%;background:#fff}.health-ring-center{position:relative;z-index:1;text-align:center}.health-ring-center strong{display:block;font-size:34px;color:#143f2d}.health-ring-center span{font-size:10px;color:#809087;text-transform:uppercase;letter-spacing:.07em}.legend-list{display:flex;flex-direction:column;gap:11px}.legend-row{display:grid;grid-template-columns:12px 1fr auto;gap:9px;align-items:center;border-bottom:1px solid #edf1ee;padding-bottom:9px}.legend-row:last-child{border-bottom:0}.legend-dot{width:10px;height:10px;border-radius:50%}.legend-dot.good{background:#2e7d4f}.legend-dot.warn{background:#d69b29}.legend-dot.bad{background:#c85a4e}.legend-dot.muted{background:#cfd8d2}.legend-row span{font-size:12px;color:#65756c}.legend-row strong{font-size:15px}.forecast{height:230px;display:flex;align-items:flex-end;gap:12px;padding-top:16px}.forecast-col{flex:1;min-width:0;text-align:center;display:flex;flex-direction:column;justify-content:flex-end;height:100%}.forecast-value{font-size:11px;font-weight:800;color:#375747;margin-bottom:5px}.forecast-bar-wrap{height:170px;display:flex;align-items:flex-end;justify-content:center}.forecast-bar{width:min(46px,72%);min-height:4px;border-radius:9px 9px 3px 3px;background:linear-gradient(180deg,#d7f36a,#2e7d4f);box-shadow:0 5px 16px rgba(46,125,79,.15)}.forecast-label{font-size:11px;color:#78877e;margin-top:8px;font-weight:700}.std-bars{display:flex;flex-direction:column;gap:14px}.std-bar-row{display:grid;grid-template-columns:92px 1fr 104px;gap:12px;align-items:center}.std-bar-row>strong{font-size:12px;color:#244333}.std-track{height:12px;background:#edf2ef;border-radius:999px;overflow:hidden;position:relative}.std-fill{height:100%;background:linear-gradient(90deg,#1f704a,#86bd5a);border-radius:999px}.std-meta{text-align:right}.std-meta strong{font-size:12px}.std-meta span{display:block;font-size:10px;color:#87958d;margin-top:2px}.sims-stack{display:flex;flex-direction:column;gap:15px}.sims-row{padding:13px;border:1px solid #e3ebe6;background:#f9fbfa;border-radius:12px}.sims-row-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px}.sims-row-head strong{font-size:12px}.sims-row-head span{font-size:11px;color:#74847b}.sims-track{height:9px;background:#e8efea;border-radius:999px;overflow:hidden}.sims-track i{display:block;height:100%;background:#2e7d4f;border-radius:999px}.sims-empty{padding:24px;border:1px dashed #ccd8d0;border-radius:12px;color:#7d8b83;text-align:center;font-size:12px}.attention-bars{display:flex;flex-direction:column;gap:13px}.attention-row{display:grid;grid-template-columns:120px 1fr 34px;gap:10px;align-items:center}.attention-row span{font-size:11px;color:#66766d}.attention-track{height:9px;background:#edf2ef;border-radius:999px;overflow:hidden}.attention-track i{display:block;height:100%;background:#557c68;border-radius:999px}.attention-row.danger .attention-track i{background:#c85a4e}.attention-row strong{text-align:right;font-size:13px}.dash-list-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.dash-list-grid .panel{margin-bottom:0}.dashboard-list-row>div:last-child{text-align:right}.scope-pill{display:inline-flex;align-items:center;gap:7px;background:#eef6f1;border:1px solid #d9e8df;border-radius:999px;padding:7px 10px;font-size:11px;color:#245b3d;font-weight:800}@media(max-width:1100px){.dash-kpis{grid-template-columns:repeat(2,1fr)}.dash-chart-grid,.dash-wide-grid,.dash-list-grid{grid-template-columns:1fr}.health-layout{grid-template-columns:170px 1fr}}@media(max-width:700px){.dash-hero-top{flex-direction:column}.dash-scope{grid-template-columns:1fr}.dash-scope select{min-width:0;width:100%}.dash-kpis{grid-template-columns:1fr 1fr}.health-layout{grid-template-columns:1fr}.std-bar-row{grid-template-columns:72px 1fr 80px}.forecast{gap:6px}}
    `}</style>

    <section className="dash-hero"><div className="dash-hero-top"><div><div className="eyebrow" style={{color:'#bdd0c5'}}>EXECUTIVE SUSTAINABILITY OVERVIEW</div><h1>{selectedCompany?'Company Sustainability Overview':'Executive Sustainability Dashboard'}</h1><p>{selectedCompany?`Live sustainability overview for ${scopeLabel}. All KPI, charts and attention lists below are filtered to this PT.`:'Portfolio-wide overview of certification, audit, grievance, corrective action and SIMS compliance.'}</p></div><Link className="secondary-btn" href="/weekly-report">Open Weekly Report</Link></div><div className="dash-scope"><label><span>Overview Filter · Company / PT</span><select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}><option value="All">All Companies</option>{data.companies.filter(c=>c.status!=='Inactive').map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></label><button className="secondary-btn" onClick={()=>setCompanyFilter('All')}>Reset Overview</button><button className="primary-btn" onClick={loadDashboard}>Refresh Data</button></div></section>

    {error?<div className="sync-error dash-live"><strong>Supabase connection issue</strong><span>{error}</span></div>:!loading?<div className="sync-success dash-live">● Live Supabase data · {scopeLabel} · Certification records: {scoped.certifications.length} · Grievance records: {scoped.grievances.length}</div>:null}

    <section className="kpi-grid dash-kpis"><KPI label="Active Certificates" value={loading?'…':stats.activeCert} hint="Currently certified in selected scope"/><KPI label="Expiring ≤ 90 Days" value={loading?'…':stats.expiring90} hint="Renewal attention" tone={stats.expiring90?'warning':''}/><KPI label="Expired" value={loading?'…':stats.expired} hint="Validity already ended" tone={stats.expired?'danger':''}/><KPI label="Upcoming Audits ≤ 30 Days" value={loading?'…':stats.upcoming30} hint="Planned / confirmed audit activity"/><KPI label="Open Grievances" value={loading?'…':stats.openGrievance} hint="Cases requiring follow-up" tone={stats.openGrievance?'warning':''}/><KPI label="Open Actions" value={loading?'…':stats.openActions} hint={`${stats.overdueActions} overdue corrective action(s)`} tone={stats.overdueActions?'danger':''}/><KPI label="SIMS Compliance" value={loading?'…':scopedSimsItems.length?`${stats.simsCompliance}%`:'—'} hint={scopedSimsItems.length?'Latest assessment per standard':'No SIMS assessment yet'}/><KPI label="Overview Scope" value={loading?'…':selectedCompany?.company_code||activeCompanies} hint={selectedCompany?.company_name||'Active master companies'}/></section>

    <section className="dash-chart-grid"><div className="panel dash-chart"><div className="dash-chart-head"><div><h2>Certification Health</h2><p>Current certificate position within the selected company scope.</p></div><span className="dash-tag">{certHealth.total} record(s)</span></div><CertificationHealth health={certHealth}/></div><div className="panel dash-chart"><div className="dash-chart-head"><div><h2>Expiry Forecast · 6 Months</h2><p>Number of certificates reaching validity end by month.</p></div><span className="dash-tag">Forward view</span></div><ExpiryForecast rows={expiryForecast}/></div></section>

    <section className="dash-wide-grid"><div className="panel"><div className="dash-chart-head"><div><h2>Certification Portfolio by Standard</h2><p>Active certificate coverage compared with total records.</p></div><Link href="/certificates" className="text-link">Certification Monitoring →</Link></div><StandardBars rows={standardSummary}/></div><div className="panel"><div className="dash-chart-head"><div><h2>SIMS Compliance</h2><p>Latest assessment result for ISPO / NDPE or other active SIMS standards.</p></div><Link href="/sims/compliance" className="text-link">Compliance Level →</Link></div><SimsBars rows={simsByStandard}/></div></section>

    <section className="dash-chart-grid"><div className="panel"><div className="dash-chart-head"><div><h2>Operational Attention</h2><p>Items requiring management follow-up now.</p></div><span className="scope-pill">{selectedCompany?selectedCompany.company_code:'Portfolio'}</span></div><AttentionBars rows={attention}/></div><div className="panel"><div className="dash-chart-head"><div><h2>Nearest Certificate Expiry</h2><p>Prioritized by validity end date.</p></div><Link href="/certificates" className="text-link">Open register →</Link></div><div className="dashboard-list">{nextExpiry.length?nextExpiry.map(c=>{const d=daysUntil(c.valid_until);return <div className="dashboard-list-row" key={c.id}><div><strong>{normalizeStandardLabel(c.standard)}</strong><span>{companyMap[c.company_id]?.company_code||'-'} · {c.certificate_number||'No certificate number'}</span></div><div><strong>{formatDate(c.valid_until)}</strong><span className={d<=30?'danger-text':d<=90?'warning-text':''}>{d} days</span></div></div>}):<div className="empty-state">No certificate expiry recorded.</div>}</div></div></section>

    <section className="dash-list-grid"><div className="panel"><div className="panel-head"><div><h2>Upcoming Audits</h2><p>Nearest audit schedules for the selected scope.</p></div><Link href="/audits" className="text-link">Open calendar →</Link></div><div className="dashboard-list">{nextAudits.length?nextAudits.map(a=><div className="dashboard-list-row" key={a.id}><div><strong>{a.title}</strong><span>{companyMap[a.company_id]?.company_code||'-'} · {a.audit_type}</span></div><div><strong>{formatDate(a.start_date)}</strong><span>{a.end_date&&a.end_date!==a.start_date?`to ${formatDate(a.end_date)} · `:''}{a.status}</span></div></div>):<div className="empty-state">No upcoming audits.</div>}</div></div><div className="panel"><div className="panel-head"><div><h2>Open Grievances</h2><p>Cases requiring attention in the selected scope.</p></div><Link href="/grievances" className="text-link">Open tracker →</Link></div><div className="dashboard-list">{openGrievances.length?openGrievances.map(g=><Link href={`/grievances/${g.case_id||g.id}`} className="dashboard-list-row dashboard-link-row" key={g.id}><div><strong>{g.case_id} · {g.company||companyMap[g.company_id]?.company_code||'-'}</strong><span>{g.issue_title||g.category||'Grievance'}</span></div><div><strong>{g.status}</strong><span>{Number(g.progress||0)}% progress</span></div></Link>):<div className="empty-state">No open grievances.</div>}</div></div></section>
  </div>;
}

function KPI({label,value,hint,tone=''}){return <div className={`kpi-card ${tone?`kpi-${tone}`:''}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>}
function CertificationHealth({health}){const total=Math.max(health.total,1);const p1=health.healthy/total*100;const p2=p1+health.expiring/total*100;const p3=p2+health.expired/total*100;const style={background:`conic-gradient(#2e7d4f 0 ${p1}%,#d69b29 ${p1}% ${p2}%,#c85a4e ${p2}% ${p3}%,#cfd8d2 ${p3}% 100%)`};return <div className="health-layout"><div className="health-ring" style={style}><div className="health-ring-center"><strong>{health.total}</strong><span>Certificates</span></div></div><div className="legend-list"><Legend tone="good" label="Healthy / >90 days" value={health.healthy}/><Legend tone="warn" label="Expiring ≤90 days" value={health.expiring}/><Legend tone="bad" label="Expired" value={health.expired}/><Legend tone="muted" label="Other / pending" value={health.other}/></div></div>}
function Legend({tone,label,value}){return <div className="legend-row"><i className={`legend-dot ${tone}`}/><span>{label}</span><strong>{value}</strong></div>}
function ExpiryForecast({rows}){const max=Math.max(1,...rows.map(r=>r.count));return <div className="forecast">{rows.map(r=><div className="forecast-col" key={r.key}><div className="forecast-value">{r.count}</div><div className="forecast-bar-wrap"><div className="forecast-bar" style={{height:`${Math.max(4,r.count/max*100)}%`}}/></div><div className="forecast-label">{r.label}</div></div>)}</div>}
function StandardBars({rows}){if(!rows.length)return <div className="empty-state">No certification records in this scope.</div>;return <div className="std-bars">{rows.map(r=>{const pct=r.total?Math.round(r.active/r.total*100):0;return <div className="std-bar-row" key={r.standard}><strong>{r.standard}</strong><div className="std-track"><div className="std-fill" style={{width:`${pct}%`}}/></div><div className="std-meta"><strong>{r.active}/{r.total}</strong><span>{r.expiring} expiring</span></div></div>})}</div>}
function SimsBars({rows}){if(!rows.length)return <div className="sims-empty">No SIMS assessment yet for this scope.</div>;return <div className="sims-stack">{rows.map(r=><div className="sims-row" key={r.name}><div className="sims-row-head"><strong>{r.name}</strong><span>{r.pct}% · {r.verified}/{r.total} verified · {r.year||'-'}</span></div><div className="sims-track"><i style={{width:`${r.pct}%`}}/></div></div>)}</div>}
function AttentionBars({rows}){const max=Math.max(1,...rows.map(r=>r.value));return <div className="attention-bars">{rows.map(r=><div className={`attention-row ${r.label==='Overdue actions'&&r.value?'danger':''}`} key={r.label}><span>{r.label}</span><div className="attention-track"><i style={{width:`${Math.max(r.value?7:0,r.value/max*100)}%`}}/></div><strong>{r.value}</strong></div>)}</div>}
function normalizeStandardLabel(value){const s=String(value||'').trim();if(!s)return 'Other';const u=s.toUpperCase();if(u.includes('ISCC CORSIA'))return 'ISCC CORSIA';if(u.includes('ISCC EU'))return 'ISCC EU';if(u==='ISCC'||u.includes('ISCC'))return 'ISCC';if(u.includes('ISPO'))return 'ISPO';if(/\bINS\b/.test(u))return 'INS';if(u.includes('EUDR'))return 'EUDR';if(u.includes('GGL'))return 'GGL';if(u.includes('SMETA'))return 'SMETA';if(u.includes('VDF'))return 'VDF';return s;}
function standardRank(s){const i=CERT_STANDARDS.indexOf(s);return i<0?99:i;}
