'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';

const emptyCompany = { code:'', name:'', region:'', province:'', status:'Active' };
const emptySite = { companyId:'', code:'', name:'', type:'Estate', province:'', location:'', status:'Active' };

export default function MasterData() {
  const [companies,setCompanies]=useState([]);
  const [sites,setSites]=useState([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [companyForm,setCompanyForm]=useState(emptyCompany);
  const [siteForm,setSiteForm]=useState(emptySite);
  const [showCompany,setShowCompany]=useState(false);
  const [showSite,setShowSite]=useState(false);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{loadAll();},[]);
  async function loadAll(){
    const configError=getSupabaseConfigError();
    if(configError||!supabase){setError(configError||'Supabase is not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    const [c,s]=await Promise.all([
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('sites').select('*').order('site_name')
    ]);
    if(c.error||s.error)setError((c.error||s.error).message);
    setCompanies(c.data||[]);setSites(s.data||[]);setLoading(false);
  }
  const companyMap=useMemo(()=>Object.fromEntries(companies.map(c=>[c.id,c])),[companies]);

  async function saveCompany(e){
    e.preventDefault();setSaving(true);setError('');
    const {error:err}=await supabase.from('companies').insert({
      company_code:companyForm.code.trim().toUpperCase(), company_name:companyForm.name.trim(), region:companyForm.region.trim()||null,
      province:companyForm.province.trim()||null,status:companyForm.status
    });
    if(err)setError(err.message);else{setShowCompany(false);setCompanyForm(emptyCompany);}setSaving(false);await loadAll();
  }
  async function saveSite(e){
    e.preventDefault();setSaving(true);setError('');
    const {error:err}=await supabase.from('sites').insert({
      company_id:siteForm.companyId,site_code:siteForm.code.trim()||null,site_name:siteForm.name.trim(),site_type:siteForm.type,
      province:siteForm.province.trim()||null,location:siteForm.location.trim()||null,status:siteForm.status
    });
    if(err)setError(err.message);else{setShowSite(false);setSiteForm(emptySite);}setSaving(false);await loadAll();
  }

  return <div className="page-wrap">
    <div className="page-heading"><div><h1>Master Company & Site</h1><p>Shared master data used by Grievance, Certification and Audit Monitoring.</p></div><div className="detail-actions"><button className="secondary-btn" onClick={()=>setShowSite(true)}>+ Add Site</button><button className="primary-btn" onClick={()=>setShowCompany(true)}>+ Add Company</button></div></div>
    {error?<div className="sync-error"><strong>Supabase error</strong><span>{error}</span></div>:null}
    <section className="two-col master-grid">
      <div className="panel"><div className="panel-head"><div><h2>Companies</h2><p>PT / legal entity master.</p></div></div><div className="table-wrap"><table><thead><tr><th>Code</th><th>Company</th><th>Region</th><th>Province</th><th>Status</th></tr></thead><tbody>
        {loading?<tr><td colSpan="5" className="empty-cell">Loading…</td></tr>:companies.length?companies.map(c=><tr key={c.id}><td><strong>{c.company_code}</strong></td><td>{c.company_name}</td><td>{c.region||'-'}</td><td>{c.province||'-'}</td><td><span className="status-pill">{c.status}</span></td></tr>):<tr><td colSpan="5" className="empty-cell">No company master yet.</td></tr>}
      </tbody></table></div></div>
      <div className="panel"><div className="panel-head"><div><h2>Sites / Units</h2><p>Estate, Mill, KCP, Bulking and other units.</p></div></div><div className="table-wrap"><table><thead><tr><th>Company</th><th>Site</th><th>Type</th><th>Province</th><th>Status</th></tr></thead><tbody>
        {loading?<tr><td colSpan="5" className="empty-cell">Loading…</td></tr>:sites.length?sites.map(s=><tr key={s.id}><td>{companyMap[s.company_id]?.company_code||'-'}</td><td><strong>{s.site_name}</strong><div className="muted">{s.site_code||''}</div></td><td>{s.site_type}</td><td>{s.province||'-'}</td><td><span className="status-pill">{s.status}</span></td></tr>):<tr><td colSpan="5" className="empty-cell">No site master yet.</td></tr>}
      </tbody></table></div></div>
    </section>

    {showCompany?<div className="modal-backdrop" onMouseDown={()=>!saving&&setShowCompany(false)}><div className="modal-card" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Add Company</h2><p>Create PT master once, then reuse it across modules.</p></div><button className="icon-btn" onClick={()=>setShowCompany(false)}>×</button></div><form onSubmit={saveCompany}><div className="form-grid">
      <Field label="Company Code *"><input required value={companyForm.code} onChange={e=>setCompanyForm({...companyForm,code:e.target.value})} placeholder="THIP" /></Field>
      <Field label="Company Name *"><input required value={companyForm.name} onChange={e=>setCompanyForm({...companyForm,name:e.target.value})} placeholder="PT. ..." /></Field>
      <Field label="Region"><input value={companyForm.region} onChange={e=>setCompanyForm({...companyForm,region:e.target.value})} /></Field>
      <Field label="Province"><input value={companyForm.province} onChange={e=>setCompanyForm({...companyForm,province:e.target.value})} /></Field>
      <Field label="Status"><select value={companyForm.status} onChange={e=>setCompanyForm({...companyForm,status:e.target.value})}><option>Active</option><option>Inactive</option></select></Field>
    </div><div className="form-actions"><button type="button" className="secondary-btn" onClick={()=>setShowCompany(false)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving?'Saving…':'Save Company'}</button></div></form></div></div>:null}

    {showSite?<div className="modal-backdrop" onMouseDown={()=>!saving&&setShowSite(false)}><div className="modal-card" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Add Site / Unit</h2><p>Link an operating unit to its company.</p></div><button className="icon-btn" onClick={()=>setShowSite(false)}>×</button></div><form onSubmit={saveSite}><div className="form-grid">
      <Field label="Company *"><select required value={siteForm.companyId} onChange={e=>setSiteForm({...siteForm,companyId:e.target.value})}><option value="">Select company…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></Field>
      <Field label="Site Name *"><input required value={siteForm.name} onChange={e=>setSiteForm({...siteForm,name:e.target.value})} placeholder="Estate / Mill name" /></Field>
      <Field label="Site Code"><input value={siteForm.code} onChange={e=>setSiteForm({...siteForm,code:e.target.value})} /></Field>
      <Field label="Site Type"><select value={siteForm.type} onChange={e=>setSiteForm({...siteForm,type:e.target.value})}>{['Estate','Mill','KCP','Bulking','Office','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
      <Field label="Province"><input value={siteForm.province} onChange={e=>setSiteForm({...siteForm,province:e.target.value})} /></Field>
      <Field label="Location"><input value={siteForm.location} onChange={e=>setSiteForm({...siteForm,location:e.target.value})} /></Field>
      <Field label="Status"><select value={siteForm.status} onChange={e=>setSiteForm({...siteForm,status:e.target.value})}><option>Active</option><option>Inactive</option></select></Field>
    </div><div className="form-actions"><button type="button" className="secondary-btn" onClick={()=>setShowSite(false)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving?'Saving…':'Save Site'}</button></div></form></div></div>:null}
  </div>;
}
function Field({label,children}){return <label className="form-field"><span>{label}</span>{children}</label>}
