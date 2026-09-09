'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { grievances as seedGrievances } from '../../data/grievances';

const STORAGE_KEY = 'sm_custom_grievances';

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
  const [customGrievances, setCustomGrievances] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [risk, setRisk] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) setCustomGrievances(saved);
    } catch {
      setCustomGrievances([]);
    }
  }, []);

  const grievances = useMemo(
    () => [...customGrievances, ...seedGrievances],
    [customGrievances]
  );

  const filtered = useMemo(() => grievances.filter(g => {
    const text = `${g.id} ${g.company} ${g.location} ${g.category} ${g.title}`.toLowerCase();
    return text.includes(search.toLowerCase()) &&
      (status === 'All' || g.status === status) &&
      (risk === 'All' || g.risk === risk);
  }), [grievances, search, status, risk]);

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function createCaseId() {
    const max = grievances.reduce((highest, item) => {
      const n = Number(String(item.id || '').replace(/\D/g, ''));
      return Number.isFinite(n) ? Math.max(highest, n) : highest;
    }, 0);
    return `GRV-${String(max + 1).padStart(3, '0')}`;
  }

  function handleSubmit(e) {
    e.preventDefault();

    const id = createCaseId();
    const opened = form.opened || new Date().toISOString().slice(0, 10);
    const newCase = {
      ...form,
      id,
      opened,
      progress: Number(form.progress) || 0,
      timeline: [
        [formatDisplayDate(opened), 'Complaint Received', 'Grievance registered in starter mode.'],
      ],
    };

    const updated = [newCase, ...customGrievances];
    setCustomGrievances(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setForm(emptyForm);
    setShowForm(false);
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

      <section className="kpi-grid compact">
        <KPI label="Total Cases" value={grievances.length} />
        <KPI label="Open / Active" value={grievances.filter(g=>g.status!=='Closed').length} />
        <KPI label="High Risk" value={grievances.filter(g=>g.risk==='High' && g.status!=='Closed').length} />
        <KPI label="Closed" value={grievances.filter(g=>g.status==='Closed').length} />
      </section>

      <section className="panel">
        <div className="filters">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search case, company, category..." />
          <select value={status} onChange={e=>setStatus(e.target.value)}>
            {['All','Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}
          </select>
          <select value={risk} onChange={e=>setRisk(e.target.value)}>
            {['All','High','Medium','Low'].map(v=><option key={v}>{v}</option>)}
          </select>
          <div className="result-count">{filtered.length} case(s)</div>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Case ID</th><th>Company / Site</th><th>Issue</th><th>Risk</th><th>Status</th><th>Progress</th><th>Due Date</th><th></th></tr></thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id}>
                  <td><strong>{g.id}</strong><div className="muted">{g.opened}</div></td>
                  <td>{g.company}<div className="muted">{g.location}</div></td>
                  <td>{g.title}<div className="muted">{g.category}</div></td>
                  <td><span className={`badge ${g.risk.toLowerCase()}`}>{g.risk}</span></td>
                  <td><span className="status-pill">{g.status}</span></td>
                  <td><div className="progress"><div style={{width:`${g.progress}%`}}></div></div><div className="muted">{g.progress}%</div></td>
                  <td>{g.dueDate || '-'}</td>
                  <td><Link href={`/grievances/${g.id}`} className="view-btn">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}>
          <div className="modal-card" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Add Grievance</h2>
                <p>Starter mode — data is saved only in this browser.</p>
              </div>
              <button className="icon-btn" onClick={() => setShowForm(false)} aria-label="Close">×</button>
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
                    {['High','Medium','Low'].map(v=><option key={v}>{v}</option>)}
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
                <button type="button" className="secondary-btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Save Grievance</button>
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

function formatDisplayDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
