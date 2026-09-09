'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase, getSupabaseConfigError } from '../../../lib/supabaseClient';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const emptyUpdate = {
  date: '', title: 'Follow-up Update', description: '', updatedBy: '',
  status: 'In Progress', progress: 0, nextAction: '', dueDate: '',
};

const emptyEdit = {
  companyId: '', siteId: '', company: '', location: '', category: 'Land Conflict', title: '', source: '', opened: '',
  risk: 'Medium', status: 'Open', progress: 0, pic: '', nextAction: '', dueDate: '', summary: '',
};

const emptyAction = {
  rowId: '', id: '', description: '', pic: '', targetDate: '', priority: 'Medium',
  status: 'Open', progress: 0, completionDate: '', remarks: '',
};

const emptyEvidence = {
  rowId: '', id: '', title: '', category: 'Meeting Minutes', evidenceDate: '', uploadedBy: '',
  linkedActionUuid: '', description: '', file: null,
};

const emptyClosure = {
  closureDate: '', verifiedBy: '', verificationMethod: 'Document Review', outcome: 'Resolved',
  closureSummary: '', evidenceReference: '',
};

const emptyReopen = {
  reopenDate: '', reopenedBy: '', reason: '', progress: 90, nextAction: '', dueDate: '',
};

export default function GrievanceDetail() {
  const params = useParams();
  const caseId = params?.id;

  const [g, setG] = useState(null);
  const [caseUpdates, setCaseUpdates] = useState([]);
  const [actions, setActions] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [closure, setClosure] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [pageError, setPageError] = useState('');
  const [busy, setBusy] = useState(false);

  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [showClosureForm, setShowClosureForm] = useState(false);
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [editingActionRowId, setEditingActionRowId] = useState(null);

  const [form, setForm] = useState({ ...emptyUpdate, date: todayISO() });
  const [editForm, setEditForm] = useState(emptyEdit);
  const [actionForm, setActionForm] = useState(emptyAction);
  const [evidenceForm, setEvidenceForm] = useState({ ...emptyEvidence, evidenceDate: todayISO() });
  const [closureForm, setClosureForm] = useState({ ...emptyClosure, closureDate: todayISO() });
  const [reopenForm, setReopenForm] = useState({ ...emptyReopen, reopenDate: todayISO() });
  const [closureError, setClosureError] = useState('');
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');

  useEffect(() => {
    loadCase();
  }, [caseId]);

  async function loadCase() {
    const configError = getSupabaseConfigError();
    if (configError || !supabase) {
      setPageError(configError || 'Supabase is not configured.');
      setLoaded(true);
      return;
    }

    setLoaded(false);
    setPageError('');

    const { data: caseRow, error: caseError } = await supabase
      .from('grievances')
      .select('*')
      .eq('case_id', caseId)
      .maybeSingle();

    if (caseError) {
      setPageError(caseError.message);
      setLoaded(true);
      return;
    }
    if (!caseRow) {
      setG(null);
      setLoaded(true);
      return;
    }

    const grievance = mapDbCase(caseRow);
    setG(grievance);

    const [updatesRes, actionsRes, evidenceRes, closureRes, companiesRes, sitesRes] = await Promise.all([
      supabase.from('grievance_updates').select('*').eq('grievance_id', caseRow.id).order('update_date', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('grievance_actions').select('*').eq('grievance_id', caseRow.id).order('created_at', { ascending: true }),
      supabase.from('grievance_evidence').select('*').eq('grievance_id', caseRow.id).order('created_at', { ascending: true }),
      supabase.from('grievance_closures').select('*').eq('grievance_id', caseRow.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('sites').select('*').order('site_name'),
    ]);

    const childError = updatesRes.error || actionsRes.error || evidenceRes.error || closureRes.error || companiesRes.error || sitesRes.error;
    if (childError) setPageError(childError.message);

    setCaseUpdates((updatesRes.data || []).map(mapDbUpdate));
    setActions((actionsRes.data || []).map(mapDbAction));
    setEvidence((evidenceRes.data || []).map(mapDbEvidence));
    setClosure(closureRes.data?.[0] ? mapDbClosure(closureRes.data[0]) : null);
    setCompanies(companiesRes.data || []);
    setSites(sitesRes.data || []);
    setLoaded(true);
  }

  const timeline = useMemo(() => caseUpdates.map(item => ({
    key: item.rowId,
    date: formatDisplayDate(item.date),
    title: item.title,
    description: item.description,
    updatedBy: item.updatedBy,
  })), [caseUpdates]);

  const actionStats = useMemo(() => {
    const completed = actions.filter(a => a.status === 'Completed').length;
    const overdue = actions.filter(a => getDueState(a) === 'Overdue').length;
    return { completed, overdue, open: actions.length - completed };
  }, [actions]);

  const evidenceStats = useMemo(() => {
    const totalBytes = evidence.reduce((sum, item) => sum + Number(item.fileSize || 0), 0);
    const linked = evidence.filter(item => item.linkedActionUuid).length;
    const latest = [...evidence].sort((a,b) => String(b.evidenceDate || '').localeCompare(String(a.evidenceDate || '')))[0];
    return { totalBytes, linked, latest };
  }, [evidence]);

  function updateForm(field, value) { setForm(prev => ({ ...prev, [field]: value })); }
  function updateEditForm(field, value) { setEditForm(prev => ({ ...prev, [field]: value })); }
  function updateActionForm(field, value) { setActionForm(prev => ({ ...prev, [field]: value })); }
  function updateEvidenceForm(field, value) { setEvidenceForm(prev => ({ ...prev, [field]: value })); }
  function updateClosureForm(field, value) { setClosureForm(prev => ({ ...prev, [field]: value })); }
  function updateReopenForm(field, value) { setReopenForm(prev => ({ ...prev, [field]: value })); }

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
      companyId: g.companyId || '', siteId: g.siteId || '', company: g.company || '', location: g.location || '', category: g.category || 'Other', title: g.title || '',
      source: g.source || '', opened: g.opened || '', risk: g.risk || 'Medium', status: g.status || 'Open',
      progress: Number(g.progress || 0), pic: g.pic || '', nextAction: g.nextAction || '', dueDate: g.dueDate || '', summary: g.summary || '',
    });
    setShowEditForm(true);
  }

  function openNewActionForm() {
    setEditingActionRowId(null);
    setActionForm({ ...emptyAction, targetDate: g?.dueDate || '' });
    setShowActionForm(true);
  }

  function openEditActionForm(action) {
    setEditingActionRowId(action.rowId);
    setActionForm({ ...emptyAction, ...action });
    setShowActionForm(true);
  }

  function openEvidenceForm() {
    setEvidenceError('');
    setEvidenceForm({ ...emptyEvidence, evidenceDate: todayISO() });
    setShowEvidenceForm(true);
  }

  function openClosureForm() {
    setClosureError('');
    setClosureForm({ ...emptyClosure, closureDate: todayISO(), evidenceReference: evidence[0]?.rowId || '' });
    setShowClosureForm(true);
  }

  function openReopenForm() {
    setClosureError('');
    setReopenForm({ ...emptyReopen, reopenDate: todayISO(), progress: 90 });
    setShowReopenForm(true);
  }

  async function saveUpdate(e) {
    e.preventDefault();
    if (!g || !supabase) return;
    setBusy(true);
    setPageError('');

    const progress = clampProgress(form.progress);
    const { error: updateInsertError } = await supabase.from('grievance_updates').insert({
      grievance_id: g.rowId,
      update_date: form.date || todayISO(),
      updated_by: form.updatedBy.trim() || null,
      update_title: form.title.trim() || 'Follow-up Update',
      notes: form.description.trim(),
      case_status: form.status,
      progress,
      next_action: form.nextAction.trim() || null,
      due_date: form.dueDate || null,
    });

    if (updateInsertError) {
      setPageError(updateInsertError.message);
      setBusy(false);
      return;
    }

    const { error: caseUpdateError } = await supabase.from('grievances').update({
      status: form.status,
      progress,
      next_action: form.nextAction.trim() || null,
      due_date: form.dueDate || null,
    }).eq('id', g.rowId);

    if (caseUpdateError) setPageError(caseUpdateError.message);
    setShowUpdateForm(false);
    setBusy(false);
    await loadCase();
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!g || !supabase) return;
    setBusy(true);
    setPageError('');

    const selectedCompany = companies.find(c => c.id === editForm.companyId);
    const selectedSite = sites.find(s => s.id === editForm.siteId);
    const { error } = await supabase.from('grievances').update({
      company_id: editForm.companyId || null,
      site_id: editForm.siteId || null,
      company: selectedCompany ? selectedCompany.company_code : editForm.company.trim(),
      site: selectedSite ? selectedSite.site_name : editForm.location.trim(),
      category: editForm.category,
      issue_title: editForm.title.trim(),
      complaint_source: editForm.source.trim() || null,
      opened_date: editForm.opened || null,
      risk_level: editForm.risk,
      status: editForm.status,
      progress: clampProgress(editForm.progress),
      pic: editForm.pic.trim() || null,
      next_action: editForm.nextAction.trim() || null,
      due_date: editForm.dueDate || null,
      case_summary: editForm.summary.trim() || null,
    }).eq('id', g.rowId);

    if (error) setPageError(error.message);
    else setShowEditForm(false);
    setBusy(false);
    await loadCase();
  }

  async function saveAction(e) {
    e.preventDefault();
    if (!g || !supabase) return;
    setBusy(true);
    setPageError('');

    const status = actionForm.status;
    const progress = status === 'Completed' ? 100 : clampProgress(actionForm.progress);
    const completionDate = status === 'Completed' ? (actionForm.completionDate || todayISO()) : (actionForm.completionDate || null);
    const payload = {
      grievance_id: g.rowId,
      action_description: actionForm.description.trim(),
      pic: actionForm.pic.trim() || null,
      priority: actionForm.priority,
      target_date: actionForm.targetDate || null,
      status,
      progress,
      completion_date: completionDate,
      remarks: actionForm.remarks.trim() || null,
    };

    let error;
    if (editingActionRowId) {
      ({ error } = await supabase.from('grievance_actions').update(payload).eq('id', editingActionRowId));
    } else {
      ({ error } = await supabase.from('grievance_actions').insert(payload));
    }

    if (error) setPageError(error.message);
    else {
      setShowActionForm(false);
      setEditingActionRowId(null);
    }
    setBusy(false);
    await loadCase();
  }

  async function saveEvidence(e) {
    e.preventDefault();
    if (!g || !supabase) return;
    setEvidenceError('');
    const file = evidenceForm.file;
    if (!file) {
      setEvidenceError('Please choose a file to upload.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setEvidenceError('Maximum file size is 10 MB per file.');
      return;
    }

    setEvidenceBusy(true);
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${g.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('grievance-evidence')
      .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });

    if (uploadError) {
      setEvidenceError(`${uploadError.message}. Check that the private bucket grievance-evidence exists and Storage policies were created.`);
      setEvidenceBusy(false);
      return;
    }

    const { error: metadataError } = await supabase.from('grievance_evidence').insert({
      grievance_id: g.rowId,
      action_id: evidenceForm.linkedActionUuid || null,
      evidence_title: evidenceForm.title.trim() || file.name,
      category: evidenceForm.category,
      evidence_date: evidenceForm.evidenceDate || todayISO(),
      uploaded_by: evidenceForm.uploadedBy.trim() || null,
      description: evidenceForm.description.trim() || null,
      file_name: file.name,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
    });

    if (metadataError) {
      await supabase.storage.from('grievance-evidence').remove([storagePath]);
      setEvidenceError(metadataError.message);
      setEvidenceBusy(false);
      return;
    }

    setShowEvidenceForm(false);
    setEvidenceBusy(false);
    await loadCase();
  }

  async function openEvidenceFile(item) {
    if (!supabase || !item.storagePath) return;
    const { data, error } = await supabase.storage.from('grievance-evidence').createSignedUrl(item.storagePath, 60);
    if (error) {
      alert(error.message);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function downloadEvidenceFile(item) {
    if (!supabase || !item.storagePath) return;
    const { data, error } = await supabase.storage.from('grievance-evidence').download(item.storagePath);
    if (error) {
      alert(error.message);
      return;
    }
    const url = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = item.fileName || item.title || 'evidence';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function deleteEvidence(item) {
    if (!supabase) return;
    if (!confirm(`Delete evidence ${item.id} — ${item.title}?`)) return;
    setEvidenceBusy(true);

    const { error: dbError } = await supabase.from('grievance_evidence').delete().eq('id', item.rowId);
    if (dbError) {
      alert(dbError.message);
      setEvidenceBusy(false);
      return;
    }
    if (item.storagePath) await supabase.storage.from('grievance-evidence').remove([item.storagePath]);
    setEvidenceBusy(false);
    await loadCase();
  }

  async function saveClosure(e) {
    e.preventDefault();
    if (!g || !supabase) return;
    setClosureError('');

    const activeActions = actions.filter(a => a.status !== 'Completed');
    if (activeActions.length > 0) {
      setClosureError(`Cannot close yet: ${activeActions.length} action plan(s) are still open or active.`);
      return;
    }
    if (evidence.length === 0) {
      setClosureError('Cannot close yet: upload at least one evidence file before closure.');
      return;
    }
    if (!closureForm.verifiedBy.trim() || !closureForm.closureSummary.trim()) {
      setClosureError('Verified By and Closure Summary are required.');
      return;
    }

    setBusy(true);
    const closureDate = closureForm.closureDate || todayISO();
    const { error: closeError } = await supabase.from('grievance_closures').insert({
      grievance_id: g.rowId,
      closure_date: closureDate,
      verified_by: closureForm.verifiedBy.trim(),
      verification_method: closureForm.verificationMethod,
      outcome: closureForm.outcome,
      primary_evidence_id: closureForm.evidenceReference || null,
      closure_summary: closureForm.closureSummary.trim(),
    });

    if (closeError) {
      setClosureError(closeError.message);
      setBusy(false);
      return;
    }

    const { error: caseError } = await supabase.from('grievances').update({
      status: 'Closed', progress: 100, next_action: null,
    }).eq('id', g.rowId);

    if (!caseError) {
      await supabase.from('grievance_updates').insert({
        grievance_id: g.rowId,
        update_date: closureDate,
        updated_by: closureForm.verifiedBy.trim(),
        update_title: 'Grievance Closed',
        notes: closureForm.closureSummary.trim(),
        case_status: 'Closed',
        progress: 100,
      });
    }

    if (caseError) setClosureError(caseError.message);
    else setShowClosureForm(false);
    setBusy(false);
    await loadCase();
  }

  async function saveReopen(e) {
    e.preventDefault();
    if (!g || !supabase || !closure) return;
    setClosureError('');
    if (!reopenForm.reopenedBy.trim() || !reopenForm.reason.trim()) {
      setClosureError('Reopened By and Reason are required.');
      return;
    }

    setBusy(true);
    const reopenDate = reopenForm.reopenDate || todayISO();
    const progress = Math.min(99, clampProgress(reopenForm.progress));

    const { error: closureUpdateError } = await supabase.from('grievance_closures').update({
      reopened_at: reopenDate,
      reopened_by: reopenForm.reopenedBy.trim(),
      reopen_reason: reopenForm.reason.trim(),
      reopen_due_date: reopenForm.dueDate || null,
      reopen_next_action: reopenForm.nextAction.trim() || null,
    }).eq('id', closure.rowId);

    if (closureUpdateError) {
      setClosureError(closureUpdateError.message);
      setBusy(false);
      return;
    }

    const { error: caseError } = await supabase.from('grievances').update({
      status: 'In Progress',
      progress,
      next_action: reopenForm.nextAction.trim() || null,
      due_date: reopenForm.dueDate || null,
    }).eq('id', g.rowId);

    if (!caseError) {
      await supabase.from('grievance_updates').insert({
        grievance_id: g.rowId,
        update_date: reopenDate,
        updated_by: reopenForm.reopenedBy.trim(),
        update_title: 'Grievance Reopened',
        notes: reopenForm.reason.trim(),
        case_status: 'In Progress',
        progress,
        next_action: reopenForm.nextAction.trim() || null,
        due_date: reopenForm.dueDate || null,
      });
    }

    if (caseError) setClosureError(caseError.message);
    else setShowReopenForm(false);
    setBusy(false);
    await loadCase();
  }

  if (!loaded) return <div className="page-wrap"><p>Loading case from Supabase…</p></div>;

  if (!g) {
    return (
      <div className="page-wrap">
        {pageError ? <div className="sync-error"><strong>Supabase error</strong><span>{pageError}</span></div> : null}
        <h1>Case not found</h1>
        <Link className="text-link" href="/grievances">← Back to tracker</Link>
      </div>
    );
  }

  const caseDueState = getCaseDueState(g);
  const primaryEvidenceLabel = closure?.evidenceReference
    ? evidence.find(item => item.rowId === closure.evidenceReference)?.id || 'Evidence record'
    : '-';

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

      {pageError ? <div className="sync-error"><strong>Supabase warning</strong><span>{pageError}</span></div> : <div className="sync-success">● Live Supabase record</div>}

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
                <p>{item.description || '-'}</p>
                {item.updatedBy ? <div className="timeline-meta">Updated by {item.updatedBy}</div> : null}
              </div>
            </div>
          )) : <div className="empty-state">No timeline update yet.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head action-panel-head">
          <div><h2>Action Plan</h2><p>Corrective and follow-up actions for this grievance</p></div>
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
              <thead><tr><th>Action ID</th><th>Action</th><th>PIC</th><th>Priority</th><th>Target</th><th>Due Status</th><th>Status</th><th>Progress</th><th></th></tr></thead>
              <tbody>
                {actions.map(action => {
                  const dueState = getDueState(action);
                  return (
                    <tr key={action.rowId}>
                      <td><strong>{action.id}</strong></td>
                      <td className="action-description">{action.description}<div className="muted">{action.remarks || 'No remarks'}</div></td>
                      <td>{action.pic || '-'}</td>
                      <td><span className={`priority-chip ${String(action.priority).toLowerCase()}`}>{action.priority}</span></td>
                      <td>{action.targetDate || '-'}</td>
                      <td><span className={`due-chip ${dueState.toLowerCase().replaceAll(' ', '-')}`}>{dueState}</span></td>
                      <td><span className="status-pill">{action.status}</span></td>
                      <td><div className="progress"><div style={{width:`${action.progress || 0}%`}}></div></div><div className="muted">{action.progress || 0}%</div></td>
                      <td><button className="view-btn" onClick={() => openEditActionForm(action)}>Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state action-empty"><div><strong>No action plan yet.</strong><p>Add corrective or follow-up actions and assign PICs and due dates.</p></div></div>}
      </section>

      <section className="panel">
        <div className="panel-head evidence-panel-head">
          <div><h2>Evidence & Documents</h2><p>Private files stored in Supabase Storage</p></div>
          <button className="primary-btn" onClick={openEvidenceForm}>+ Upload Evidence</button>
        </div>
        <div className="action-summary evidence-summary">
          <MiniStat label="Total Files" value={evidence.length} />
          <MiniStat label="Linked to Action" value={evidenceStats.linked} />
          <MiniStat label="Storage" value={formatBytes(evidenceStats.totalBytes)} />
          <MiniStat label="Latest" value={evidenceStats.latest ? formatShortDate(evidenceStats.latest.evidenceDate) : '-'} />
        </div>
        {evidence.length ? (
          <div className="table-wrap evidence-table-wrap">
            <table className="evidence-table">
              <thead><tr><th>Evidence ID</th><th>Document / Evidence</th><th>Category</th><th>Evidence Date</th><th>Linked Action</th><th>Uploaded By</th><th>File</th><th></th></tr></thead>
              <tbody>
                {evidence.map(item => (
                  <tr key={item.rowId}>
                    <td><strong>{item.id}</strong></td>
                    <td className="evidence-title"><strong>{item.title}</strong><div className="muted">{item.description || 'No description'}</div></td>
                    <td><span className="category-chip">{item.category || '-'}</span></td>
                    <td>{item.evidenceDate || '-'}</td>
                    <td>{actions.find(a => a.rowId === item.linkedActionUuid)?.id || '-'}</td>
                    <td>{item.uploadedBy || '-'}</td>
                    <td><div className="file-cell"><strong>{item.fileName || '-'}</strong><span>{formatBytes(item.fileSize)}</span></div></td>
                    <td><div className="row-actions">
                      <button className="view-btn" onClick={() => openEvidenceFile(item)}>View</button>
                      <button className="view-btn" onClick={() => downloadEvidenceFile(item)}>Download</button>
                      <button className="danger-btn" onClick={() => deleteEvidence(item)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state action-empty"><div><strong>No evidence uploaded yet.</strong><p>Upload photos, PDFs, meeting minutes, letters, maps or proof of corrective action.</p></div></div>}
        <div className="supabase-note">Private Storage: files are now centrally stored and can be accessed from another device that has access to this application.</div>
      </section>

      <section className="panel closure-panel">
        <div className="panel-head closure-panel-head">
          <div><h2>Closure & Verification</h2><p>Close only after actions are completed and supporting evidence is available.</p></div>
          {g.status === 'Closed'
            ? <button className="secondary-btn" onClick={openReopenForm}>Reopen Grievance</button>
            : <button className="primary-btn" onClick={openClosureForm}>Close Grievance</button>}
        </div>

        <div className="closure-readiness">
          <div className={`readiness-item ${actions.filter(a => a.status !== 'Completed').length === 0 ? 'ready' : 'blocked'}`}><span>Action Plan</span><strong>{actions.filter(a => a.status !== 'Completed').length === 0 ? 'Ready' : `${actions.filter(a => a.status !== 'Completed').length} active`}</strong></div>
          <div className={`readiness-item ${evidence.length > 0 ? 'ready' : 'blocked'}`}><span>Evidence</span><strong>{evidence.length > 0 ? `${evidence.length} file(s)` : 'Required'}</strong></div>
          <div className={`readiness-item ${g.status === 'Closed' ? 'ready' : 'pending'}`}><span>Verification</span><strong>{g.status === 'Closed' ? 'Completed' : 'Pending'}</strong></div>
        </div>

        {g.status === 'Closed' && closure ? (
          <div className="closure-record">
            <div className="closure-badge">✓ CLOSED</div>
            <div className="info-grid closure-info-grid">
              <Info label="Closure Date" value={closure.closureDate || '-'} />
              <Info label="Verified By" value={closure.verifiedBy || '-'} />
              <Info label="Verification Method" value={closure.verificationMethod || '-'} />
              <Info label="Outcome" value={closure.outcome || '-'} />
              <Info label="Evidence Reference" value={primaryEvidenceLabel} />
            </div>
            <div className="summary-box"><span>Closure Summary</span><p>{closure.closureSummary || '-'}</p></div>
          </div>
        ) : closure?.reopened ? (
          <div className="reopen-history"><strong>Previously closed and reopened</strong><p>{closure.reopenDate || '-'} · {closure.reopenedBy || '-'} · {closure.reopenReason || '-'}</p></div>
        ) : (
          <div className="closure-help">Closure requires: no active action plan, at least one evidence file, verifier name, and closure summary.</div>
        )}
      </section>

      {showUpdateForm && (
        <Modal onClose={() => !busy && setShowUpdateForm(false)} title="Add Case Update" subtitle={`${g.id} — save follow-up activity and update case progress.`}>
          <form onSubmit={saveUpdate}>
            <div className="form-grid">
              <Field label="Update Date *"><input required type="date" value={form.date} onChange={e=>updateForm('date', e.target.value)} /></Field>
              <Field label="Updated By"><input value={form.updatedBy} onChange={e=>updateForm('updatedBy', e.target.value)} placeholder="Person / team" /></Field>
              <Field label="Update Title *" wide><input required value={form.title} onChange={e=>updateForm('title', e.target.value)} placeholder="e.g. Stakeholder meeting completed" /></Field>
              <Field label="Update / Notes *" wide><textarea required rows="4" value={form.description} onChange={e=>updateForm('description', e.target.value)} placeholder="What happened, result, decision, or follow-up..." /></Field>
              <Field label="Case Status"><select value={form.status} onChange={e=>updateForm('status', e.target.value)}>{['Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Progress %"><input type="number" min="0" max="100" value={form.progress} onChange={e=>updateForm('progress', e.target.value)} /></Field>
              <Field label="Next Action"><input value={form.nextAction} onChange={e=>updateForm('nextAction', e.target.value)} placeholder="Next follow-up action" /></Field>
              <Field label="Due Date"><input type="date" value={form.dueDate} onChange={e=>updateForm('dueDate', e.target.value)} /></Field>
            </div>
            <SupabaseNote />
            <FormActions onCancel={() => setShowUpdateForm(false)} submit={busy ? 'Saving…' : 'Save Update'} disabled={busy} />
          </form>
        </Modal>
      )}

      {showEditForm && (
        <Modal onClose={() => !busy && setShowEditForm(false)} title="Edit Grievance" subtitle={`${g.id} — update the core grievance record.`} wide>
          <form onSubmit={saveEdit}>
            <div className="form-grid">
              <Field label="Company *"><select required value={editForm.companyId} onChange={e=>setEditForm(prev=>({...prev, companyId:e.target.value, siteId:'', location:'', company:companies.find(c=>c.id===e.target.value)?.company_code || prev.company}))}><option value="">Select company…</option>{companies.filter(c=>c.status==='Active').map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></Field>
              <Field label="Site / Location"><select value={editForm.siteId} onChange={e=>setEditForm(prev=>({...prev, siteId:e.target.value, location:sites.find(s=>s.id===e.target.value)?.site_name || ''}))}><option value="">Company level / not specified</option>{sites.filter(s=>s.company_id===editForm.companyId&&s.status==='Active').map(s=><option key={s.id} value={s.id}>{s.site_name} ({s.site_type})</option>)}</select></Field>
              <Field label="Category"><select value={editForm.category} onChange={e=>updateEditForm('category', e.target.value)}>{['Land Conflict','Environmental','Social','Labor','HCV / HCS','Deforestation / NDPE','Legal / Permit','Supplier','Buyer Requirement','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Issue / Title *"><input required value={editForm.title} onChange={e=>updateEditForm('title', e.target.value)} /></Field>
              <Field label="Complaint Source"><input value={editForm.source} onChange={e=>updateEditForm('source', e.target.value)} /></Field>
              <Field label="Opened Date"><input type="date" value={editForm.opened} onChange={e=>updateEditForm('opened', e.target.value)} /></Field>
              <Field label="Risk Level"><select value={editForm.risk} onChange={e=>updateEditForm('risk', e.target.value)}>{['Critical','High','Medium','Low'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Status"><select value={editForm.status} onChange={e=>updateEditForm('status', e.target.value)}>{['Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Progress %"><input type="number" min="0" max="100" value={editForm.progress} onChange={e=>updateEditForm('progress', e.target.value)} /></Field>
              <Field label="PIC"><input value={editForm.pic} onChange={e=>updateEditForm('pic', e.target.value)} /></Field>
              <Field label="Next Action"><input value={editForm.nextAction} onChange={e=>updateEditForm('nextAction', e.target.value)} /></Field>
              <Field label="Due Date"><input type="date" value={editForm.dueDate} onChange={e=>updateEditForm('dueDate', e.target.value)} /></Field>
              <Field label="Case Summary" wide><textarea rows="4" value={editForm.summary} onChange={e=>updateEditForm('summary', e.target.value)} /></Field>
            </div>
            <SupabaseNote />
            <FormActions onCancel={() => setShowEditForm(false)} submit={busy ? 'Saving…' : 'Save Changes'} disabled={busy} />
          </form>
        </Modal>
      )}

      {showActionForm && (
        <Modal onClose={() => !busy && setShowActionForm(false)} title={editingActionRowId ? 'Edit Action Plan' : 'Add Action Plan'} subtitle={`${g.id} — assign an action, PIC, target and progress.`}>
          <form onSubmit={saveAction}>
            <div className="form-grid">
              <Field label="Action ID"><input value={actionForm.id || 'Auto generated after save'} readOnly className="readonly-input" /></Field>
              <Field label="Priority"><select value={actionForm.priority} onChange={e=>updateActionForm('priority', e.target.value)}>{['Critical','High','Medium','Low'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Action Description *" wide><textarea required rows="3" value={actionForm.description} onChange={e=>updateActionForm('description', e.target.value)} placeholder="What corrective/follow-up action must be completed?" /></Field>
              <Field label="PIC"><input value={actionForm.pic} onChange={e=>updateActionForm('pic', e.target.value)} placeholder="Person / department" /></Field>
              <Field label="Target Date"><input type="date" value={actionForm.targetDate || ''} onChange={e=>updateActionForm('targetDate', e.target.value)} /></Field>
              <Field label="Status"><select value={actionForm.status} onChange={e=>updateActionForm('status', e.target.value)}>{['Open','In Progress','Verification','Completed'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Progress %"><input type="number" min="0" max="100" value={actionForm.progress} onChange={e=>updateActionForm('progress', e.target.value)} /></Field>
              <Field label="Completion Date"><input type="date" value={actionForm.completionDate || ''} onChange={e=>updateActionForm('completionDate', e.target.value)} /></Field>
              <Field label="Remarks" wide><textarea rows="3" value={actionForm.remarks} onChange={e=>updateActionForm('remarks', e.target.value)} placeholder="Result, dependency, blocker, or notes..." /></Field>
            </div>
            <SupabaseNote />
            <FormActions onCancel={() => setShowActionForm(false)} submit={busy ? 'Saving…' : (editingActionRowId ? 'Save Action Changes' : 'Save Action')} disabled={busy} />
          </form>
        </Modal>
      )}

      {showEvidenceForm && (
        <Modal onClose={() => !evidenceBusy && setShowEvidenceForm(false)} title="Upload Evidence" subtitle={`${g.id} — upload to private Supabase Storage.`} wide>
          <form onSubmit={saveEvidence}>
            <div className="form-grid">
              <Field label="Evidence ID"><input value="Auto generated after save" readOnly className="readonly-input" /></Field>
              <Field label="Evidence Date *"><input required type="date" value={evidenceForm.evidenceDate} onChange={e=>updateEvidenceForm('evidenceDate', e.target.value)} /></Field>
              <Field label="Evidence Title *" wide><input required value={evidenceForm.title} onChange={e=>updateEvidenceForm('title', e.target.value)} placeholder="e.g. Minutes of stakeholder meeting" /></Field>
              <Field label="Category"><select value={evidenceForm.category} onChange={e=>updateEvidenceForm('category', e.target.value)}>{['Meeting Minutes','Photo / Field Evidence','Letter / Correspondence','Map / Spatial Data','Permit / Legal Document','Corrective Action Proof','Investigation Report','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Linked Action"><select value={evidenceForm.linkedActionUuid} onChange={e=>updateEvidenceForm('linkedActionUuid', e.target.value)}><option value="">Not linked to an action</option>{actions.map(action => <option key={action.rowId} value={action.rowId}>{action.id} — {action.description.slice(0,60)}</option>)}</select></Field>
              <Field label="Uploaded By"><input value={evidenceForm.uploadedBy} onChange={e=>updateEvidenceForm('uploadedBy', e.target.value)} placeholder="Person / team" /></Field>
              <Field label="File *"><input required type="file" onChange={e=>updateEvidenceForm('file', e.target.files?.[0] || null)} /><small className="field-help">Maximum 10 MB.</small></Field>
              <Field label="Description / Notes" wide><textarea rows="3" value={evidenceForm.description} onChange={e=>updateEvidenceForm('description', e.target.value)} placeholder="What does this evidence prove or support?" /></Field>
            </div>
            {evidenceError ? <div className="form-error">{evidenceError}</div> : null}
            <div className="supabase-note">File will be stored in the private <strong>grievance-evidence</strong> bucket.</div>
            <div className="form-actions">
              <button type="button" className="secondary-btn" disabled={evidenceBusy} onClick={() => setShowEvidenceForm(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={evidenceBusy}>{evidenceBusy ? 'Uploading…' : 'Upload to Supabase'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showClosureForm && (
        <Modal onClose={() => !busy && setShowClosureForm(false)} title="Close Grievance" subtitle={`${g.id} — verify resolution before closing the case.`} wide>
          <form onSubmit={saveClosure}>
            <div className="closure-rule-box"><strong>Closure checks</strong><div>• Active actions: {actions.filter(a => a.status !== 'Completed').length}</div><div>• Evidence files: {evidence.length}</div><div>All active actions must be completed and at least one evidence file must exist.</div></div>
            <div className="form-grid">
              <Field label="Closure Date *"><input required type="date" value={closureForm.closureDate} onChange={e=>updateClosureForm('closureDate', e.target.value)} /></Field>
              <Field label="Verified By *"><input required value={closureForm.verifiedBy} onChange={e=>updateClosureForm('verifiedBy', e.target.value)} placeholder="Verifier / responsible person" /></Field>
              <Field label="Verification Method"><select value={closureForm.verificationMethod} onChange={e=>updateClosureForm('verificationMethod', e.target.value)}>{['Document Review','Field Verification','Stakeholder Confirmation','Management Approval','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Outcome"><select value={closureForm.outcome} onChange={e=>updateClosureForm('outcome', e.target.value)}>{['Resolved','Resolved with Monitoring','Partially Resolved','No Further Action'].map(v=><option key={v}>{v}</option>)}</select></Field>
              <Field label="Primary Evidence"><select value={closureForm.evidenceReference} onChange={e=>updateClosureForm('evidenceReference', e.target.value)}><option value="">Select evidence</option>{evidence.map(item => <option key={item.rowId} value={item.rowId}>{item.id} — {item.title}</option>)}</select></Field>
              <Field label="Closure Summary *" wide><textarea required rows="5" value={closureForm.closureSummary} onChange={e=>updateClosureForm('closureSummary', e.target.value)} placeholder="Why can this grievance be considered resolved? Include verification result and final condition." /></Field>
            </div>
            {closureError ? <div className="form-error">{closureError}</div> : null}
            <SupabaseNote />
            <FormActions onCancel={() => setShowClosureForm(false)} submit={busy ? 'Closing…' : 'Verify & Close Grievance'} disabled={busy} />
          </form>
        </Modal>
      )}

      {showReopenForm && (
        <Modal onClose={() => !busy && setShowReopenForm(false)} title="Reopen Grievance" subtitle={`${g.id} — reopen a closed case with a documented reason.`} wide>
          <form onSubmit={saveReopen}>
            <div className="form-grid">
              <Field label="Reopen Date *"><input required type="date" value={reopenForm.reopenDate} onChange={e=>updateReopenForm('reopenDate', e.target.value)} /></Field>
              <Field label="Reopened By *"><input required value={reopenForm.reopenedBy} onChange={e=>updateReopenForm('reopenedBy', e.target.value)} placeholder="Person / team" /></Field>
              <Field label="Reason for Reopening *" wide><textarea required rows="4" value={reopenForm.reason} onChange={e=>updateReopenForm('reason', e.target.value)} placeholder="New complaint, failed verification, recurring issue, incomplete resolution, etc." /></Field>
              <Field label="Progress %"><input type="number" min="0" max="99" value={reopenForm.progress} onChange={e=>updateReopenForm('progress', e.target.value)} /></Field>
              <Field label="New Due Date"><input type="date" value={reopenForm.dueDate} onChange={e=>updateReopenForm('dueDate', e.target.value)} /></Field>
              <Field label="Next Action" wide><input value={reopenForm.nextAction} onChange={e=>updateReopenForm('nextAction', e.target.value)} placeholder="What must happen next?" /></Field>
            </div>
            {closureError ? <div className="form-error">{closureError}</div> : null}
            <SupabaseNote text="Reopening updates the shared Supabase record and keeps the previous closure record." />
            <FormActions onCancel={() => setShowReopenForm(false)} submit={busy ? 'Reopening…' : 'Reopen Case'} disabled={busy} />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Info({label,value}) { return <div className="info"><span>{label}</span><strong>{value}</strong></div>; }
function Field({ label, children, wide = false }) { return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>; }

function Modal({ onClose, title, subtitle, children, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal-card ${wide ? 'wide-modal' : 'update-modal'}`} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}

function FormActions({ onCancel, submit, disabled = false }) {
  return <div className="form-actions"><button type="button" className="secondary-btn" onClick={onCancel} disabled={disabled}>Cancel</button><button type="submit" className="primary-btn" disabled={disabled}>{submit}</button></div>;
}

function SupabaseNote({ text = 'Supabase mode: changes are saved to the shared database.' }) {
  return <div className="supabase-note">{text}</div>;
}

function MiniStat({ label, value, danger = false }) { return <div className={`mini-stat ${danger ? 'danger' : ''}`}><span>{label}</span><strong>{value}</strong></div>; }

function mapDbCase(row) {
  return {
    rowId: row.id, id: row.case_id, companyId: row.company_id || '', siteId: row.site_id || '', company: row.company || '', location: row.site || '', category: row.category || '',
    title: row.issue_title || '', source: row.complaint_source || '', opened: row.opened_date || '', risk: row.risk_level || 'Medium',
    status: row.status || 'Open', progress: Number(row.progress || 0), pic: row.pic || '', nextAction: row.next_action || '', dueDate: row.due_date || '', summary: row.case_summary || '',
  };
}

function mapDbUpdate(row) {
  return { rowId: row.id, id: row.update_id, date: row.update_date || '', updatedBy: row.updated_by || '', title: row.update_title || '', description: row.notes || '' };
}

function mapDbAction(row) {
  return {
    rowId: row.id, id: row.action_id, description: row.action_description || '', pic: row.pic || '', priority: row.priority || 'Medium',
    targetDate: row.target_date || '', status: row.status || 'Open', progress: Number(row.progress || 0), completionDate: row.completion_date || '', remarks: row.remarks || '',
  };
}

function mapDbEvidence(row) {
  return {
    rowId: row.id, id: row.evidence_id, title: row.evidence_title || '', category: row.category || '', evidenceDate: row.evidence_date || '',
    uploadedBy: row.uploaded_by || '', linkedActionUuid: row.action_id || '', description: row.description || '', fileName: row.file_name || '',
    storagePath: row.storage_path || '', fileSize: Number(row.file_size || 0), fileType: row.mime_type || '',
  };
}

function mapDbClosure(row) {
  return {
    rowId: row.id, id: row.closure_id, closureDate: row.closure_date || '', verifiedBy: row.verified_by || '', verificationMethod: row.verification_method || '',
    outcome: row.outcome || '', evidenceReference: row.primary_evidence_id || '', closureSummary: row.closure_summary || '', reopened: Boolean(row.reopened_at),
    reopenDate: row.reopened_at || '', reopenedBy: row.reopened_by || '', reopenReason: row.reopen_reason || '', reopenDueDate: row.reopen_due_date || '', reopenNextAction: row.reopen_next_action || '',
  };
}

function clampProgress(value) { return Math.min(100, Math.max(0, Number(value) || 0)); }
function sanitizeFileName(name) { return String(name || 'evidence').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-140); }

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dayDifference(dateValue) {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T23:59:59`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
}

function getDueState(action) {
  if (action.status === 'Completed') return 'Completed';
  const diff = dayDifference(action.targetDate);
  if (diff === null) return 'No Due Date';
  if (diff < 0) return 'Overdue';
  if (diff <= 14) return 'Due Soon';
  return 'On Track';
}

function getCaseDueState(grievance) {
  if (grievance.status === 'Closed') return { label: 'Closed', className: 'completed' };
  const diff = dayDifference(grievance.dueDate);
  if (diff === null) return { label: 'No Due Date', className: 'no-due-date' };
  if (diff < 0) return { label: 'Overdue', className: 'overdue' };
  if (diff <= 14) return { label: 'Due Soon', className: 'due-soon' };
  return { label: 'On Track', className: 'on-track' };
}
