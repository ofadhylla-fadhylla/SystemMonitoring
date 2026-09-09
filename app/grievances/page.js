'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';
import { daysUntil, todayISO } from '../../lib/monitoring';

const emptyForm = {
  companyId: '', siteId: '', company: '', location: '', category: 'Land Conflict', title: '', source: '', opened: '',
  risk: 'Medium', status: 'Open', progress: 0, pic: '', nextAction: '', dueDate: '', summary: '',
};

export default function GrievanceTracker() {
  const [grievances, setGrievances] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [risk, setRisk] = useState('All');
  const [companyFilter, setCompanyFilter] = useState('All');
  const [siteFilter, setSiteFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const configError = getSupabaseConfigError();
    if (configError || !supabase) { setError(configError || 'Supabase is not configured.'); setLoading(false); return; }
    setLoading(true); setError('');
    const [gRes, cRes, sRes] = await Promise.all([
      supabase.from('grievances').select('*').order('created_at', { ascending: false }),
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('sites').select('*').order('site_name'),
    ]);
    const anyError = gRes.error || cRes.error || sRes.error;
    if (anyError) setError(anyError.message);
    setGrievances((gRes.data || []).map(mapDbCase));
    setCompanies(cRes.data || []);
    setSites(sRes.data || []);
    setLoading(false);
  }

  const categories = useMemo(() => [...new Set(grievances.map(g=>g.category).filter(Boolean))].sort(), [grievances]);
  const years = useMemo(() => [...new Set(grievances.map(g=>String(g.opened||'').slice(0,4)).filter(Boolean))].sort().reverse(), [grievances]);
  const filteredSites = useMemo(() => sites.filter(s => companyFilter==='All' || s.company_id===companyFilter), [sites, companyFilter]);

  const filtered = useMemo(() => grievances.filter(g => {
    const text = `${g.id} ${g.company} ${g.location} ${g.category} ${g.title}`.toLowerCase();
    return text.includes(search.toLowerCase()) &&
      (status === 'All' || g.status === status) &&
      (risk === 'All' || g.risk === risk) &&
      (companyFilter === 'All' || g.companyId === companyFilter) &&
      (siteFilter === 'All' || g.siteId === siteFilter) &&
      (categoryFilter === 'All' || g.category === categoryFilter) &&
      (yearFilter === 'All' || String(g.opened||'').startsWith(yearFilter));
  }), [grievances, search, status, risk, companyFilter, siteFilter, categoryFilter, yearFilter]);

  const stats = useMemo(() => ({
    total: filtered.length,
    open: filtered.filter(g=>g.status==='Open').length,
    progress: filtered.filter(g=>g.status==='In Progress').length,
    verification: filtered.filter(g=>g.status==='Verification').length,
    overdue: filtered.filter(g=>g.status!=='Closed' && daysUntil(g.dueDate)!==null && daysUntil(g.dueDate)<0).length,
    closed: filtered.filter(g=>g.status==='Closed').length,
    high: filtered.filter(g=>['High','Critical'].includes(g.risk) && g.status!=='Closed').length,
  }), [filtered]);

  const statusBars = useMemo(() => ['Open','In Progress','Verification','Closed'].map(label=>({label,value:filtered.filter(g=>g.status===label).length})), [filtered]);
  const categoryBars = useMemo(() => {
    const counts={}; filtered.forEach(g=>{counts[g.category||'Other']=(counts[g.category||'Other']||0)+1;});
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,value])=>({label,value}));
  }, [filtered]);

  function updateForm(field, value) {
    setForm(prev => {
      const next={...prev,[field]:value};
      if(field==='companyId'){
        const company=companies.find(c=>c.id===value);
        next.company=company ? `${company.company_code} — ${company.company_name}` : '';
        next.siteId=''; next.location='';
      }
      if(field==='siteId'){
        const site=sites.find(s=>s.id===value); next.location=site?.site_name||'';
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault(); if(!supabase) return;
    setSaving(true); setError(''); const opened=form.opened||todayISO();
    const selectedCompany=companies.find(c=>c.id===form.companyId);
    const selectedSite=sites.find(s=>s.id===form.siteId);
    const payload={
      company_id:form.companyId||null,site_id:form.siteId||null,
      company:selectedCompany ? selectedCompany.company_code : (form.company||'').trim(),
      site:selectedSite ? selectedSite.site_name : (form.location||'').trim(),
      category:form.category,issue_title:form.title.trim(),complaint_source:form.source.trim()||null,opened_date:opened,
      risk_level:form.risk,status:form.status,progress:clampProgress(form.progress),pic:form.pic.trim()||null,
      next_action:form.nextAction.trim()||null,due_date:form.dueDate||null,case_summary:form.summary.trim()||null,
    };
    const {data:inserted,error:insertError}=await supabase.from('grievances').insert(payload).select('*').single();
    if(insertError){setError(insertError.message);setSaving(false);return;}
    await supabase.from('grievance_updates').insert({grievance_id:inserted.id,update_date:opened,update_title:'Complaint Received',notes:'Grievance registered in System Monitoring.',case_status:form.status,progress:clampProgress(form.progress),next_action:form.nextAction.trim()||null,due_date:form.dueDate||null});
    setForm(emptyForm);setShowForm(false);setSaving(false);await loadAll();
  }

  return <div className="page-wrap">
    <div className="page-heading"><div><h1>Grievance Tracker</h1><p>Register, monitor, filter and analyze stakeholder grievance cases.</p></div><button className="primary-btn" onClick={()=>setShowForm(true)}>+ Add Grievance</button></div>
    {error?<div className="sync-error"><strong>Supabase error</strong><span>{error}</span></div>:<div className="sync-success">● Supabase mode — shared grievance database</div>}

    <section className="grievance-filter-panel panel">
      <div className="dashboard-filter-grid">
        <select value={yearFilter} onChange={e=>setYearFilter(e.target.value)}><option value="All">All Years</option>{years.map(y=><option key={y}>{y}</option>)}</select>
        <select value={companyFilter} onChange={e=>{setCompanyFilter(e.target.value);setSiteFilter('All')}}><option value="All">All Companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code}</option>)}</select>
        <select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}><option value="All">All Sites</option>{filteredSites.map(s=><option key={s.id} value={s.id}>{s.site_name}</option>)}</select>
        <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="All">All Categories</option>{categories.map(v=><option key={v}>{v}</option>)}</select>
        <select value={risk} onChange={e=>setRisk(e.target.value)}>{['All','Critical','High','Medium','Low'].map(v=><option key={v}>{v==='All'?'All Risks':v}</option>)}</select>
        <select value={status} onChange={e=>setStatus(e.target.value)}>{['All','Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v==='All'?'All Statuses':v}</option>)}</select>
      </div>
    </section>

    <section className="kpi-grid grievance-kpis">
      <KPI label="Total" value={loading?'…':stats.total}/><KPI label="Open" value={loading?'…':stats.open}/><KPI label="In Progress" value={loading?'…':stats.progress}/><KPI label="Verification" value={loading?'…':stats.verification}/><KPI label="Overdue" value={loading?'…':stats.overdue}/><KPI label="Closed" value={loading?'…':stats.closed}/><KPI label="High / Critical" value={loading?'…':stats.high}/>
    </section>

    <section className="two-col grievance-insights">
      <div className="panel"><div className="panel-head"><div><h2>Cases by Status</h2><p>Based on current filters.</p></div></div><BarList rows={statusBars}/></div>
      <div className="panel"><div className="panel-head"><div><h2>Top Categories</h2><p>Highest grievance volume.</p></div></div><BarList rows={categoryBars}/></div>
    </section>

    <section className="panel">
      <div className="filters grievance-search"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search case, company, category..."/><div className="result-count">{loading?'Loading…':`${filtered.length} case(s)`}</div></div>
      <div className="table-wrap"><table><thead><tr><th>Case ID</th><th>Company / Site</th><th>Issue</th><th>Risk</th><th>Status</th><th>Progress</th><th>Due Date</th><th></th></tr></thead><tbody>
        {loading?<tr><td colSpan="8" className="empty-cell">Loading grievance data from Supabase…</td></tr>:filtered.length?filtered.map(g=><tr key={g.id}><td><strong>{g.id}</strong><div className="muted">{g.opened}</div></td><td>{g.company}<div className="muted">{g.location}</div></td><td>{g.title}<div className="muted">{g.category}</div></td><td><span className={`badge ${String(g.risk).toLowerCase()}`}>{g.risk}</span></td><td><span className="status-pill">{g.status}</span></td><td><div className="progress"><div style={{width:`${g.progress}%`}}></div></div><div className="muted">{g.progress}%</div></td><td>{g.dueDate||'-'}{g.status!=='Closed'&&daysUntil(g.dueDate)!==null&&daysUntil(g.dueDate)<0?<div className="danger-text">Overdue</div>:null}</td><td><Link href={`/grievances/${g.id}`} className="view-btn">View</Link></td></tr>):<tr><td colSpan="8" className="empty-cell">No grievance found.</td></tr>}
      </tbody></table></div>
    </section>

    {showForm&&<div className="modal-backdrop" onMouseDown={()=>!saving&&setShowForm(false)}><div className="modal-card" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Add Grievance</h2><p>Use Master Company & Site for consistent reporting.</p></div><button className="icon-btn" onClick={()=>setShowForm(false)} disabled={saving}>×</button></div><form onSubmit={handleSubmit}><div className="form-grid">
      <Field label="Company *"><select required value={form.companyId} onChange={e=>updateForm('companyId',e.target.value)}><option value="">Select company…</option>{companies.filter(c=>c.status==='Active').map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></Field>
      <Field label="Site / Location"><select value={form.siteId} onChange={e=>updateForm('siteId',e.target.value)}><option value="">Company level / not specified</option>{sites.filter(s=>s.company_id===form.companyId&&s.status==='Active').map(s=><option key={s.id} value={s.id}>{s.site_name} ({s.site_type})</option>)}</select></Field>
      <Field label="Category *"><select value={form.category} onChange={e=>updateForm('category',e.target.value)}>{['Land Conflict','Environmental','Social','Labor','HCV / HCS','Deforestation / NDPE','Legal / Permit','Supplier','Buyer Requirement','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
      <Field label="Issue / Title *"><input required value={form.title} onChange={e=>updateForm('title',e.target.value)} placeholder="Short grievance title"/></Field>
      <Field label="Complaint Source"><input value={form.source} onChange={e=>updateForm('source',e.target.value)} placeholder="Community, worker, buyer..."/></Field>
      <Field label="Opened Date"><input type="date" value={form.opened} onChange={e=>updateForm('opened',e.target.value)}/></Field>
      <Field label="Risk Level"><select value={form.risk} onChange={e=>updateForm('risk',e.target.value)}>{['Critical','High','Medium','Low'].map(v=><option key={v}>{v}</option>)}</select></Field>
      <Field label="Status"><select value={form.status} onChange={e=>updateForm('status',e.target.value)}>{['Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}</select></Field>
      <Field label="Progress %"><input type="number" min="0" max="100" value={form.progress} onChange={e=>updateForm('progress',e.target.value)}/></Field>
      <Field label="PIC"><input value={form.pic} onChange={e=>updateForm('pic',e.target.value)} placeholder="Responsible person/team"/></Field>
      <Field label="Next Action"><input value={form.nextAction} onChange={e=>updateForm('nextAction',e.target.value)} placeholder="Next follow-up action"/></Field>
      <Field label="Due Date"><input type="date" value={form.dueDate} onChange={e=>updateForm('dueDate',e.target.value)}/></Field>
      <Field label="Case Summary" wide><textarea rows="4" value={form.summary} onChange={e=>updateForm('summary',e.target.value)} placeholder="Brief description of the grievance and current situation"/></Field>
    </div><div className="form-actions"><button type="button" className="secondary-btn" onClick={()=>setShowForm(false)} disabled={saving}>Cancel</button><button className="primary-btn" disabled={saving}>{saving?'Saving…':'Save to Supabase'}</button></div></form></div></div>}
  </div>;
}

function KPI({label,value}){return <div className="kpi-card"><span>{label}</span><strong>{value}</strong></div>}
function Field({label,children,wide=false}){return <label className={`form-field ${wide?'wide':''}`}><span>{label}</span>{children}</label>}
function BarList({rows}){const max=Math.max(1,...rows.map(r=>r.value));return <div className="bar-list">{rows.length?rows.map(r=><div className="bar-row" key={r.label}><span>{r.label}</span><div><i style={{width:`${Math.round(r.value/max*100)}%`}}></i></div><strong>{r.value}</strong></div>):<div className="empty-state">No data</div>}</div>}
function mapDbCase(row){return{rowId:row.id,id:row.case_id,companyId:row.company_id||'',siteId:row.site_id||'',company:row.company||'',location:row.site||'',category:row.category||'',title:row.issue_title||'',source:row.complaint_source||'',opened:row.opened_date||'',risk:row.risk_level||'Medium',status:row.status||'Open',progress:Number(row.progress||0),pic:row.pic||'',nextAction:row.next_action||'',dueDate:row.due_date||'',summary:row.case_summary||''}}
function clampProgress(value){return Math.min(100,Math.max(0,Number(value)||0))}
