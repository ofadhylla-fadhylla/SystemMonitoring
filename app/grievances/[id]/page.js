'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { grievances as seedGrievances } from '../../../data/grievances';

const CUSTOM_KEY = 'sm_custom_grievances';
const OVERRIDES_KEY = 'sm_grievance_overrides';
const UPDATES_KEY = 'sm_grievance_updates';
const ACTIONS_KEY = 'sm_grievance_actions';

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

const emptyEdit = {
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

const emptyAction = {
  id: '',
  description: '',
  pic: '',
  targetDate: '',
  priority: 'Medium',
  status: 'Open',
  progress: 0,
  completionDate: '',
  remarks: '',
};

export default function GrievanceDetail() {
  const params = useParams();
  const id = params?.id;

  const [baseCase, setBaseCase] = useState(() => seedGrievances.find(x => x.id === id) || null);
  const [override, setOverride] = useState({});
  const [caseUpdates, setCaseUpdates] = useState([]);
  const [actions, setActions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [editingActionId, setEditingActionId] = useState(null);

  const [form, setForm] = useState({ ...emptyUpdate, date: todayISO() });
  const [editForm, setEditForm] = useState(emptyEdit);
  const [actionForm, setActionForm] = useState(emptyAction);

  useEffect(() => {
    try {
      const savedCustom = safeParse(localStorage.getItem(CUSTOM_KEY), []);
      const custom = Array.isArray(savedCustom) ? savedCustom : [];
      const found = [...custom, ...seedGrievances].find(x => x.id === id) || null;
      setBaseCase(found);

      const savedOverrides = safeParse(localStorage.getItem(OVERRIDES_KEY), {});
      const allOverrides = savedOverrides && typeof savedOverrides === 'object' ? savedOverrides : {};
      const thisOverride = allOverrides[id] || {};
      setOverride(thisOverride);

      const savedUpdates = safeParse(localStorage.getItem(UPDATES_KEY), {});
      const allUpdates = savedUpdates && typeof savedUpdates === 'object' ? savedUpdates : {};
      setCaseUpdates(Array.isArray(allUpdates[id]) ? allUpdates[id] : []);

      const savedActions = safeParse(localStorage.getItem(ACTIONS_KEY), {});
      const allActions = savedActions && typeof savedActions === 'object' ? savedActions : {};
      setActions(Array.isArray(allActions[id]) ? allActions[id] : []);

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

  const actionStats = useMemo(() => {
    const completed = actions.filter(a => a.status === 'Completed').length;
    const overdue = actions.filter(a => getDueState(a) === 'Overdue').length;
    const open = actions.length - completed;
    return { completed, overdue, open };
  }, [actions]);

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateEditForm(field, value) {
    setEditForm(prev => ({ ...prev, [field]: value }));
  }

  function updateActionForm(field, value) {
    setActionForm(prev => ({ ...prev, [field]: value }));
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

  function openEditForm() {
    if (!g) return;
    setEditForm({
      company: g.company || '',
      location: g.location || '',
      category: g.category || 'Other',
      title: g.title || '',
      source: g.source || '',
      opened: normalizeInputDate(g.opened),
      risk: g.risk || 'Medium',
      status: g.status || 'Open',
      progress: Number(g.progress || 0),
      pic: g.pic || '',
      nextAction: g.nextAction || '',
      dueDate: normalizeInputDate(g.dueDate),
      summary: g.summary || '',
    });
    setShowEditForm(true);
  }

  function openNewActionForm() {
    setEditingActionId(null);
    setActionForm({ ...emptyAction, id: createActionId(actions), targetDate: g?.dueDate || '' });
    setShowActionForm(true);
  }

  function openEditActionForm(action) {
    setEditingActionId(action.id);
    setActionForm({
      ...emptyAction,
      ...action,
      targetDate: normalizeInputDate(action.targetDate),
      completionDate: normalizeInputDate(action.completionDate),
      progress: Number(action.progress || 0),
    });
    setShowActionForm(true);
  }

  function saveUpdate(e) {
    e.preventDefault();
    if (!g) return;

    const cleanProgress = clampProgress(form.progress);
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
    persistMapItem(UPDATES_KEY, g.id, updatedCaseUpdates);

    const nextOverride = {
      ...override,
      status: form.status,
      progress: cleanProgress,
      nextAction: form.nextAction.trim(),
      dueDate: form.dueDate,
      lastUpdated: newUpdate.date,
    };
    setOverride(nextOverride);
    persistMapItem(OVERRIDES_KEY, g.id, nextOverride);
    setShowUpdateForm(false);
  }

  function saveEdit(e) {
    e.preventDefault();
    if (!g) return;

    const nextOverride = {
      ...override,
      company: editForm.company.trim(),
      location: editForm.location.trim(),
      category: editForm.category,
      title: editForm.title.trim(),
      source: editForm.source.trim(),
      opened: editForm.opened,
      risk: editForm.risk,
      status: editForm.status,
      progress: clampProgress(editForm.progress),
      pic: editForm.pic.trim(),
      nextAction: editForm.nextAction.trim(),
      dueDate: editForm.dueDate,
      summary: editForm.summary.trim(),
      lastUpdated: todayISO(),
    };

    setOverride(nextOverride);
    persistMapItem(OVERRIDES_KEY, g.id, nextOverride);
    setShowEditForm(false);
  }

  function saveAction(e) {
    e.preventDefault();
    if (!g) return;

    const status = actionForm.status;
    const cleanProgress = status === 'Completed' ? 100 : clampProgress(actionForm.progress);
    const completionDate = status === 'Completed'
      ? (actionForm.completionDate || todayISO())
      : actionForm.completionDate;

    const clean = {
      id: actionForm.id || createActionId(actions),
      description: actionForm.description.trim(),
      pic: actionForm.pic.trim(),
      targetDate: actionForm.targetDate,
      priority: actionForm.priority,
      status,
      progress: cleanProgress,
      completionDate,
      remarks: actionForm.remarks.trim(),
      updatedAt: new Date().toISOString(),
    };

    const updatedActions = editingActionId
      ? actions.map(a => a.id === editingActionId ? clean : a)
      : [...actions, { ...clean, createdAt: new Date().toISOString() }];

    setActions(updatedActions);
    persistMapItem(ACTIONS_KEY, g.id, updatedActions);
    setShowActionForm(false);
    setEditingActionId(null);
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

  const caseDueState = getCaseDueState(g);

  return (
    <div className="page-wrap">
      <div className="breadcrumb"><Link href="/grievances">Grievance Tracker</Link> / {g.id}</div>
      <div className="page-heading">
        <div><h1>{g.id} — {g.title}</h1><p>{g.company} · {g.location}</p></div>
        <div className="detail-actions">
          <span className={`due-chip ${caseDueState.className}`}>{caseDueState.label}</span>
          <span className={`badge ${String(g.risk).toLowerCase()}`}>{g.risk} Risk</span>
          <span className="status-pill">{g.status}</span>
          <button className="secondary-btn" onClick={openEditForm}>Edit Grievance</button>
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

      <section className="panel">
        <div className="panel-head action-panel-head">
          <div>
            <h2>Action Plan</h2>
            <p>Corrective and follow-up actions for this grievance</p>
          </div>
          <button className="primary-btn" onClick={openNewActionForm}>+ Add Action</button>
        </div>

        <div className="action-summary">
          <MiniStat label="Total" value={actions.length} />
          <MiniStat label="Open / Active" value={actionStats.open} />
          <MiniStat label="Overdue" value={actionStats.overdue} danger={actionStats.overdue > 0} />
          <MiniStat label="Completed" value={actionStats.completed} />
        </div>

        {actions.length ? (
          <div className="table-wrap action-table-wrap">
            <table className="action-table">
              <thead>
                <tr>
                  <th>Action ID</th>
                  <th>Action</th>
                  <th>PIC</th>
                  <th>Priority</th>
                  <th>Target</th>
                  <th>Due Status</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {actions.map(action => {
                  const dueState = getDueState(action);
                  return (
                    <tr key={action.id}>
                      <td><strong>{action.id}</strong></td>
                      <td className="action-description">{action.description}<div className="muted">{action.remarks || 'No remarks'}</div></td>
                      <td>{action.pic || '-'}</td>
                      <td><span className={`priority-chip ${String(action.priority).toLowerCase()}`}>{action.priority}</span></td>
                      <td>{action.targetDate || '-'}</td>
                      <td><span className={`due-chip ${dueState.toLowerCase().replaceAll(' ', '-')}`}>{dueState}</span></td>
                      <td><span className="status-pill">{action.status}</span></td>
                      <td>
                        <div className="progress"><div style={{width:`${action.progress || 0}%`}}></div></div>
                        <div className="muted">{action.progress || 0}%</div>
                      </td>
                      <td><button className="view-btn" onClick={() => openEditActionForm(action)}>Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state action-empty">
            <div><strong>No action plan yet.</strong><p>Add corrective or follow-up actions and assign PICs and due dates.</p></div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Evidence & Documents</h2><p>Photos, letters, maps, minutes</p></div></div>
        <div className="empty-state">Evidence upload will be activated after the Action Plan stage.</div>
      </section>

      {showUpdateForm && (
        <Modal onClose={() => setShowUpdateForm(false)} title="Add Case Update" subtitle={`${g.id} — save follow-up activity and update case progress.`}>
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
            <StarterWarning />
            <FormActions onCancel={() => setShowUpdateForm(false)} submit="Save Update" />
          </form>
        </Modal>
      )}

      {showEditForm && (
        <Modal onClose={() => setShowEditForm(false)} title="Edit Grievance" subtitle={`${g.id} — update the core grievance record.`} wide>
          <form onSubmit={saveEdit}>
            <div className="form-grid">
              <Field label="Company *"><input required value={editForm.company} onChange={e=>updateEditForm('company', e.target.value)} /></Field>
              <Field label="Site / Location *"><input required value={editForm.location} onChange={e=>updateEditForm('location', e.target.value)} /></Field>
              <Field label="Category">
                <select value={editForm.category} onChange={e=>updateEditForm('category', e.target.value)}>
                  {['Land Conflict','Environmental','Social','Labor','HCV / HCS','Legal / Permit','Other'].map(v=><option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Issue / Title *"><input required value={editForm.title} onChange={e=>updateEditForm('title', e.target.value)} /></Field>
              <Field label="Complaint Source"><input value={editForm.source} onChange={e=>updateEditForm('source', e.target.value)} /></Field>
              <Field label="Opened Date"><input type="date" value={editForm.opened} onChange={e=>updateEditForm('opened', e.target.value)} /></Field>
              <Field label="Risk Level">
                <select value={editForm.risk} onChange={e=>updateEditForm('risk', e.target.value)}>{['High','Medium','Low'].map(v=><option key={v}>{v}</option>)}</select>
              </Field>
              <Field label="Status">
                <select value={editForm.status} onChange={e=>updateEditForm('status', e.target.value)}>{['Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}</select>
              </Field>
              <Field label="Progress %"><input type="number" min="0" max="100" value={editForm.progress} onChange={e=>updateEditForm('progress', e.target.value)} /></Field>
              <Field label="PIC"><input value={editForm.pic} onChange={e=>updateEditForm('pic', e.target.value)} /></Field>
              <Field label="Next Action"><input value={editForm.nextAction} onChange={e=>updateEditForm('nextAction', e.target.value)} /></Field>
              <Field label="Due Date"><input type="date" value={editForm.dueDate} onChange={e=>updateEditForm('dueDate', e.target.value)} /></Field>
              <Field label="Case Summary" wide><textarea rows="4" value={editForm.summary} onChange={e=>updateEditForm('summary', e.target.value)} /></Field>
            </div>
            <StarterWarning />
            <FormActions onCancel={() => setShowEditForm(false)} submit="Save Changes" />
          </form>
        </Modal>
      )}

      {showActionForm && (
        <Modal onClose={() => setShowActionForm(false)} title={editingActionId ? 'Edit Action Plan' : 'Add Action Plan'} subtitle={`${g.id} — assign an action, PIC, target and progress.`}>
          <form onSubmit={saveAction}>
            <div className="form-grid">
              <Field label="Action ID"><input value={actionForm.id} readOnly className="readonly-input" /></Field>
              <Field label="Priority">
                <select value={actionForm.priority} onChange={e=>updateActionForm('priority', e.target.value)}>{['High','Medium','Low'].map(v=><option key={v}>{v}</option>)}</select>
              </Field>
              <Field label="Action Description *" wide><textarea required rows="3" value={actionForm.description} onChange={e=>updateActionForm('description', e.target.value)} placeholder="What corrective/follow-up action must be completed?" /></Field>
              <Field label="PIC"><input value={actionForm.pic} onChange={e=>updateActionForm('pic', e.target.value)} placeholder="Person / department" /></Field>
              <Field label="Target Date"><input type="date" value={actionForm.targetDate} onChange={e=>updateActionForm('targetDate', e.target.value)} /></Field>
              <Field label="Status">
                <select value={actionForm.status} onChange={e=>updateActionForm('status', e.target.value)}>{['Open','In Progress','Verification','Completed'].map(v=><option key={v}>{v}</option>)}</select>
              </Field>
              <Field label="Progress %"><input type="number" min="0" max="100" value={actionForm.progress} onChange={e=>updateActionForm('progress', e.target.value)} /></Field>
              <Field label="Completion Date"><input type="date" value={actionForm.completionDate} onChange={e=>updateActionForm('completionDate', e.target.value)} /></Field>
              <Field label="Remarks" wide><textarea rows="3" value={actionForm.remarks} onChange={e=>updateActionForm('remarks', e.target.value)} placeholder="Result, dependency, blocker, or notes..." /></Field>
            </div>
            <StarterWarning text="Starter mode: action plans are stored only in this browser. Supabase will make them shared later." />
            <FormActions onCancel={() => setShowActionForm(false)} submit={editingActionId ? 'Save Action Changes' : 'Save Action'} />
          </form>
        </Modal>
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

function Modal({ onClose, title, subtitle, children, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal-card ${wide ? 'wide-modal' : 'update-modal'}`} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h2>{title}</h2><p>{subtitle}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormActions({ onCancel, submit }) {
  return (
    <div className="form-actions">
      <button type="button" className="secondary-btn" onClick={onCancel}>Cancel</button>
      <button type="submit" className="primary-btn">{submit}</button>
    </div>
  );
}

function StarterWarning({ text = 'Starter mode: changes are saved in this browser only. Supabase will make them shared later.' }) {
  return <div className="starter-warning">{text}</div>;
}

function MiniStat({ label, value, danger = false }) {
  return <div className={`mini-stat ${danger ? 'danger' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function persistMapItem(storageKey, itemId, value) {
  const current = safeParse(localStorage.getItem(storageKey), {});
  localStorage.setItem(storageKey, JSON.stringify({ ...current, [itemId]: value }));
}

function clampProgress(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function createActionId(actions) {
  const max = actions.reduce((highest, item) => {
    const n = Number(String(item.id || '').replace(/\D/g, ''));
    return Number.isFinite(n) ? Math.max(highest, n) : highest;
  }, 0);
  return `ACT-${String(max + 1).padStart(3, '0')}`;
}

function normalizeInputDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dayDifference(dateValue) {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T23:59:59`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function getDueState(action) {
  if (action.status === 'Completed') return 'Completed';
  const diff = dayDifference(action.targetDate);
  if (diff === null) return 'No Due Date';
  if (diff < 0) return 'Overdue';
  if (diff <= 14) return 'Due Soon';
  return 'On Track';
}

function getCaseDueState(g) {
  if (g.status === 'Closed') return { label: 'Closed', className: 'completed' };
  const diff = dayDifference(g.dueDate);
  if (diff === null) return { label: 'No Due Date', className: 'no-due-date' };
  if (diff < 0) return { label: 'Overdue', className: 'overdue' };
  if (diff <= 14) return { label: 'Due Soon', className: 'due-soon' };
  return { label: 'On Track', className: 'on-track' };
}
