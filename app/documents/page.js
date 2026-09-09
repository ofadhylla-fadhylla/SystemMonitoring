'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';
import { daysUntil, formatDate, todayISO } from '../../lib/monitoring';

const STANDARDS = ['ISPO', 'ISCC', 'INS', 'EUDR'];
const COMPONENTS = [
  'No Deforestation / Forest Protection',
  'No Peat / Peatland Protection',
  'No Exploitation / Social Justice',
  'Fire Prevention',
  'Legal Compliance',
  'Best Management Practices',
  'Sustainable Sourcing / Traceability',
  'Transparency & Accountability',
  'Business Ethics',
];
const STAGES = ['Planning', 'Assessment', 'Implementation', 'Monitoring', 'Verification', 'Corrective Action', 'Closed'];
const STATUSES = ['Not Started', 'In Progress', 'Monitoring', 'Verified', 'Closed'];

const emptyForm = {
  rowId: '', companyId: '', siteId: '', component: COMPONENTS[0], itemTitle: '', stage: 'Implementation',
  status: 'In Progress', progress: 0, pic: '', targetDate: '', lastUpdateDate: '', relatedStandards: [],
  progressId: '', progressEn: '', remarks: '',
};

export default function NDPEImplementation() {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sites, setSites] = useState([]);
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, lastUpdateDate: todayISO() });
  const [previewItem, setPreviewItem] = useState(null);
  const [reportDate, setReportDate] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('All');
  const [siteFilter, setSiteFilter] = useState('All');
  const [standardFilter, setStandardFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const configError = getSupabaseConfigError();
    if (configError || !supabase) { setError(configError || 'Supabase is not configured.'); setLoading(false); return; }
    setLoading(true); setError('');
    const [nRes, cRes, sRes, gRes] = await Promise.all([
      supabase.from('ndpe_implementation').select('*').order('created_at', { ascending: false }),
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('sites').select('*').order('site_name'),
      supabase.from('grievances').select('id,case_id,company,site,issue_title,opened_date,status').order('opened_date', { ascending: false }),
    ]);
    const anyError = nRes.error || cRes.error || sRes.error || gRes.error;
    if (anyError) setError(anyError.message);
    setItems((nRes.data || []).map(mapRow));
    setCompanies(cRes.data || []);
    setSites(sRes.data || []);
    setGrievances(gRes.data || []);
    setLoading(false);
  }

  const companyMap = useMemo(() => Object.fromEntries(companies.map(c => [c.id, c])), [companies]);
  const siteMap = useMemo(() => Object.fromEntries(sites.map(s => [s.id, s])), [sites]);
  const filteredSites = useMemo(() => sites.filter(s => companyFilter === 'All' || s.company_id === companyFilter), [sites, companyFilter]);
  const formSites = useMemo(() => sites.filter(s => !form.companyId || s.company_id === form.companyId), [sites, form.companyId]);

  const filtered = useMemo(() => items.filter(item => {
    const c = companyMap[item.companyId];
    const s = siteMap[item.siteId];
    const hay = `${item.ndpeId} ${c?.company_code || ''} ${c?.company_name || ''} ${s?.site_name || ''} ${item.component} ${item.itemTitle} ${item.pic}`.toLowerCase();
    return hay.includes(search.toLowerCase()) &&
      (companyFilter === 'All' || item.companyId === companyFilter) &&
      (siteFilter === 'All' || item.siteId === siteFilter) &&
      (standardFilter === 'All' || item.relatedStandards.includes(standardFilter)) &&
      (statusFilter === 'All' || item.status === statusFilter);
  }), [items, companyMap, siteMap, search, companyFilter, siteFilter, standardFilter, statusFilter]);

  const stats = useMemo(() => {
    const open = filtered.filter(i => !['Verified','Closed'].includes(i.status)).length;
    const overdue = filtered.filter(i => !['Verified','Closed'].includes(i.status) && daysUntil(i.targetDate) !== null && daysUntil(i.targetDate) < 0).length;
    const avg = filtered.length ? Math.round(filtered.reduce((s,i)=>s+Number(i.progress||0),0)/filtered.length) : 0;
    const eudr = filtered.filter(i=>i.relatedStandards.includes('EUDR')).length;
    return { total: filtered.length, open, overdue, avg, eudr };
  }, [filtered]);

  function openNew() {
    setForm({ ...emptyForm, lastUpdateDate: todayISO() });
    setShowForm(true);
  }

  function openEdit(item) {
    setForm({ ...item, rowId: item.rowId });
    setShowForm(true);
  }

  function updateForm(field, value) {
    setForm(prev => ({ ...prev, [field]: value, ...(field === 'companyId' ? { siteId: '' } : {}) }));
  }

  function toggleStandard(std) {
    setForm(prev => ({
      ...prev,
      relatedStandards: prev.relatedStandards.includes(std)
        ? prev.relatedStandards.filter(v => v !== std)
        : [...prev.relatedStandards, std],
    }));
  }

  function autoFillResume() {
    const draft = { ...form };
    const c = companyMap[draft.companyId];
    const s = siteMap[draft.siteId];
    const unit = s?.site_name || c?.company_code || c?.company_name || 'the selected unit';
    const targetId = draft.targetDate ? ` Target penyelesaian ${formatDate(draft.targetDate)}.` : '';
    const targetEn = draft.targetDate ? ` Target completion is ${formatDate(draft.targetDate)}.` : '';
    setForm(prev => ({
      ...prev,
      progressId: `Implementasi ${draft.itemTitle || 'program NDPE'} di ${unit} berada pada tahap ${draft.stage} dengan progres ${Number(draft.progress || 0)}%. Status saat ini ${draft.status}.${targetId}`,
      progressEn: `Implementation of ${draft.itemTitle || 'the NDPE program'} at ${unit} is currently at the ${draft.stage} stage with ${Number(draft.progress || 0)}% progress. Current status is ${draft.status}.${targetEn}`,
    }));
  }

  async function saveItem(e) {
    e.preventDefault(); if (!supabase) return;
    setSaving(true); setError('');
    const payload = {
      company_id: form.companyId || null,
      site_id: form.siteId || null,
      component: form.component,
      item_title: form.itemTitle.trim(),
      stage: form.stage,
      status: form.status,
      progress: clamp(form.progress),
      pic: form.pic.trim() || null,
      target_date: form.targetDate || null,
      last_update_date: form.lastUpdateDate || todayISO(),
      related_standards: form.relatedStandards,
      progress_id: form.progressId.trim() || null,
      progress_en: form.progressEn.trim() || null,
      remarks: form.remarks.trim() || null,
    };
    let result;
    if (form.rowId) result = await supabase.from('ndpe_implementation').update(payload).eq('id', form.rowId);
    else result = await supabase.from('ndpe_implementation').insert(payload);
    if (result.error) setError(result.error.message);
    else { setShowForm(false); await loadAll(); }
    setSaving(false);
  }

  async function deleteItem(item) {
    if (!supabase || !confirm(`Delete ${item.ndpeId} — ${item.itemTitle}?`)) return;
    const { error: delError } = await supabase.from('ndpe_implementation').delete().eq('id', item.rowId);
    if (delError) setError(delError.message); else await loadAll();
  }

  function getResume(item) {
    const c = companyMap[item.companyId]; const s = siteMap[item.siteId];
    const unit = s?.site_name || c?.company_code || c?.company_name || 'selected unit';
    const id = item.progressId || `Implementasi ${item.itemTitle} di ${unit} berada pada tahap ${item.stage} dengan progres ${item.progress}%. Status saat ini ${item.status}.${item.targetDate ? ` Target penyelesaian ${formatDate(item.targetDate)}.` : ''}`;
    const en = item.progressEn || `Implementation of ${item.itemTitle} at ${unit} is currently at the ${item.stage} stage with ${item.progress}% progress. Current status is ${item.status}.${item.targetDate ? ` Target completion is ${formatDate(item.targetDate)}.` : ''}`;
    return { id, en, unit };
  }

  async function copyResume(item) {
    const r = getResume(item);
    await navigator.clipboard.writeText(`Bahasa Indonesia:\n${r.id}\n\nEnglish:\n${r.en}`);
    alert('Bilingual resume copied.');
  }

  async function downloadWeeklyReport() {
    if (!filtered.length) { alert('No NDPE records in the current filter.'); return; }
    const {
      Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun,
      WidthType, AlignmentType, ShadingType, BorderStyle,
    } = await import('docx');

    const headerFill = 'D9E7F5';
    const border = { style: BorderStyle.SINGLE, size: 1, color: '7F8C8D' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const children = [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'WEEKLY PROGRESS REPORT – NDPE IMPLEMENTATION', bold: true, size: 28 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${formatDate(reportDate)} | Laporan Progress Mingguan – NDPE Implementation`, bold: true, size: 21 })] }),
      new Paragraph({ text: '' }),
    ];

    let sectionNo = 1;
    for (const std of STANDARDS) {
      const rows = filtered.filter(i => i.relatedStandards.includes(std));
      if (!rows.length) continue;
      children.push(new Paragraph({ children: [new TextRun({ text: `${sectionNo}. ${std}`, bold: true, size: 24 })] }));
      children.push(makeProgressTable(rows, std, companyMap, siteMap, { Table, TableCell, TableRow, Paragraph, TextRun, WidthType, ShadingType, borders, headerFill }));
      children.push(new Paragraph({ text: '' }));
      sectionNo++;
    }

    // Mirrors the weekly System & Monitoring report by adding a grievance section for the report week.
    const end = new Date(`${reportDate}T00:00:00`);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    const newGrievances = grievances.filter(g => {
      if (!g.opened_date) return false;
      const d = new Date(`${g.opened_date}T00:00:00`);
      return d >= start && d <= end;
    });
    children.push(new Paragraph({ children: [new TextRun({ text: `${sectionNo}. Grievance`, bold: true, size: 24 })] }));
    children.push(makeGrievanceTable(newGrievances, { Table, TableCell, TableRow, Paragraph, TextRun, WidthType, ShadingType, borders, headerFill }));
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'KPN Plantations – Sustainability HO | System & Monitoring', size: 16, color: '5B6770' })] }));

    const doc = new Document({ sections: [{ properties: {}, children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Weekly_Progress_NDPE_${reportDate}.docx`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return <div className="page-wrap">
    <div className="page-heading">
      <div><h1>NDPE Implementation</h1><p>Track No Deforestation, No Peat and No Exploitation implementation and map each item to ISPO, ISCC, INS and EUDR.</p></div>
      <div className="detail-actions"><button className="secondary-btn" onClick={downloadWeeklyReport}>Generate Weekly Report</button><button className="primary-btn" onClick={openNew}>+ Add NDPE Item</button></div>
    </div>
    {error ? <div className="sync-error"><strong>Supabase error</strong><span>{error}</span></div> : <div className="sync-success">● NDPE Implementation is connected to Supabase</div>}

    <section className="panel ndpe-report-toolbar">
      <div><strong>Weekly report date</strong><span>The Word report follows the bilingual table structure used in the System & Monitoring weekly progress report.</span></div>
      <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} />
    </section>

    <section className="kpi-grid ndpe-kpis">
      <KPI label="NDPE Items" value={loading?'…':stats.total}/><KPI label="Open / Active" value={loading?'…':stats.open}/><KPI label="Overdue" value={loading?'…':stats.overdue}/><KPI label="Average Progress" value={loading?'…':`${stats.avg}%`}/><KPI label="EUDR Related" value={loading?'…':stats.eudr}/>
    </section>

    <section className="panel ndpe-filter-panel">
      <div className="ndpe-filters">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search NDPE ID, implementation, PIC..." />
        <select value={companyFilter} onChange={e=>{setCompanyFilter(e.target.value);setSiteFilter('All')}}><option value="All">All Companies</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select>
        <select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}><option value="All">All Sites</option>{filteredSites.map(s=><option key={s.id} value={s.id}>{s.site_name}</option>)}</select>
        <select value={standardFilter} onChange={e=>setStandardFilter(e.target.value)}><option value="All">All Related Standards</option>{STANDARDS.map(v=><option key={v}>{v}</option>)}</select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="All">All Statuses</option>{STATUSES.map(v=><option key={v}>{v}</option>)}</select>
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>NDPE Implementation Register</h2><p>{loading?'Loading…':`${filtered.length} record(s)`}</p></div></div>
      <div className="table-wrap"><table className="ndpe-table"><thead><tr><th>ID</th><th>Company / Site</th><th>NDPE Implementation</th><th>Related To</th><th>Stage / Status</th><th>Progress</th><th>PIC / Target</th><th>Resume</th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan="9" className="empty-cell">Loading NDPE data…</td></tr> : filtered.length ? filtered.map(item => {
          const c=companyMap[item.companyId]; const s=siteMap[item.siteId]; const overdue=!['Verified','Closed'].includes(item.status)&&daysUntil(item.targetDate)!==null&&daysUntil(item.targetDate)<0;
          return <tr key={item.rowId}>
            <td><strong>{item.ndpeId}</strong><div className="muted">{formatDate(item.lastUpdateDate)}</div></td>
            <td>{c?.company_code || '-'}<div className="muted">{s?.site_name || 'Company level'}</div></td>
            <td><strong>{item.itemTitle}</strong><div className="muted">{item.component}</div></td>
            <td><div className="standard-badges">{item.relatedStandards.length?item.relatedStandards.map(std=><span key={std} className={`standard-chip ${std.toLowerCase()}`}>{std}</span>):<span className="muted">Not mapped</span>}</div></td>
            <td>{item.stage}<div className="muted"><span className="status-pill">{item.status}</span></div></td>
            <td><div className="progress"><div style={{width:`${item.progress}%`}}></div></div><div className="muted">{item.progress}%</div></td>
            <td>{item.pic || '-'}<div className={overdue?'danger-text':'muted'}>{item.targetDate?formatDate(item.targetDate):'No target'}{overdue?' · Overdue':''}</div></td>
            <td><div className="table-actions"><button className="view-btn" onClick={()=>setPreviewItem(item)}>Preview</button><button className="view-btn" onClick={()=>copyResume(item)}>Copy</button></div></td>
            <td><div className="table-actions"><button className="view-btn" onClick={()=>openEdit(item)}>Edit</button><button className="danger-btn compact" onClick={()=>deleteItem(item)}>Delete</button></div></td>
          </tr>
        }) : <tr><td colSpan="9" className="empty-cell">No NDPE implementation records yet.</td></tr>}
      </tbody></table></div>
    </section>

    {showForm && <div className="modal-backdrop"><form className="modal-card ndpe-modal" onSubmit={saveItem}>
      <div className="modal-head"><div><h2>{form.rowId?'Edit NDPE Implementation':'Add NDPE Implementation'}</h2><p>One record can be related to one or more certification / due diligence frameworks.</p></div><button type="button" className="icon-btn" onClick={()=>setShowForm(false)}>×</button></div>
      <div className="form-grid">
        <label className="form-field"><span>Company *</span><select required value={form.companyId} onChange={e=>updateForm('companyId',e.target.value)}><option value="">Select company...</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></label>
        <label className="form-field"><span>Site / Unit</span><select value={form.siteId} onChange={e=>updateForm('siteId',e.target.value)}><option value="">Company level</option>{formSites.map(s=><option key={s.id} value={s.id}>{s.site_name}</option>)}</select></label>
        <label className="form-field"><span>NDPE Component *</span><select value={form.component} onChange={e=>updateForm('component',e.target.value)}>{COMPONENTS.map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="form-field"><span>Stage</span><select value={form.stage} onChange={e=>updateForm('stage',e.target.value)}>{STAGES.map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="form-field wide"><span>Implementation Item *</span><input required value={form.itemTitle} onChange={e=>updateForm('itemTitle',e.target.value)} placeholder="e.g. HCV-HCS monitoring, peat water table, supplier NDPE engagement..." /></label>
        <label className="form-field"><span>Status</span><select value={form.status} onChange={e=>updateForm('status',e.target.value)}>{STATUSES.map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="form-field"><span>Progress %</span><input type="number" min="0" max="100" value={form.progress} onChange={e=>updateForm('progress',e.target.value)} /></label>
        <label className="form-field"><span>PIC</span><input value={form.pic} onChange={e=>updateForm('pic',e.target.value)} /></label>
        <label className="form-field"><span>Target Date</span><input type="date" value={form.targetDate} onChange={e=>updateForm('targetDate',e.target.value)} /></label>
        <label className="form-field"><span>Last Update Date</span><input type="date" value={form.lastUpdateDate} onChange={e=>updateForm('lastUpdateDate',e.target.value)} /></label>
        <div className="form-field wide"><span>Related to</span><div className="standard-checkboxes">{STANDARDS.map(std=><label key={std}><input type="checkbox" checked={form.relatedStandards.includes(std)} onChange={()=>toggleStandard(std)} /><span>{std}</span></label>)}</div></div>
        <div className="form-field wide resume-helper"><div><span>Weekly Report Resume</span><small>Use Auto Generate as a starting point, then edit the bilingual wording if needed.</small></div><button type="button" className="secondary-btn" onClick={autoFillResume}>Auto Generate Bilingual Resume</button></div>
        <label className="form-field wide"><span>Progress – Bahasa Indonesia</span><textarea value={form.progressId} onChange={e=>updateForm('progressId',e.target.value)} placeholder="Teks ini akan masuk ke laporan mingguan." /></label>
        <label className="form-field wide"><span>Progress – English</span><textarea value={form.progressEn} onChange={e=>updateForm('progressEn',e.target.value)} placeholder="This text will be used in the weekly report." /></label>
        <label className="form-field wide"><span>Remarks</span><textarea value={form.remarks} onChange={e=>updateForm('remarks',e.target.value)} /></label>
      </div>
      <div className="form-actions"><div></div><div className="form-action-right"><button type="button" className="secondary-btn" onClick={()=>setShowForm(false)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving?'Saving…':'Save NDPE Item'}</button></div></div>
    </form></div>}

    {previewItem && <div className="modal-backdrop"><div className="modal-card resume-preview-modal">
      <div className="modal-head"><div><h2>Generated Resume — {previewItem.ndpeId}</h2><p>Ready to be used in the bilingual weekly progress report.</p></div><button className="icon-btn" onClick={()=>setPreviewItem(null)}>×</button></div>
      <ResumePreview item={previewItem} resume={getResume(previewItem)} company={companyMap[previewItem.companyId]} site={siteMap[previewItem.siteId]} />
      <div className="form-actions"><div></div><div className="form-action-right"><button className="secondary-btn" onClick={()=>copyResume(previewItem)}>Copy Bilingual Resume</button><button className="primary-btn" onClick={()=>setPreviewItem(null)}>Close</button></div></div>
    </div></div>}
  </div>;
}

function KPI({label,value}) { return <div className="kpi-card"><span>{label}</span><strong>{value}</strong></div>; }
function clamp(v){const n=Number(v||0);return Math.max(0,Math.min(100,Number.isFinite(n)?n:0));}
function mapRow(r){return {rowId:r.id,ndpeId:r.ndpe_id,companyId:r.company_id||'',siteId:r.site_id||'',component:r.component||'',itemTitle:r.item_title||'',stage:r.stage||'Implementation',status:r.status||'In Progress',progress:Number(r.progress||0),pic:r.pic||'',targetDate:r.target_date||'',lastUpdateDate:r.last_update_date||'',relatedStandards:Array.isArray(r.related_standards)?r.related_standards:[],progressId:r.progress_id||'',progressEn:r.progress_en||'',remarks:r.remarks||''};}

function ResumePreview({item,resume,company,site}) { return <div className="resume-preview">
  <div className="resume-meta"><div><span>Unit</span><strong>{site?.site_name || company?.company_code || '-'}</strong></div><div><span>Stage</span><strong>{item.stage}</strong></div><div><span>Related</span><strong>{item.relatedStandards.join(' | ') || '-'}</strong></div></div>
  <div className="resume-language"><span>Progress – Bahasa Indonesia</span><p>{resume.id}</p></div>
  <div className="resume-language"><span>Progress – English</span><p>{resume.en}</p></div>
</div>; }

function makeProgressTable(rows, standard, companyMap, siteMap, D) {
  const { Table, TableCell, TableRow, Paragraph, TextRun, WidthType, ShadingType, borders, headerFill } = D;
  const header = new TableRow({ children: ['No.','Unit','Stage','Progress – Bahasa Indonesia','Progress – English'].map(text => new TableCell({ borders, shading:{type:ShadingType.CLEAR,fill:headerFill}, children:[new Paragraph({children:[new TextRun({text,bold:true,size:16})]})] })) });
  const body = rows.map((item,idx)=>{
    const c=companyMap[item.companyId]; const s=siteMap[item.siteId]; const unit=s?.site_name||c?.company_code||'-';
    const id=item.progressId||`Implementasi ${item.itemTitle} di ${unit} berada pada tahap ${item.stage} dengan progres ${item.progress}%. Status saat ini ${item.status}.`;
    const en=item.progressEn||`Implementation of ${item.itemTitle} at ${unit} is currently at the ${item.stage} stage with ${item.progress}% progress. Current status is ${item.status}.`;
    return new TableRow({children:[String(idx+1),unit,item.stage,id,en].map(text=>new TableCell({borders,children:[new Paragraph({children:[new TextRun({text:String(text),size:16})]})]}))});
  });
  return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[header,...body]});
}

function makeGrievanceTable(rows,D){
  const {Table,TableCell,TableRow,Paragraph,TextRun,WidthType,ShadingType,borders,headerFill}=D;
  const header=new TableRow({children:['No.','Uraian – Bahasa Indonesia','Description – English'].map(text=>new TableCell({borders,shading:{type:ShadingType.CLEAR,fill:headerFill},children:[new Paragraph({children:[new TextRun({text,bold:true,size:16})]})]}))});
  const data=rows.length?rows.map((g,idx)=>new TableRow({children:[String(idx+1),`${g.case_id} — ${g.company}${g.site?` / ${g.site}`:''}: ${g.issue_title}. Status: ${g.status}.`,`${g.case_id} — ${g.company}${g.site?` / ${g.site}`:''}: ${g.issue_title}. Current status: ${g.status}.`].map(text=>new TableCell({borders,children:[new Paragraph({children:[new TextRun({text:String(text),size:16})]})]}))})): [new TableRow({children:[new TableCell({borders,children:[new Paragraph('1')]}),new TableCell({borders,children:[new Paragraph('Tidak terdapat grievance baru pada periode laporan.')]}),new TableCell({borders,children:[new Paragraph('There are no new grievances during the reporting period.')]} )]})];
  return new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[header,...data]});
}
