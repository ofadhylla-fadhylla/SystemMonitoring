'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';
import { daysUntil, formatDate, todayISO } from '../lib/monitoring';

const CERT_STANDARDS = ['ISPO','ISCC EU','ISCC CORSIA','INS','GGL','EUDR'];

export default function Dashboard() {
  const [data,setData]=useState({
    grievances:[], certifications:[], audits:[], companies:[], actions:[], ndpe:[]
  });
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{ loadDashboard(); },[]);

  async function loadDashboard(){
    const configError=getSupabaseConfigError();
    if(configError||!supabase){ setError(configError||'Supabase is not configured.'); setLoading(false); return; }
    setLoading(true); setError('');

    const [g,c,a,co,ac,n] = await Promise.all([
      supabase.from('grievances').select('*').order('opened_date',{ascending:false}),
      supabase.from('certifications').select('*').order('valid_until'),
      supabase.from('audit_events').select('*').order('start_date'),
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('grievance_actions').select('*').order('target_date'),
      supabase.from('ndpe_implementation').select('*').order('target_date'),
    ]);

    // NDPE can still be an optional module on older deployments. Do not break the dashboard if it is absent.
    const hardError = g.error || c.error || a.error || co.error || ac.error;
    if(hardError) setError(hardError.message);
    setData({
      grievances:g.data||[], certifications:c.data||[], audits:a.data||[], companies:co.data||[],
      actions:ac.data||[], ndpe:n.error?[]:(n.data||[])
    });
    setLoading(false);
  }

  const companyMap=useMemo(()=>Object.fromEntries(data.companies.map(c=>[c.id,c])),[data.companies]);

  const stats=useMemo(()=>{
    const activeCert=data.certifications.filter(c=>c.status==='Certified' && (daysUntil(c.valid_until)===null || daysUntil(c.valid_until)>=0)).length;
    const expiring90=data.certifications.filter(c=>{const d=daysUntil(c.valid_until);return d!==null&&d>=0&&d<=90;}).length;
    const expired=data.certifications.filter(c=>{const d=daysUntil(c.valid_until);return c.status==='Expired'||(d!==null&&d<0);}).length;
    const upcoming30=data.audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&d<=30&&!['Done','Cancelled'].includes(a.status);}).length;
    const openGrievance=data.grievances.filter(g=>g.status!=='Closed').length;
    const openActions=data.actions.filter(a=>a.status!=='Completed').length;
    const overdueActions=data.actions.filter(a=>a.status!=='Completed'&&daysUntil(a.target_date)!==null&&daysUntil(a.target_date)<0).length;
    const ndpeAvg=data.ndpe.length?Math.round(data.ndpe.reduce((s,n)=>s+Number(n.progress||0),0)/data.ndpe.length):0;
    return { activeCert, expiring90, expired, upcoming30, openGrievance, openActions, overdueActions, ndpeAvg };
  },[data]);

  const nextAudits=useMemo(()=>data.audits
    .filter(a=>a.start_date>=todayISO()&&!['Done','Cancelled'].includes(a.status))
    .sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).slice(0,6),[data.audits]);

  const nextExpiry=useMemo(()=>data.certifications
    .filter(c=>c.valid_until&&daysUntil(c.valid_until)>=0)
    .sort((a,b)=>String(a.valid_until).localeCompare(String(b.valid_until))).slice(0,6),[data.certifications]);

  const openGrievances=useMemo(()=>data.grievances
    .filter(g=>g.status!=='Closed')
    .sort((a,b)=>String(b.opened_date||'').localeCompare(String(a.opened_date||''))).slice(0,6),[data.grievances]);

  const standardSummary=useMemo(()=>{
    const map={};
    for(const c of data.certifications){
      const key=normalizeStandardLabel(c.standard);
      if(!map[key]) map[key]={standard:key,total:0,active:0,expiring:0};
      map[key].total++;
      const d=daysUntil(c.valid_until);
      if(c.status==='Certified'&&(d===null||d>=0)) map[key].active++;
      if(d!==null&&d>=0&&d<=90) map[key].expiring++;
    }
    return Object.values(map).sort((x,y)=>standardRank(x.standard)-standardRank(y.standard));
  },[data.certifications]);

  const ndpeSummary=useMemo(()=>{
    const groups={};
    for(const n of data.ndpe){ const s=n.status||'In Progress'; groups[s]=(groups[s]||0)+1; }
    return groups;
  },[data.ndpe]);

  const realSource=useMemo(()=>({
    certification:data.certifications.filter(c=>c.source_name).length,
    grievance:data.grievances.filter(g=>g.source_file).length,
    audit:data.audits.filter(a=>a.source_name).length,
  }),[data]);

  return <div className="page-wrap">
    <div className="page-heading executive-heading">
      <div><h1>Executive Sustainability Dashboard</h1><p>Live overview of certification, audit, grievance, action plan and NDPE implementation.</p></div>
      <div className="detail-actions"><Link className="secondary-btn" href="/weekly-report">Open Weekly Report</Link><button className="primary-btn" onClick={loadDashboard}>Refresh Data</button></div>
    </div>

    {error?<div className="sync-error"><strong>Supabase connection issue</strong><span>{error}</span></div>:!loading?<div className="sync-success">● Live Supabase data · Real certification records: {realSource.certification} · Real grievance records: {realSource.grievance}</div>:null}

    <section className="kpi-grid executive-kpis">
      <KPI label="Active Certificates" value={loading?'…':stats.activeCert} hint="Currently certified" />
      <KPI label="Expiring ≤ 90 Days" value={loading?'…':stats.expiring90} hint="Renewal attention" tone={stats.expiring90?'warning':''}/>
      <KPI label="Expired" value={loading?'…':stats.expired} hint="Certificate validity" tone={stats.expired?'danger':''}/>
      <KPI label="Upcoming Audits ≤ 30 Days" value={loading?'…':stats.upcoming30} hint="Planned / confirmed" />
      <KPI label="Open Grievances" value={loading?'…':stats.openGrievance} hint="Need follow-up" tone={stats.openGrievance?'warning':''}/>
      <KPI label="Open Actions" value={loading?'…':stats.openActions} hint={`${stats.overdueActions} overdue`} tone={stats.overdueActions?'danger':''}/>
      <KPI label="NDPE Avg Progress" value={loading?'…':`${stats.ndpeAvg}%`} hint={`${data.ndpe.length} implementation item(s)`}/>
      <KPI label="Companies" value={loading?'…':data.companies.filter(c=>c.status!=='Inactive').length} hint="Active master entities" />
    </section>

    <section className="exec-grid">
      <div className="panel exec-span-2">
        <div className="panel-head"><div><h2>Certification Portfolio</h2><p>Current certificate register grouped by standard.</p></div><Link href="/certificates" className="text-link">Certification Monitoring →</Link></div>
        <div className="portfolio-grid">
          {standardSummary.length?standardSummary.map(s=><div className="portfolio-card" key={s.standard}><div><strong>{s.standard}</strong><span>{s.total} record(s)</span></div><div className="portfolio-metrics"><span><b>{s.active}</b> active</span><span className={s.expiring?'warning-text':''}><b>{s.expiring}</b> expiring</span></div></div>):<div className="empty-state">No certification records.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h2>NDPE Snapshot</h2><p>Implementation status summary.</p></div><Link href="/documents" className="text-link">Open NDPE →</Link></div>
        {data.ndpe.length?<div className="status-stack">{Object.entries(ndpeSummary).map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>:<div className="empty-state">No NDPE implementation records yet.</div>}
      </div>
    </section>

    <section className="two-col executive-two-col">
      <div className="panel"><div className="panel-head"><div><h2>Upcoming Audits</h2><p>Nearest audit schedules from Audit Monitoring.</p></div><Link href="/audits" className="text-link">Open calendar →</Link></div><div className="dashboard-list">{nextAudits.length?nextAudits.map(a=><div className="dashboard-list-row" key={a.id}><div><strong>{a.title}</strong><span>{companyMap[a.company_id]?.company_code||'-'} · {a.audit_type}</span></div><div><strong>{formatDate(a.start_date)}</strong><span>{a.end_date&&a.end_date!==a.start_date?`to ${formatDate(a.end_date)} · `:''}{a.status}</span></div></div>):<div className="empty-state">No upcoming audits.</div>}</div></div>
      <div className="panel"><div className="panel-head"><div><h2>Certificate Expiry Watch</h2><p>Nearest validity end dates.</p></div><Link href="/certificates" className="text-link">Open register →</Link></div><div className="dashboard-list">{nextExpiry.length?nextExpiry.map(c=>{const d=daysUntil(c.valid_until);return <div className="dashboard-list-row" key={c.id}><div><strong>{c.standard}</strong><span>{companyMap[c.company_id]?.company_code||'-'} · {c.certificate_number||'No certificate number'}</span></div><div><strong>{formatDate(c.valid_until)}</strong><span className={d<=30?'danger-text':d<=90?'warning-text':''}>{d} days</span></div></div>}):<div className="empty-state">No certificate expiry recorded.</div>}</div></div>
    </section>

    <section className="two-col executive-two-col">
      <div className="panel"><div className="panel-head"><div><h2>Open Grievances</h2><p>Real grievance register requiring follow-up.</p></div><Link href="/grievances" className="text-link">Open tracker →</Link></div><div className="dashboard-list">{openGrievances.length?openGrievances.map(g=><Link href={`/grievances/${g.case_id||g.id}`} className="dashboard-list-row dashboard-link-row" key={g.id}><div><strong>{g.case_id} · {g.company||companyMap[g.company_id]?.company_code||'-'}</strong><span>{g.issue_title||g.category||'Grievance'}</span></div><div><strong>{g.status}</strong><span>{Number(g.progress||0)}% progress</span></div></Link>):<div className="empty-state">No open grievances.</div>}</div></div>
      <div className="panel"><div className="panel-head"><div><h2>Action Attention</h2><p>Open grievance corrective actions.</p></div><Link href="/actions" className="text-link">Action Monitoring →</Link></div><div className="attention-box"><div><span>Open Actions</span><strong>{stats.openActions}</strong></div><div className={stats.overdueActions?'attention-danger':''}><span>Overdue</span><strong>{stats.overdueActions}</strong></div></div><div className="dashboard-cta"><Link href="/weekly-report" className="primary-btn">Prepare Weekly Report</Link><span>Build the bilingual draft from live Audit, Certification and Grievance data.</span></div></div>
    </section>
  </div>;
}

function KPI({label,value,hint,tone=''}){return <div className={`kpi-card ${tone?`kpi-${tone}`:''}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>}
function normalizeStandardLabel(value){ const s=String(value||'').trim(); if(!s)return 'Other'; const u=s.toUpperCase(); if(u.includes('ISCC CORSIA'))return 'ISCC CORSIA'; if(u.includes('ISCC EU'))return 'ISCC EU'; if(u==='ISCC'||u.includes('ISCC'))return 'ISCC'; if(u.includes('ISPO'))return 'ISPO'; if(/\bINS\b/.test(u))return 'INS'; if(u.includes('EUDR'))return 'EUDR'; if(u.includes('GGL'))return 'GGL'; return s; }
function standardRank(s){ const i=CERT_STANDARDS.indexOf(s); return i<0?99:i; }
