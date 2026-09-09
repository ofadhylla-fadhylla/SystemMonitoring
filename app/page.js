'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';
import { daysUntil, formatDate, todayISO } from '../lib/monitoring';

export default function Dashboard() {
  const [grievances,setGrievances]=useState([]);
  const [certifications,setCertifications]=useState([]);
  const [audits,setAudits]=useState([]);
  const [companies,setCompanies]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{loadDashboard();},[]);
  async function loadDashboard(){
    const configError=getSupabaseConfigError();
    if(configError||!supabase){setError(configError||'Supabase is not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    const [g,c,a,co]=await Promise.all([
      supabase.from('grievances').select('*').order('created_at',{ascending:false}),
      supabase.from('certifications').select('*').order('valid_until'),
      supabase.from('audit_events').select('*').order('start_date'),
      supabase.from('companies').select('*').order('company_code')
    ]);
    const err=g.error||c.error||a.error||co.error;if(err)setError(err.message);
    setGrievances(g.data||[]);setCertifications(c.data||[]);setAudits(a.data||[]);setCompanies(co.data||[]);setLoading(false);
  }
  const companyMap=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);
  const stats=useMemo(()=>({
    open:grievances.filter(g=>g.status!=='Closed').length,
    high:grievances.filter(g=>['High','Critical'].includes(g.risk_level)&&g.status!=='Closed').length,
    certActive:certifications.filter(c=>c.status==='Certified'&&(daysUntil(c.valid_until)===null||daysUntil(c.valid_until)>=0)).length,
    expiring:certifications.filter(c=>{const d=daysUntil(c.valid_until);return d!==null&&d>=0&&d<=90;}).length,
  }),[grievances,certifications]);
  const nextAudits=useMemo(()=>audits.filter(a=>a.start_date>=todayISO()&&!['Done','Cancelled'].includes(a.status)).sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date))).slice(0,5),[audits]);
  const nextExpiry=useMemo(()=>certifications.filter(c=>c.valid_until&&daysUntil(c.valid_until)>=0).sort((a,b)=>String(a.valid_until).localeCompare(String(b.valid_until))).slice(0,5),[certifications]);

  return <div className="page-wrap">
    <div className="page-heading"><div><h1>Executive Dashboard</h1><p>Grievance, certification and audit schedule in one Supabase workspace.</p></div></div>
    {error?<div className="sync-error"><strong>Supabase connection issue</strong><span>{error}</span></div>:!loading?<div className="sync-success">● Supabase connected — live shared data</div>:null}
    <section className="kpi-grid"><KPI label="Open Grievances" value={loading?'…':stats.open} hint="Need follow-up"/><KPI label="High / Critical Risk" value={loading?'…':stats.high} hint="Priority grievance"/><KPI label="Active Certificates" value={loading?'…':stats.certActive} hint="Currently certified"/><KPI label="Expiring ≤ 90 Days" value={loading?'…':stats.expiring} hint="Plan audit / renewal"/></section>
    <section className="two-col">
      <div className="panel"><div className="panel-head"><div><h2>Upcoming Audits</h2><p>Nearest planned audit schedule.</p></div><Link href="/audits" className="text-link">Open calendar →</Link></div><div className="dashboard-list">{nextAudits.length?nextAudits.map(a=><div className="dashboard-list-row" key={a.id}><div><strong>{a.title}</strong><span>{companyMap[a.company_id]?.company_code||'-'} · {a.audit_type}</span></div><div><strong>{formatDate(a.start_date)}</strong><span>{a.status}</span></div></div>):<div className="empty-state">No upcoming audits.</div>}</div></div>
      <div className="panel"><div className="panel-head"><div><h2>Certificate Expiry Watch</h2><p>Validity dates from Certification Monitoring.</p></div><Link href="/certificates" className="text-link">Open register →</Link></div><div className="dashboard-list">{nextExpiry.length?nextExpiry.map(c=>{const d=daysUntil(c.valid_until);return <div className="dashboard-list-row" key={c.id}><div><strong>{c.standard}</strong><span>{companyMap[c.company_id]?.company_code||'-'} · {c.certificate_number||'No number'}</span></div><div><strong>{formatDate(c.valid_until)}</strong><span className={d<=30?'danger-text':d<=90?'warning-text':''}>{d} days</span></div></div>}):<div className="empty-state">No certificate expiry recorded.</div>}</div></div>
    </section>
    <section className="panel"><div className="panel-head"><div><h2>Modules</h2><p>Current development foundation.</p></div></div><div className="module-list">{[
      ['Grievance Tracker','SUPABASE'],['Certification Monitoring','SUPABASE'],['Audit Monitoring Calendar','SUPABASE'],['Master Company & Site','SUPABASE'],['Action Monitoring','NEXT'],['Document Monitoring','NEXT'],['EUDR / NDPE','PLANNED'],['Buyer Requirement','PLANNED']
    ].map(([m,s],i)=><div className="module-row" key={m}><span>{String(i+1).padStart(2,'0')}</span><strong>{m}</strong><em>{s}</em></div>)}</div></section>
  </div>;
}
function KPI({label,value,hint}){return <div className="kpi-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>}
