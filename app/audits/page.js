'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';
import { daysUntil, formatDate, sanitizeFileName, todayISO } from '../../lib/monitoring';

const MAX_REPORT_BYTES = 20 * 1024 * 1024;
const emptyForm = {
  companyId: '', siteId: '', certificationId: '', auditType: 'External Audit', title: '',
  startDate: '', endDate: '', status: 'Planned', auditor: '', companion: '', certificationBody: '', notes: '', reportTitle: '', file: null,
};

export default function AuditMonitoring() {
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, startDate: todayISO() });
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [companyFilter, setCompanyFilter] = useState('All');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const configError = getSupabaseConfigError();
    if (configError || !supabase) { setError(configError || 'Supabase is not configured.'); setLoading(false); return; }
    setLoading(true); setError('');
    const [companyRes, siteRes, certRes, auditRes] = await Promise.all([
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('sites').select('*').order('site_name'),
      supabase.from('certifications').select('*').order('standard'),
      supabase.from('audit_events').select('*').order('start_date'),
    ]);
    const anyError = companyRes.error || siteRes.error || certRes.error || auditRes.error;
    if (anyError) setError(anyError.message);
    setCompanies(companyRes.data || []); setSites(siteRes.data || []); setCertifications(certRes.data || []); setAudits(auditRes.data || []);
    setLoading(false);
  }

  const companyMap = useMemo(() => Object.fromEntries(companies.map(c=>[c.id,c])), [companies]);
  const siteMap = useMemo(() => Object.fromEntries(sites.map(s=>[s.id,s])), [sites]);
  const certMap = useMemo(() => Object.fromEntries(certifications.map(c=>[c.id,c])), [certifications]);

  const calendarEvents = useMemo(() => {
    // Multi-day audits are expanded so the event appears on every day
    // from start_date through end_date (inclusive).
    const auditEvents = audits.flatMap(a => {
      const dates = expandDateRange(a.start_date, a.end_date || a.start_date);
      return dates.map((date, index) => ({
        key: `audit-${a.id}-${date}`,
        kind: 'audit',
        date,
        endDate: a.end_date,
        title: a.title,
        companyId: a.company_id,
        subtitle: `${a.audit_type} · ${a.status}`,
        row: a,
        rangePosition: dates.length === 1 ? 'single' : index === 0 ? 'start' : index === dates.length - 1 ? 'end' : 'middle',
      }));
    });
    const expiryEvents = certifications.filter(c=>c.valid_until).map(c => ({
      key: `expiry-${c.id}`, kind: 'expiry', date: c.valid_until, title: `${c.standard} expires`, companyId: c.company_id,
      subtitle: c.certificate_number || 'Certificate expiry', row: c
    }));
    return [...auditEvents, ...expiryEvents].filter(e => companyFilter === 'All' || e.companyId === companyFilter);
  }, [audits, certifications, companyFilter]);

  const upcomingAudits = useMemo(() => {
    const today = todayISO();
    return audits
      .filter(a => (companyFilter === 'All' || a.company_id === companyFilter) && a.start_date >= today && !['Done','Cancelled'].includes(a.status))
      .sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date)))
      .slice(0, 12);
  }, [audits, companyFilter]);

  const upcomingExpiry = useMemo(() => certifications
    .filter(c => (companyFilter === 'All' || c.company_id === companyFilter) && c.valid_until && daysUntil(c.valid_until) !== null && daysUntil(c.valid_until) >= 0)
    .sort((a,b)=>String(a.valid_until).localeCompare(String(b.valid_until))).slice(0,8), [certifications, companyFilter]);

  function updateForm(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'companyId') { next.siteId = ''; next.certificationId = ''; }
      if (field === 'certificationId') {
        const cert = certMap[value];
        if (cert) next.certificationBody = cert.certification_body || next.certificationBody;
      }
      return next;
    });
  }

  function openNew() {
    setForm({ ...emptyForm, startDate: todayISO() });
    setShowForm(true);
  }

  async function saveAudit(e) {
    e.preventDefault(); if (!supabase) return;
    setSaving(true); setError('');
    let reportPath = null, reportName = null, reportSize = null, reportMime = null;
    const file = form.file;
    if (file) {
      if (file.size > MAX_REPORT_BYTES) { setError('Audit report maximum file size is 20 MB.'); setSaving(false); return; }
      reportName = file.name; reportSize = file.size; reportMime = file.type || null;
      const code = companyMap[form.companyId]?.company_code || 'COMPANY';
      reportPath = `${code}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from('audit-reports').upload(reportPath, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) { setError(`${uploadError.message}. Check the private audit-reports bucket and Storage policies.`); setSaving(false); return; }
    }

    const { error: insertError } = await supabase.from('audit_events').insert({
      company_id: form.companyId,
      site_id: form.siteId || null,
      certification_id: form.certificationId || null,
      audit_type: form.auditType,
      title: form.title.trim(),
      start_date: form.startDate,
      end_date: form.endDate || form.startDate,
      status: form.status,
      auditor: form.auditor.trim() || null,
      companion: form.companion.trim() || null,
      certification_body: form.certificationBody.trim() || null,
      notes: form.notes.trim() || null,
      report_title: form.reportTitle.trim() || (file ? file.name : null),
      report_file_name: reportName,
      report_storage_path: reportPath,
      report_file_size: reportSize,
      report_mime_type: reportMime,
    });
    if (insertError) {
      if (reportPath) await supabase.storage.from('audit-reports').remove([reportPath]);
      setError(insertError.message); setSaving(false); return;
    }
    setShowForm(false); setSaving(false); await loadAll();
  }

  async function openReport(audit) {
    if (!audit.report_storage_path || !supabase) return;
    const { data, error: signError } = await supabase.storage.from('audit-reports').createSignedUrl(audit.report_storage_path, 60);
    if (signError) { setError(signError.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const selectedCert = certMap[form.certificationId];
  const calendar = buildCalendar(month);

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div><h1>Audit Monitoring</h1><p>Calendar for upcoming audits, audit reports and certificate expiry synchronization.</p></div>
        <button className="primary-btn" onClick={openNew}>+ Add Audit</button>
      </div>
      {error ? <div className="sync-error"><strong>Supabase error</strong><span>{error}</span></div> : null}

      <section className="audit-toolbar panel">
        <div className="calendar-nav">
          <button className="secondary-btn" onClick={()=>setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))}>←</button>
          <button className="secondary-btn" onClick={()=>{ const d=new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(),1)); }}>Today</button>
          <button className="secondary-btn" onClick={()=>setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))}>→</button>
          <strong>{month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</strong>
        </div>
        <select className="inline-select" value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}><option value="All">All Companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select>
        <div className="calendar-legend"><span><i className="legend-dot audit"></i> Audit</span><span><i className="legend-dot expiry"></i> Certificate Expiry</span></div>
      </section>

      <section className="panel calendar-panel">
        <div className="calendar-grid audit-calendar-grid calendar-header audit-calendar-header" style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',width:'100%'}}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div key={d}>{d}</div>)}</div>
        <div className="calendar-grid audit-calendar-grid" style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',width:'100%'}}>
          {calendar.map((cell, idx) => {
            if (!cell.date) return <div className="calendar-cell blank" key={`blank-${idx}`}></div>;
            const iso = isoLocal(cell.date);
            const events = calendarEvents.filter(e=>e.date===iso);
            return <div className={`calendar-cell audit-calendar-cell ${iso===todayISO()?'today':''}`} key={iso}>
              <div className="calendar-day audit-calendar-day">{cell.date.getDate()}</div>
              <div className="calendar-events audit-calendar-events">
                {events.slice(0,3).map(ev=><div key={ev.key} className={`calendar-event audit-calendar-event ${ev.kind} ${ev.rangePosition ? `range-${ev.rangePosition}` : ''}`} title={`${ev.title} — ${ev.subtitle}`}>
                  <strong>{ev.title}</strong>
                  <span>{companyMap[ev.companyId]?.company_code || ''}</span>
                  {ev.kind==='audit' && ev.rangePosition && ev.rangePosition!=='single' ? <span className="audit-calendar-range-label">{ev.rangePosition==='start'?'Start':ev.rangePosition==='end'?'End':'Continues'}</span> : null}
                </div>)}
                {events.length>3 ? <div className="calendar-more">+{events.length-3} more</div> : null}
              </div>
            </div>;
          })}
        </div>
      </section>

      <section className="two-col audit-lists">
        <div className="panel">
          <div className="panel-head"><div><h2>Upcoming Audits</h2><p>Planned and confirmed audit schedule.</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Company</th><th>Audit</th><th>Auditor</th><th>Status</th><th>Report</th></tr></thead><tbody>
            {loading ? <tr><td colSpan="6" className="empty-cell">Loading audits…</td></tr> : upcomingAudits.length ? upcomingAudits.map(a=><tr key={a.id}>
              <td><strong>{formatDate(a.start_date)}</strong><div className="muted">{a.end_date && a.end_date!==a.start_date ? `to ${formatDate(a.end_date)}` : ''}</div></td>
              <td>{companyMap[a.company_id]?.company_code || '-'}<div className="muted">{siteMap[a.site_id]?.site_name || 'Company level'}</div></td>
              <td>{a.title}<div className="muted">{a.audit_type}{a.certification_id ? ` · ${certMap[a.certification_id]?.standard || ''}` : ''}</div></td>
              <td>{a.auditor || '-'}</td><td><span className="status-pill">{a.status}</span></td>
              <td>{a.report_storage_path ? <button className="view-btn" onClick={()=>openReport(a)}>View</button> : '-'}</td>
            </tr>) : <tr><td colSpan="6" className="empty-cell">No upcoming audit yet. Use + Add Audit.</td></tr>}
          </tbody></table></div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Upcoming Certificate Expiry</h2><p>Automatically synchronized from Certification Monitoring.</p></div></div>
          <div className="expiry-list">{upcomingExpiry.length ? upcomingExpiry.map(c=>{
            const d=daysUntil(c.valid_until); return <div className="expiry-row" key={c.id}><div><strong>{c.standard}</strong><span>{companyMap[c.company_id]?.company_code || '-'}</span></div><div><strong>{formatDate(c.valid_until)}</strong><span className={d<=30?'danger-text':d<=90?'warning-text':''}>{d} days left</span></div></div>;
          }) : <div className="empty-state">No upcoming certificate expiry.</div>}</div>
        </div>
      </section>

      {showForm && <div className="modal-backdrop" onMouseDown={()=>!saving&&setShowForm(false)}><div className="modal-card wide-modal" onMouseDown={e=>e.stopPropagation()}>
        <div className="modal-head"><div><h2>Add Audit Schedule</h2><p>Link an audit to a certification so its validity and audit history stay synchronized.</p></div><button className="icon-btn" onClick={()=>setShowForm(false)} disabled={saving}>×</button></div>
        <form onSubmit={saveAudit}><div className="form-grid">
          <Field label="Company *"><select required value={form.companyId} onChange={e=>updateForm('companyId',e.target.value)}><option value="">Select company…</option>{companies.filter(c=>c.status==='Active').map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></Field>
          <Field label="Site / Unit"><select value={form.siteId} onChange={e=>updateForm('siteId',e.target.value)}><option value="">Company level</option>{sites.filter(s=>s.company_id===form.companyId&&s.status==='Active').map(s=><option key={s.id} value={s.id}>{s.site_name} ({s.site_type})</option>)}</select></Field>
          <Field label="Linked Certification"><select value={form.certificationId} onChange={e=>updateForm('certificationId',e.target.value)}><option value="">Not linked</option>{certifications.filter(c=>c.company_id===form.companyId).map(c=><option key={c.id} value={c.id}>{c.standard} — {c.certificate_number || c.status}</option>)}</select></Field>
          <Field label="Audit Type"><select value={form.auditType} onChange={e=>updateForm('auditType',e.target.value)}>{['Internal Audit','Stage I','Stage II','Surveillance','Recertification','External Audit','Follow-up','Buyer Audit','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
          <Field label="Audit Title *"><input required value={form.title} onChange={e=>updateForm('title',e.target.value)} placeholder="e.g. ISPO Surveillance Audit" /></Field>
          <Field label="Status"><select value={form.status} onChange={e=>updateForm('status',e.target.value)}>{['Planned','Confirmed','Done','Postponed','Cancelled'].map(v=><option key={v}>{v}</option>)}</select></Field>
          <Field label="Start Date *"><input required type="date" value={form.startDate} onChange={e=>updateForm('startDate',e.target.value)} /></Field>
          <Field label="End Date"><input type="date" value={form.endDate} onChange={e=>updateForm('endDate',e.target.value)} /></Field>
          <Field label="Auditor"><input value={form.auditor} onChange={e=>updateForm('auditor',e.target.value)} placeholder="Lead auditor / audit team" /></Field>
          <Field label="Company Companion"><input value={form.companion} onChange={e=>updateForm('companion',e.target.value)} placeholder="Pendamping perusahaan" /></Field>
          <Field label="Certification Body"><input value={form.certificationBody} onChange={e=>updateForm('certificationBody',e.target.value)} /></Field>
          <Field label="Report Title"><input value={form.reportTitle} onChange={e=>updateForm('reportTitle',e.target.value)} placeholder="Audit report / closing report" /></Field>
          {selectedCert ? <div className="cert-sync-box form-field wide"><span>Certification Sync</span><strong>{selectedCert.standard} · expires {formatDate(selectedCert.valid_until)}</strong><small>{selectedCert.valid_until ? `${daysUntil(selectedCert.valid_until)} days from today` : 'No expiry date recorded'}</small></div> : null}
          <Field label="Audit Notes" wide><textarea rows="4" value={form.notes} onChange={e=>updateForm('notes',e.target.value)} /></Field>
          <Field label="Audit Report" wide><input type="file" accept=".pdf,.docx,.xlsx,image/jpeg,image/png,image/webp" onChange={e=>updateForm('file',e.target.files?.[0]||null)} /><small className="field-help">Optional. Private Supabase Storage, maximum 20 MB.</small></Field>
        </div><div className="form-actions"><button type="button" className="secondary-btn" onClick={()=>setShowForm(false)} disabled={saving}>Cancel</button><button className="primary-btn" disabled={saving}>{saving?'Saving…':'Save Audit to Calendar'}</button></div></form>
      </div></div>}
    </div>
  );
}


function expandDateRange(startISO, endISO) {
  if (!startISO) return [];
  const start = parseISODate(startISO);
  const end = parseISODate(endISO || startISO);
  if (!start || !end) return [startISO];

  // If an invalid end date is earlier than the start, show the start date only.
  if (end < start) return [startISO];

  const result = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor <= end) {
    result.push(isoLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function parseISODate(value) {
  if (!value) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function buildCalendar(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  const mondayIndex = (first.getDay()+6)%7;
  const cells = Array.from({length:mondayIndex},()=>({date:null}));
  for(let i=1;i<=days;i++) cells.push({date:new Date(month.getFullYear(),month.getMonth(),i)});
  while(cells.length%7) cells.push({date:null});
  return cells;
}
function isoLocal(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function Field({label,wide,children}){ return <label className={`form-field ${wide?'wide':''}`}><span>{label}</span>{children}</label>; }
