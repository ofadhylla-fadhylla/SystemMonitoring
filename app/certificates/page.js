'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';
import { daysUntil, expiryState, formatDate } from '../../lib/monitoring';

const emptyForm = {
  companyId: '', siteId: '', certificationType: 'Mandatory', standard: 'ISPO', certificateNumber: '',
  product: '', scope: '', status: 'In Progress', issueDate: '', validFrom: '', validUntil: '',
  certificationBody: '', remarks: ''
};

export default function CertificationMonitoring() {
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [companyFilter, setCompanyFilter] = useState('All');
  const [standardFilter, setStandardFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [resumeCompany, setResumeCompany] = useState('');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const configError = getSupabaseConfigError();
    if (configError || !supabase) {
      setError(configError || 'Supabase is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true); setError('');
    const [companiesRes, sitesRes, certRes, auditsRes] = await Promise.all([
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('sites').select('*').order('site_name'),
      supabase.from('certifications').select('*').order('created_at', { ascending: false }),
      supabase.from('audit_events').select('*').order('start_date', { ascending: false }),
    ]);
    const anyError = companiesRes.error || sitesRes.error || certRes.error || auditsRes.error;
    if (anyError) setError(anyError.message);
    setCompanies(companiesRes.data || []);
    setSites(sitesRes.data || []);
    setCertifications(certRes.data || []);
    setAudits(auditsRes.data || []);
    setLoading(false);
  }

  const companyMap = useMemo(() => Object.fromEntries(companies.map(c => [c.id, c])), [companies]);
  const siteMap = useMemo(() => Object.fromEntries(sites.map(s => [s.id, s])), [sites]);
  const standards = useMemo(() => [...new Set(certifications.map(c => c.standard).filter(Boolean))].sort(), [certifications]);

  const filtered = useMemo(() => certifications.filter(c =>
    (companyFilter === 'All' || c.company_id === companyFilter) &&
    (standardFilter === 'All' || c.standard === standardFilter) &&
    (statusFilter === 'All' || displayStatus(c) === statusFilter)
  ), [certifications, companyFilter, standardFilter, statusFilter]);

  const resumeCerts = useMemo(() => resumeCompany ? certifications.filter(c => c.company_id === resumeCompany) : [], [certifications, resumeCompany]);
  const resumeCompanyRow = companyMap[resumeCompany];

  const stats = useMemo(() => {
    const certified = certifications.filter(c => displayStatus(c) === 'Certified').length;
    const inProgress = certifications.filter(c => displayStatus(c) === 'In Progress').length;
    const expired = certifications.filter(c => displayStatus(c) === 'Expired').length;
    const expiring = certifications.filter(c => {
      const d = daysUntil(c.valid_until);
      return d !== null && d >= 0 && d <= 90 && displayStatus(c) !== 'Expired';
    }).length;
    return { total: certifications.length, certified, inProgress, expired, expiring };
  }, [certifications]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({
      companyId: row.company_id || '', siteId: row.site_id || '', certificationType: row.certification_type || 'Mandatory',
      standard: row.standard || 'ISPO', certificateNumber: row.certificate_number || '', product: row.product || '', scope: row.scope || '',
      status: row.status || 'In Progress', issueDate: row.issue_date || '', validFrom: row.valid_from || '', validUntil: row.valid_until || '',
      certificationBody: row.certification_body || '', remarks: row.remarks || ''
    });
    setShowForm(true);
  }

  function updateForm(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'companyId') next.siteId = '';
      return next;
    });
  }

  async function saveCertification(e) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true); setError('');
    const payload = {
      company_id: form.companyId,
      site_id: form.siteId || null,
      certification_type: form.certificationType,
      standard: form.standard.trim(),
      certificate_number: form.certificateNumber.trim() || null,
      product: form.product.trim() || null,
      scope: form.scope.trim() || null,
      status: form.status,
      issue_date: form.issueDate || null,
      valid_from: form.validFrom || null,
      valid_until: form.validUntil || null,
      certification_body: form.certificationBody.trim() || null,
      remarks: form.remarks.trim() || null,
    };
    let result;
    if (editingId) result = await supabase.from('certifications').update(payload).eq('id', editingId);
    else result = await supabase.from('certifications').insert(payload);
    if (result.error) setError(result.error.message);
    else { setShowForm(false); setEditingId(null); setForm(emptyForm); }
    setSaving(false);
    await loadAll();
  }

  async function openReport(audit) {
    if (!audit?.report_storage_path || !supabase) return;
    const { data, error: signError } = await supabase.storage.from('audit-reports').createSignedUrl(audit.report_storage_path, 60);
    if (signError) { setError(signError.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function latestAudit(certId) {
    return audits
      .filter(a => a.certification_id === certId)
      .sort((a,b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))[0] || null;
  }

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <h1>Certification Monitoring</h1>
          <p>Certificate register, validity monitoring, company resume and linked audit history.</p>
        </div>
        <button className="primary-btn" onClick={openNew}>+ Add Certification</button>
      </div>

      {error ? <div className="sync-error"><strong>Supabase error</strong><span>{error}</span></div> : null}

      <section className="kpi-grid certification-kpis">
        <KPI label="Total Records" value={loading ? '…' : stats.total} />
        <KPI label="Certified" value={loading ? '…' : stats.certified} />
        <KPI label="Expiring ≤ 90 Days" value={loading ? '…' : stats.expiring} />
        <KPI label="In Progress / Expired" value={loading ? '…' : `${stats.inProgress} / ${stats.expired}`} />
      </section>

      <section className="panel resume-panel">
        <div className="panel-head">
          <div><h2>Company Certification Resume</h2><p>Select a PT to see all certification records and latest audit details.</p></div>
          <select className="inline-select" value={resumeCompany} onChange={e => setResumeCompany(e.target.value)}>
            <option value="">Select company…</option>
            {companies.filter(c => c.status === 'Active').map(c => <option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}
          </select>
        </div>

        {!resumeCompany ? (
          <div className="empty-state">Choose a company to display its certification resume.</div>
        ) : (
          <>
            <div className="company-resume-head">
              <div><span>Company</span><strong>{resumeCompanyRow?.company_code || '-'} — {resumeCompanyRow?.company_name || '-'}</strong></div>
              <div><span>Region / Province</span><strong>{[resumeCompanyRow?.region, resumeCompanyRow?.province].filter(Boolean).join(' / ') || '-'}</strong></div>
              <div><span>Total Certification Records</span><strong>{resumeCerts.length}</strong></div>
            </div>
            <div className="table-wrap">
              <table className="resume-table">
                <thead><tr><th>Certification</th><th>Certificate No.</th><th>Validity</th><th>Last Audit</th><th>Auditor</th><th>Companion</th><th>Audit Report</th></tr></thead>
                <tbody>
                  {resumeCerts.length ? resumeCerts.map(cert => {
                    const audit = latestAudit(cert.id);
                    const exp = expiryState(cert.valid_until, displayStatus(cert));
                    return <tr key={cert.id}>
                      <td><strong>{cert.standard}</strong><div className="muted">{cert.certification_type} · {displayStatus(cert)}</div></td>
                      <td>{cert.certificate_number || '-'}</td>
                      <td>{formatDate(cert.valid_from)} → {formatDate(cert.valid_until)}<div><span className={`expiry-chip ${exp.tone}`}>{exp.label}</span></div></td>
                      <td>{audit ? `${formatDate(audit.start_date)}${audit.end_date && audit.end_date !== audit.start_date ? ` – ${formatDate(audit.end_date)}` : ''}` : '-'}</td>
                      <td>{audit?.auditor || '-'}</td>
                      <td>{audit?.companion || '-'}</td>
                      <td>{audit?.report_storage_path ? <button className="view-btn" onClick={() => openReport(audit)}>View Report</button> : '-'}</td>
                    </tr>;
                  }) : <tr><td colSpan="7" className="empty-cell">No certification record for this company yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Certification Register</h2><p>All certification records stored in Supabase.</p></div></div>
        <div className="filters certification-filters">
          <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}><option value="All">All Companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code}</option>)}</select>
          <select value={standardFilter} onChange={e=>setStandardFilter(e.target.value)}><option value="All">All Standards</option>{standards.map(s=><option key={s}>{s}</option>)}</select>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{['All','Certified','In Progress','Expired','Suspended','Not Certified'].map(s=><option key={s}>{s}</option>)}</select>
          <div className="result-count">{filtered.length} record(s)</div>
        </div>
        <div className="table-wrap">
          <table className="cert-table">
            <thead><tr><th>Company / Site</th><th>Standard</th><th>Certificate No.</th><th>Status</th><th>Valid Until</th><th>Certification Body</th><th>Scope / Product</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="8" className="empty-cell">Loading certifications…</td></tr> : filtered.length ? filtered.map(c => {
                const exp = expiryState(c.valid_until, displayStatus(c));
                return <tr key={c.id}>
                  <td><strong>{companyMap[c.company_id]?.company_code || '-'}</strong><div className="muted">{siteMap[c.site_id]?.site_name || 'Company level'}</div></td>
                  <td><strong>{c.standard}</strong><div className="muted">{c.certification_type}</div></td>
                  <td>{c.certificate_number || '-'}</td>
                  <td><span className="status-pill">{displayStatus(c)}</span></td>
                  <td>{formatDate(c.valid_until)}<div><span className={`expiry-chip ${exp.tone}`}>{exp.label}</span></div></td>
                  <td>{c.certification_body || '-'}</td>
                  <td>{c.scope || '-'}<div className="muted">{c.product || ''}</div></td>
                  <td><button className="view-btn" onClick={() => openEdit(c)}>Edit</button></td>
                </tr>;
              }) : <tr><td colSpan="8" className="empty-cell">No certification record yet. Add a company in Master Data, then add a certification.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={()=>!saving && setShowForm(false)}>
          <div className="modal-card wide-modal" onMouseDown={e=>e.stopPropagation()}>
            <div className="modal-head"><div><h2>{editingId ? 'Edit Certification' : 'Add Certification'}</h2><p>Validity dates automatically appear in the Audit Monitoring calendar.</p></div><button className="icon-btn" onClick={()=>setShowForm(false)} disabled={saving}>×</button></div>
            <form onSubmit={saveCertification}>
              <div className="form-grid">
                <Field label="Company *"><select required value={form.companyId} onChange={e=>updateForm('companyId', e.target.value)}><option value="">Select company…</option>{companies.filter(c=>c.status==='Active').map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></Field>
                <Field label="Site / Unit"><select value={form.siteId} onChange={e=>updateForm('siteId', e.target.value)}><option value="">Company level / all sites</option>{sites.filter(s=>s.company_id===form.companyId && s.status==='Active').map(s=><option key={s.id} value={s.id}>{s.site_name} ({s.site_type})</option>)}</select></Field>
                <Field label="Certification Type"><select value={form.certificationType} onChange={e=>updateForm('certificationType', e.target.value)}>{['Mandatory','Voluntary','Buyer Requirement','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
                <Field label="Standard *"><input required value={form.standard} onChange={e=>updateForm('standard', e.target.value)} placeholder="ISPO, ISCC EU, INS, GGL…" /></Field>
                <Field label="Certificate Number"><input value={form.certificateNumber} onChange={e=>updateForm('certificateNumber', e.target.value)} /></Field>
                <Field label="Status"><select value={form.status} onChange={e=>updateForm('status', e.target.value)}>{['Certified','In Progress','Expired','Suspended','Not Certified'].map(v=><option key={v}>{v}</option>)}</select></Field>
                <Field label="Issue Date"><input type="date" value={form.issueDate} onChange={e=>updateForm('issueDate', e.target.value)} /></Field>
                <Field label="Valid From"><input type="date" value={form.validFrom} onChange={e=>updateForm('validFrom', e.target.value)} /></Field>
                <Field label="Valid Until"><input type="date" value={form.validUntil} onChange={e=>updateForm('validUntil', e.target.value)} /></Field>
                <Field label="Certification Body"><input value={form.certificationBody} onChange={e=>updateForm('certificationBody', e.target.value)} placeholder="Certification body / CB" /></Field>
                <Field label="Product"><input value={form.product} onChange={e=>updateForm('product', e.target.value)} placeholder="FFB, CPO, PK…" /></Field>
                <Field label="Scope"><input value={form.scope} onChange={e=>updateForm('scope', e.target.value)} placeholder="Estate, Mill, KCP…" /></Field>
                <Field label="Remarks" wide><textarea value={form.remarks} onChange={e=>updateForm('remarks', e.target.value)} rows="4" /></Field>
              </div>
              <div className="form-actions"><button type="button" className="secondary-btn" onClick={()=>setShowForm(false)} disabled={saving}>Cancel</button><button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save Certification'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function displayStatus(c) {
  if (c.status === 'Certified' && c.valid_until) {
    const d = daysUntil(c.valid_until);
    if (d !== null && d < 0) return 'Expired';
  }
  return c.status || 'In Progress';
}
function KPI({label,value}) { return <div className="kpi-card"><span>{label}</span><strong>{value}</strong></div>; }
function Field({label,wide,children}) { return <label className={`form-field ${wide?'wide':''}`}><span>{label}</span>{children}</label>; }
