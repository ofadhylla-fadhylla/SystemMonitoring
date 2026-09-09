'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { grievances as seedGrievances } from '../../../data/grievances';

const CUSTOM_KEY = 'sm_custom_grievances';
const OVERRIDES_KEY = 'sm_grievance_overrides';
const UPDATES_KEY = 'sm_grievance_updates';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const emptyUpdate = {
  date: '',
  title: 'Follow-up Update',
  description: '',
  updatedBy: '',
  status: 'In Progress',
  progress: 0,
  nextAction: '',
  dueDate: '',
};

export default function GrievanceDetail() {
  const params = useParams();
  const id = params?.id;

  const [baseCase, setBaseCase] = useState(() => seedGrievances.find(x => x.id === id) || null);
  const [override, setOverride] = useState({});
  const [caseUpdates, setCaseUpdates] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [form, setForm] = useState({ ...emptyUpdate, date: todayISO() });

  useEffect(() => {
    try {
      const savedCustom = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
      const custom = Array.isArray(savedCustom) ? savedCustom : [];
      const found = [...custom, ...seedGrievances].find(x => x.id === id) || null;
      setBaseCase(found);

      const savedOverrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}');
      const allOverrides = savedOverrides && typeof savedOverrides === 'object' ? savedOverrides : {};
      const thisOverride = allOverrides[id] || {};
      setOverride(thisOverride);

      const savedUpdates = JSON.parse(localStorage.getItem(UPDATES_KEY) || '{}');
      const allUpdates = savedUpdates && typeof savedUpdates === 'object' ? savedUpdates : {};
      const thisUpdates = Array.isArray(allUpdates[id]) ? allUpdates[id] : [];
      setCaseUpdates(thisUpdates);

      const merged = { ...(found || {}), ...thisOverride };
      setForm(prev => ({
        ...prev,
        date: todayISO(),
        status: merged.status || 'In Progress',
        progress: Number(merged.progress || 0),
        nextAction: merged.nextAction || '',
        dueDate: merged.dueDate || '',
      }));
    } catch {
      setBaseCase(seedGrievances.find(x => x.id === id) || null);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  const g = useMemo(() => baseCase ? { ...baseCase, ...override } : null, [baseCase, override]);

  const timeline = useMemo(() => {
    if (!g) return [];
    const original = Array.isArray(baseCase?.timeline)
      ? baseCase.timeline.map((item, index) => ({
          key: `seed-${index}`,
          date: item[0],
          title: item[1],
          description: item[2],
          updatedBy: '',
        }))
      : [];

    const added = caseUpdates.map((item, index) => ({
      key: item.id || `update-${index}`,
      date: formatDisplayDate(item.date),
      title: item.title,
      description: item.description,
      updatedBy: item.updatedBy || '',
    }));

    return [...original, ...added];
  }, [g, baseCase, caseUpdates]);

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function openUpdateForm() {
    setForm({
      ...emptyUpdate,
      date: todayISO(),
      status: g?.status || 'In Progress',
      progress: Number(g?.progress || 0),
      nextAction: g?.nextAction || '',
      dueDate: g?.dueDate || '',
    });
    setShowUpdateForm(true);
  }

  function saveUpdate(e) {
    e.preventDefault();
    if (!g) return;

    const cleanProgress = Math.min(100, Math.max(0, Number(form.progress) || 0));
    const newUpdate = {
      id: `UPD-${Date.now()}`,
      date: form.date || todayISO(),
      title: form.title.trim() || 'Follow-up Update',
      description: form.description.trim(),
      updatedBy: form.updatedBy.trim(),
      createdAt: new Date().toISOString(),
    };

    const updatedCaseUpdates = [...caseUpdates, newUpdate];
    setCaseUpdates(updatedCaseUpdates);

    const allUpdates = safeParse(localStorage.getItem(UPDATES_KEY), {});
    localStorage.setItem(UPDATES_KEY, JSON.stringify({
      ...allUpdates,
      [g.id]: updatedCaseUpdates,
    }));

    const nextOverride = {
      ...override,
      status: form.status,
      progress: cleanProgress,
      nextAction: form.nextAction.trim(),
      dueDate: form.dueDate,
      lastUpdated: newUpdate.date,
    };
    setOverride(nextOverride);

    const allOverrides = safeParse(localStorage.getItem(OVERRIDES_KEY), {});
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({
      ...allOverrides,
      [g.id]: nextOverride,
    }));

    setShowUpdateForm(false);
  }

  if (!loaded && !g) return <div className="page-wrap"><p>Loading case...</p></div>;

  if (!g) {
    return (
      <div className="page-wrap">
        <h1>Case not found</h1>
        <Link className="text-link" href="/grievances">← Back to tracker</Link>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="breadcrumb"><Link href="/grievances">Grievance Tracker</Link> / {g.id}</div>
      <div className="page-heading">
        <div><h1>{g.id} — {g.title}</h1><p>{g.company} · {g.location}</p></div>
        <div className="detail-actions">
          <span className={`badge ${String(g.risk).toLowerCase()}`}>{g.risk} Risk</span>
          <span className="status-pill">{g.status}</span>
        </div>
      </div>

      <section className="detail-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>Case Overview</h2><p>Core grievance information</p></div></div>
          <div className="info-grid">
            <Info label="Category" value={g.category} />
            <Info label="Source" value={g.source || '-'} />
            <Info label="Opened" value={g.opened || '-'} />
            <Info label="PIC" value={g.pic || '-'} />
            <Info label="Next Action" value={g.nextAction || '-'} />
            <Info label="Due Date" value={g.dueDate || '-'} />
          </div>
          <div className="summary-box"><span>Case Summary</span><p>{g.summary || 'No summary entered yet.'}</p></div>
        </div>

        <div className="panel progress-panel">
          <div className="panel-head"><div><h2>Resolution Progress</h2><p>Current completion</p></div></div>
          <div className="big-progress">{g.progress || 0}%</div>
          <div className="progress large"><div style={{width:`${g.progress || 0}%`}}></div></div>
          <div className="stage-list">
            {['Complaint Received','Assessment / Investigation','Stakeholder Engagement','Corrective Action','Verification','Closed'].map((s,i)=><div key={s}><span>{i+1}</span>{s}</div>)}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Case Timeline</h2><p>Chronological activity log</p></div>
          <button className="secondary-btn" onClick={openUpdateForm}>+ Add Update</button>
        </div>
        <div className="timeline">
          {timeline.length ? timeline.map(item => (
            <div className="timeline-item" key={item.key}>
              <div className="timeline-dot"></div>
              <div className="timeline-date">{item.date}</div>
              <div className="timeline-card">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                {item.updatedBy ? <div className="timeline-meta">Updated by {item.updatedBy}</div> : null}
              </div>
            </div>
          )) : <div className="empty-state">No timeline update yet.</div>}
        </div>
      </section>

      <section className="two-col">
        <div className="panel"><div className="panel-head"><div><h2>Action Plan</h2><p>Placeholder for follow-up actions</p></div></div><div className="empty-state">Action records will be activated in the next stage.</div></div>
        <div className="panel"><div className="panel-head"><div><h2>Evidence & Documents</h2><p>Photos, letters, maps, minutes</p></div></div><div className="empty-state">Evidence upload will be connected to Supabase Storage.</div></div>
      </section>

      {showUpdateForm && (
        <div className="modal-backdrop" onMouseDown={() => setShowUpdateForm(false)}>
          <div className="modal-card update-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Add Case Update</h2>
                <p>{g.id} — save follow-up activity and update case progress.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowUpdateForm(false)} aria-label="Close">×</button>
            </div>

            <form onSubmit={saveUpdate}>
              <div className="form-grid">
                <Field label="Update Date *"><input required type="date" value={form.date} onChange={e=>updateForm('date', e.target.value)} /></Field>
                <Field label="Updated By"><input value={form.updatedBy} onChange={e=>updateForm('updatedBy', e.target.value)} placeholder="Person / team" /></Field>
                <Field label="Update Title *" wide><input required value={form.title} onChange={e=>updateForm('title', e.target.value)} placeholder="e.g. Stakeholder meeting completed" /></Field>
                <Field label="Update / Notes *" wide><textarea required rows="4" value={form.description} onChange={e=>updateForm('description', e.target.value)} placeholder="What happened, result, decision, or follow-up..." /></Field>
                <Field label="Case Status">
                  <select value={form.status} onChange={e=>updateForm('status', e.target.value)}>
                    {['Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Progress %"><input type="number" min="0" max="100" value={form.progress} onChange={e=>updateForm('progress', e.target.value)} /></Field>
                <Field label="Next Action"><input value={form.nextAction} onChange={e=>updateForm('nextAction', e.target.value)} placeholder="Next follow-up action" /></Field>
                <Field label="Due Date"><input type="date" value={form.dueDate} onChange={e=>updateForm('dueDate', e.target.value)} /></Field>
              </div>

              <div className="starter-warning">
                Starter mode: this update is saved in this browser only. Supabase will make it shared later.
              </div>

              <div className="form-actions">
                <button type="button" className="secondary-btn" onClick={() => setShowUpdateForm(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Save Update</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({label,value}) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

function Field({ label, children, wide = false }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>;
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
