'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';

const emptyForm = {
  company: '',
  location: '',
  category: 'Land Conflict',
  title: '',
  source: '',
  opened: '',
  risk: 'Medium',
  status: 'Open',
  progress: 0,
  pic: '',
  nextAction: '',
  dueDate: '',
  summary: '',
};

export default function GrievanceTracker() {
  const [grievances, setGrievances] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [risk, setRisk] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGrievances();
  }, []);

  async function loadGrievances() {
    const configError = getSupabaseConfigError();
    if (configError || !supabase) {
      setError(configError || 'Supabase is not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('grievances')
      .select('*')
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setGrievances((data || []).map(mapDbCase));
    setLoading(false);
  }

  const filtered = useMemo(() => grievances.filter(g => {
    const text = `${g.id} ${g.company} ${g.location} ${g.category} ${g.title}`.toLowerCase();
    return text.includes(search.toLowerCase()) &&
      (status === 'All' || g.status === status) &&
      (risk === 'All' || g.risk === risk);
  }), [grievances, search, status, risk]);

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;

    setSaving(true);
    setError('');
    const opened = form.opened || todayISO();

    const payload = {
      company: form.company.trim(),
      site: form.location.trim(),
      category: form.category,
      issue_title: form.title.trim(),
      complaint_source: form.source.trim() || null,
      opened_date: opened,
      risk_level: form.risk,
      status: form.status,
      progress: clampProgress(form.progress),
      pic: form.pic.trim() || null,
      next_action: form.nextAction.trim() || null,
      due_date: form.dueDate || null,
      case_summary: form.summary.trim() || null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('grievances')
      .insert(payload)
      .select('*')
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    // Create the first timeline record. If it fails, the grievance itself remains saved.
    await supabase.from('grievance_updates').insert({
      grievance_id: inserted.id,
      update_date: opened,
      update_title: 'Complaint Received',
      notes: 'Grievance registered in System Monitoring.',
      case_status: form.status,
      progress: clampProgress(form.progress),
      next_action: form.nextAction.trim() || null,
      due_date: form.dueDate || null,
    });

    setForm(emptyForm);
    setShowForm(false);
    setSaving(false);
    await loadGrievances();
  }

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <h1>Grievance Tracker</h1>
          <p>Register, monitor, verify and close stakeholder grievance cases.</p>
        </div>
        <button className="primary-btn" onClick={() => setShowForm(true)}>+ Add Grievance</button>
      </div>

      {error ? <div className="sync-error"><strong>Supabase error</strong><span>{error}</span></div> : <div className="sync-success">● Supabase mode — data is shared across devices</div>}

      <section className="kpi-grid compact">
        <KPI label="Total Cases" value={loading ? '…' : grievances.length} />
        <KPI label="Open / Active" value={loading ? '…' : grievances.filter(g=>g.status!=='Closed').length} />
        <KPI label="High / Critical Risk" value={loading ? '…' : grievances.filter(g=>['High','Critical'].includes(g.risk) && g.status!=='Closed').length} />
        <KPI label="Closed" value={loading ? '…' : grievances.filter(g=>g.status==='Closed').length} />
      </section>

      <section className="panel">
        <div className="filters">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search case, company, category..." />
          <select value={status} onChange={e=>setStatus(e.target.value)}>
            {['All','Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}
          </select>
          <select value={risk} onChange={e=>setRisk(e.target.value)}>
            {['All','Critical','High','Medium','Low'].map(v=><option key={v}>{v}</option>)}
          </select>
          <div className="result-count">{loading ? 'Loading…' : `${filtered.length} case(s)`}</div>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Case ID</th><th>Company / Site</th><th>Issue</th><th>Risk</th><th>Status</th><th>Progress</th><th>Due Date</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="empty-cell">Loading grievance data from Supabase…</td></tr>
              ) : filtered.length ? filtered.map(g => (
                <tr key={g.id}>
                  <td><strong>{g.id}</strong><div className="muted">{g.opened}</div></td>
                  <td>{g.company}<div className="muted">{g.location}</div></td>
                  <td>{g.title}<div className="muted">{g.category}</div></td>
                  <td><span className={`badge ${String(g.risk).toLowerCase()}`}>{g.risk}</span></td>
                  <td><span className="status-pill">{g.status}</span></td>
                  <td><div className="progress"><div style={{width:`${g.progress}%`}}></div></div><div className="muted">{g.progress}%</div></td>
                  <td>{g.dueDate || '-'}</td>
                  <td><Link href={`/grievances/${g.id}`} className="view-btn">View</Link></td>
                </tr>
              )) : (
                <tr><td colSpan="8" className="empty-cell">No grievance found. Use + Add Grievance to create a dummy Supabase case.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={() => !saving && setShowForm(false)}>
          <div className="modal-card" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Add Grievance</h2>
                <p>Supabase mode — this record will be shared across devices.</p>
              </div>
              <button className="icon-btn" onClick={() => setShowForm(false)} aria-label="Close" disabled={saving}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <Field label="Company *"><input required value={form.company} onChange={e=>updateForm('company', e.target.value)} placeholder="e.g. Company A" /></Field>
                <Field label="Site / Location *"><input required value={form.location} onChange={e=>updateForm('location', e.target.value)} placeholder="e.g. Site Alpha" /></Field>
                <Field label="Category *">
                  <select value={form.category} onChange={e=>updateForm('category', e.target.value)}>
                    {['Land Conflict','Environmental','Social','Labor','HCV / HCS','Legal / Permit','Other'].map(v=><option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Issue / Title *"><input required value={form.title} onChange={e=>updateForm('title', e.target.value)} placeholder="Short grievance title" /></Field>
                <Field label="Complaint Source"><input value={form.source} onChange={e=>updateForm('source', e.target.value)} placeholder="Community, worker, buyer..." /></Field>
                <Field label="Opened Date"><input type="date" value={form.opened} onChange={e=>updateForm('opened', e.target.value)} /></Field>
                <Field label="Risk Level">
                  <select value={form.risk} onChange={e=>updateForm('risk', e.target.value)}>
                    {['Critical','High','Medium','Low'].map(v=><option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={e=>updateForm('status', e.target.value)}>
                    {['Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Progress %"><input type="number" min="0" max="100" value={form.progress} onChange={e=>updateForm('progress', e.target.value)} /></Field>
                <Field label="PIC"><input value={form.pic} onChange={e=>updateForm('pic', e.target.value)} placeholder="Responsible person/team" /></Field>
                <Field label="Next Action"><input value={form.nextAction} onChange={e=>updateForm('nextAction', e.target.value)} placeholder="Next follow-up action" /></Field>
                <Field label="Due Date"><input type="date" value={form.dueDate} onChange={e=>updateForm('dueDate', e.target.value)} /></Field>
                <Field label="Case Summary" wide><textarea rows="4" value={form.summary} onChange={e=>updateForm('summary', e.target.value)} placeholder="Brief description of the grievance and current situation" /></Field>
              </div>

              <div className="form-actions">
                <button type="button" className="secondary-btn" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save to Supabase'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({label, value}) {
  return <div className="kpi-card"><span>{label}</span><strong>{value}</strong></div>;
}

function Field({ label, children, wide = false }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>;
}

function mapDbCase(row) {
  return {
    rowId: row.id,
    id: row.case_id,
    company: row.company || '',
    location: row.site || '',
    category: row.category || '',
    title: row.issue_title || '',
    source: row.complaint_source || '',
    opened: row.opened_date || '',
    risk: row.risk_level || 'Medium',
    status: row.status || 'Open',
    progress: Number(row.progress || 0),
    pic: row.pic || '',
    nextAction: row.next_action || '',
    dueDate: row.due_date || '',
    summary: row.case_summary || '',
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function clampProgress(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}
