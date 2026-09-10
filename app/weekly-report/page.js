'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../lib/supabaseClient';
import { todayISO } from '../../lib/monitoring';

const PROGRESS_SECTIONS = ['ISPO', 'ISCC', 'INS'];
const ALL_SECTIONS = ['ISPO', 'ISCC', 'INS', 'Grievance', 'Lain-lain'];

const emptyEntry = {
  id: '', section: 'ISPO', unit: '', stage: '', progressId: '', progressEn: '', sortOrder: 1,
};
const emptyPlan = { id: '', pt: '', stage1: '', stage2: '', explanation: '', sortOrder: 1 };

export default function WeeklyReport() {
  const [reportDate, setReportDate] = useState(todayISO());
  const [entries, setEntries] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [error, setError] = useState('');
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [showEntry, setShowEntry] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => { loadReport(); }, [reportDate]);

  async function loadReport() {
    const configError = getSupabaseConfigError();
    if (configError || !supabase) { setError(configError || 'Supabase is not configured.'); setLoading(false); return; }
    setLoading(true); setError('');
    const [eRes, pRes] = await Promise.all([
      supabase.from('weekly_report_entries').select('*').eq('report_date', reportDate).order('section').order('sort_order').order('created_at'),
      supabase.from('weekly_ispo_plans').select('*').eq('report_date', reportDate).order('sort_order').order('created_at'),
    ]);
    const anyError = eRes.error || pRes.error;
    if (anyError) setError(anyError.message);
    setEntries(eRes.data || []);
    setPlans(pRes.data || []);
    setLoading(false);
  }

  const grouped = useMemo(() => Object.fromEntries(ALL_SECTIONS.map(s => [s, entries.filter(e => e.section === s)])), [entries]);

  function openNewEntry(section) {
    const current = grouped[section] || [];
    setEntryForm({ ...emptyEntry, section, sortOrder: current.length + 1 });
    setShowEntry(true);
  }

  function openEditEntry(row) {
    setEntryForm({ id: row.id, section: row.section, unit: row.unit || '', stage: row.stage || '', progressId: row.progress_id || '', progressEn: row.progress_en || '', sortOrder: row.sort_order || 1 });
    setShowEntry(true);
  }

  async function saveEntry(e) {
    e.preventDefault(); if (!supabase) return;
    setSaving(true); setError('');
    const payload = {
      report_date: reportDate,
      section: entryForm.section,
      unit: PROGRESS_SECTIONS.includes(entryForm.section) ? (entryForm.unit.trim() || null) : null,
      stage: PROGRESS_SECTIONS.includes(entryForm.section) ? (entryForm.stage.trim() || null) : null,
      progress_id: entryForm.progressId.trim(),
      progress_en: entryForm.progressEn.trim(),
      sort_order: Number(entryForm.sortOrder || 1),
    };
    const result = entryForm.id
      ? await supabase.from('weekly_report_entries').update(payload).eq('id', entryForm.id)
      : await supabase.from('weekly_report_entries').insert(payload);
    if (result.error) setError(result.error.message); else { setShowEntry(false); setEntryForm(emptyEntry); await loadReport(); }
    setSaving(false);
  }

  async function deleteEntry(row) {
    if (!supabase || !confirm(`Delete this ${row.section} report row?`)) return;
    const { error: delError } = await supabase.from('weekly_report_entries').delete().eq('id', row.id);
    if (delError) setError(delError.message); else await loadReport();
  }

  function openNewPlan() {
    setPlanForm({ ...emptyPlan, sortOrder: plans.length + 1 });
    setShowPlan(true);
  }

  function openEditPlan(row) {
    setPlanForm({ id: row.id, pt: row.pt || '', stage1: row.stage_1 || '', stage2: row.stage_2 || '', explanation: row.explanation || '', sortOrder: row.sort_order || 1 });
    setShowPlan(true);
  }

  async function savePlan(e) {
    e.preventDefault(); if (!supabase) return;
    setSaving(true); setError('');
    const payload = {
      report_date: reportDate,
      pt: planForm.pt.trim(),
      stage_1: planForm.stage1.trim() || null,
      stage_2: planForm.stage2.trim() || null,
      explanation: planForm.explanation.trim() || null,
      sort_order: Number(planForm.sortOrder || 1),
    };
    const result = planForm.id
      ? await supabase.from('weekly_ispo_plans').update(payload).eq('id', planForm.id)
      : await supabase.from('weekly_ispo_plans').insert(payload);
    if (result.error) setError(result.error.message); else { setShowPlan(false); setPlanForm(emptyPlan); await loadReport(); }
    setSaving(false);
  }

  async function deletePlan(row) {
    if (!supabase || !confirm(`Delete ISPO plan row for ${row.pt}?`)) return;
    const { error: delError } = await supabase.from('weekly_ispo_plans').delete().eq('id', row.id);
    if (delError) setError(delError.message); else await loadReport();
  }

  async function copyPreviousReport() {
    if (!supabase) return;
    const { data: dates, error: dateError } = await supabase
      .from('weekly_report_entries')
      .select('report_date')
      .lt('report_date', reportDate)
      .order('report_date', { ascending: false })
      .limit(1);
    if (dateError) { setError(dateError.message); return; }
    const previousDate = dates?.[0]?.report_date;
    if (!previousDate) { alert('No earlier weekly report found.'); return; }
    if ((entries.length || plans.length) && !confirm(`This report already has data. Copy rows from ${formatLongDate(previousDate)} anyway?`)) return;
    const [eRes, pRes] = await Promise.all([
      supabase.from('weekly_report_entries').select('*').eq('report_date', previousDate),
      supabase.from('weekly_ispo_plans').select('*').eq('report_date', previousDate),
    ]);
    if (eRes.error || pRes.error) { setError((eRes.error || pRes.error).message); return; }
    const newEntries = (eRes.data || []).map(({ id, entry_id, created_at, updated_at, ...r }) => ({ ...r, report_date: reportDate }));
    const newPlans = (pRes.data || []).map(({ id, plan_id, created_at, updated_at, ...r }) => ({ ...r, report_date: reportDate }));
    const results = await Promise.all([
      newEntries.length ? supabase.from('weekly_report_entries').insert(newEntries) : Promise.resolve({ error: null }),
      newPlans.length ? supabase.from('weekly_ispo_plans').insert(newPlans) : Promise.resolve({ error: null }),
    ]);
    const copyError = results.find(r => r.error)?.error;
    if (copyError) setError(copyError.message); else await loadReport();
  }

  async function syncMonitoringData() {
    if (!supabase) return;
    setSyncing(true); setError(''); setSyncMessage('');
    try {
      const periodStart = addDays(reportDate, -6);
      const recentStart = addDays(reportDate, -13);
      const futureAuditEnd = addDays(reportDate, 120);
      const futurePlanEnd = addDays(reportDate, 370);

      const [companiesRes, sitesRes, certRes, auditRes, grievanceRes] = await Promise.all([
        supabase.from('companies').select('*'),
        supabase.from('sites').select('*'),
        supabase.from('certifications').select('*'),
        supabase.from('audit_events').select('*'),
        supabase.from('grievances').select('*'),
      ]);
      const sourceError = companiesRes.error || sitesRes.error || certRes.error || auditRes.error || grievanceRes.error;
      if (sourceError) throw sourceError;

      const companies = companiesRes.data || [];
      const sites = sitesRes.data || [];
      const certifications = certRes.data || [];
      const audits = auditRes.data || [];
      const grievances = grievanceRes.data || [];
      const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));
      const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
      const certMap = Object.fromEntries(certifications.map(c => [c.id, c]));

      const generated = [];
      const reportAudits = audits.filter(a => {
        if (a.status === 'Cancelled' || !a.start_date) return false;
        const end = a.end_date || a.start_date;
        return end >= recentStart && a.start_date <= futureAuditEnd;
      });

      const auditGroups = new Map();
      for (const audit of reportAudits) {
        const cert = audit.certification_id ? certMap[audit.certification_id] : null;
        const section = normalizeStandard(cert?.standard) || inferStandard(audit.title);
        if (!PROGRESS_SECTIONS.includes(section)) continue;
        const unit = unitLabel(audit, companyMap, siteMap);
        const key = [section, audit.audit_type || 'Audit', audit.start_date, audit.end_date || audit.start_date, audit.status || '', audit.auditor || ''].join('|');
        if (!auditGroups.has(key)) auditGroups.set(key, { section, audits: [], units: [] });
        const group = auditGroups.get(key);
        group.audits.push(audit);
        if (unit && !group.units.includes(unit)) group.units.push(unit);
      }

      const sectionCounter = { ISPO: 1, ISCC: 1, INS: 1, Grievance: 1 };
      for (const group of auditGroups.values()) {
        const a = group.audits[0];
        const rangeId = formatDateRangeID(a.start_date, a.end_date || a.start_date);
        const rangeEn = formatDateRangeEN(a.start_date, a.end_date || a.start_date);
        const stage = a.audit_type || 'Audit';
        const statusId = auditStatusID(a.status);
        const statusEn = auditStatusEN(a.status);
        generated.push({
          report_date: reportDate,
          section: group.section,
          unit: group.units.join(', '),
          stage,
          progress_id: `${stage} ${statusId} pada ${rangeId}.${a.auditor ? ` Auditor: ${a.auditor}.` : ''}${a.notes ? ` ${cleanSentence(a.notes)}` : ''}`,
          progress_en: `${stage} ${statusEn} on ${rangeEn}.${a.auditor ? ` Auditor: ${a.auditor}.` : ''}${a.notes ? ` ${cleanSentence(a.notes)}` : ''}`,
          sort_order: sectionCounter[group.section]++,
          source_module: 'audit_events',
          source_reference: group.audits.map(x => x.id).join(','),
        });
      }

      const recentCerts = certifications.filter(c => {
        const basis = c.issue_date || c.valid_from;
        const section = normalizeStandard(c.standard);
        return PROGRESS_SECTIONS.includes(section) && c.status === 'Certified' && basis && basis >= recentStart && basis <= reportDate;
      });
      const certGroups = new Map();
      for (const cert of recentCerts) {
        const section = normalizeStandard(cert.standard);
        const unit = certUnitLabel(cert, companyMap, siteMap);
        const latestAudit = audits
          .filter(a => a.certification_id === cert.id && a.start_date && a.start_date <= reportDate)
          .sort((a,b) => String(b.start_date).localeCompare(String(a.start_date)))[0];
        const stage = latestAudit?.audit_type || 'Certification';
        const key = [section, stage, cert.valid_from || '', cert.valid_until || '', cert.product || '', cert.certification_body || ''].join('|');
        if (!certGroups.has(key)) certGroups.set(key, { section, stage, certs: [], units: [] });
        const group = certGroups.get(key); group.certs.push(cert); if (unit && !group.units.includes(unit)) group.units.push(unit);
      }
      for (const group of certGroups.values()) {
        const c = group.certs[0];
        const validityId = c.valid_from && c.valid_until ? `${formatDateID(c.valid_from)} – ${formatDateID(c.valid_until)}` : (c.valid_until ? `sampai ${formatDateID(c.valid_until)}` : '-');
        const validityEn = c.valid_from && c.valid_until ? `${formatDateEN(c.valid_from)} to ${formatDateEN(c.valid_until)}` : (c.valid_until ? `until ${formatDateEN(c.valid_until)}` : '-');
        const scopeId = c.product ? ` Cakupan material: ${trimEnd(c.product)}.` : '';
        const scopeEn = c.product ? ` Material scope: ${trimEnd(c.product)}.` : '';
        generated.push({
          report_date: reportDate,
          section: group.section,
          unit: group.units.join(', '),
          stage: group.stage,
          progress_id: `Sertifikat terbaru telah terbit dan berlaku ${validityId}.${scopeId}`,
          progress_en: `The latest certificate has been issued and is valid from ${validityEn}.${scopeEn}`,
          sort_order: sectionCounter[group.section]++,
          source_module: 'certifications',
          source_reference: group.certs.map(x => x.id).join(','),
        });
      }

      const newGrievances = grievances.filter(g => {
        const basis = g.source_submitted_date || g.source_received_date || g.opened_date;
        return basis && basis >= periodStart && basis <= reportDate;
      });
      for (const g of newGrievances) {
        const company = companyMap[g.company_id]?.company_code || g.company || '-';
        generated.push({
          report_date: reportDate,
          section: 'Grievance',
          unit: null,
          stage: null,
          progress_id: `Grievance baru ${g.case_id || ''} terkait ${g.issue_title || g.category || 'isu stakeholder'} di ${company}. Dilaporkan oleh ${g.complaint_source || 'stakeholder'}. Status saat ini ${g.status || 'Open'} dengan progres ${Number(g.progress || 0)}%.`,
          progress_en: `A new grievance ${g.case_id || ''} regarding ${g.issue_title || g.category || 'a stakeholder issue'} at ${company} was registered by ${g.complaint_source || 'a stakeholder'}. Current status is ${g.status || 'Open'} with ${Number(g.progress || 0)}% progress.`,
          sort_order: sectionCounter.Grievance++,
          source_module: 'grievances',
          source_reference: g.id,
        });
      }

      const { error: deleteAutoError } = await supabase
        .from('weekly_report_entries')
        .delete()
        .eq('report_date', reportDate)
        .in('source_module', ['audit_events', 'certifications', 'grievances']);
      if (deleteAutoError) throw deleteAutoError;
      if (generated.length) {
        const { error: insertAutoError } = await supabase.from('weekly_report_entries').insert(generated);
        if (insertAutoError) throw insertAutoError;
      }

      const planAudits = audits.filter(a => {
        const cert = a.certification_id ? certMap[a.certification_id] : null;
        const section = normalizeStandard(cert?.standard) || inferStandard(a.title);
        const type = String(a.audit_type || '').toLowerCase();
        return section === 'ISPO' && a.status !== 'Cancelled' && a.start_date >= reportDate && a.start_date <= futurePlanEnd && (type.includes('stage i') || type.includes('stage 1') || type.includes('stage ii') || type.includes('stage 2'));
      });
      const planMap = new Map();
      for (const a of planAudits) {
        const company = companyMap[a.company_id];
        const code = company?.company_code || unitLabel(a, companyMap, siteMap) || 'PT';
        if (!planMap.has(code)) planMap.set(code, { pt: code, stage1: '', stage2: '', refs: [] });
        const p = planMap.get(code); p.refs.push(a.id);
        const type = String(a.audit_type || '').toLowerCase();
        if (type.includes('stage ii') || type.includes('stage 2')) p.stage2 = weekOfMonthLabel(a.start_date);
        else p.stage1 = weekOfMonthLabel(a.start_date);
      }
      const { error: delPlanError } = await supabase
        .from('weekly_ispo_plans').delete().eq('report_date', reportDate).eq('source_module', 'audit_events');
      if (delPlanError) throw delPlanError;
      const autoPlans = [...planMap.values()].map((p, i) => ({
        report_date: reportDate, pt: p.pt, stage_1: p.stage1 || null, stage_2: p.stage2 || null,
        explanation: 'Audit schedule is synchronized from Audit Monitoring.', sort_order: i + 1,
        source_module: 'audit_events', source_reference: p.refs.join(','),
      }));
      if (autoPlans.length) {
        const { error: planInsertError } = await supabase.from('weekly_ispo_plans').insert(autoPlans);
        if (planInsertError) throw planInsertError;
      }

      await loadReport();
      const sourceCounts = generated.reduce((m,r)=>{m[r.source_module]=(m[r.source_module]||0)+1;return m;},{});
      setSyncMessage(`Live data synchronized: ${sourceCounts.audit_events||0} audit row(s), ${sourceCounts.certifications||0} certification row(s), ${sourceCounts.grievances||0} grievance row(s), and ${autoPlans.length} ISPO plan row(s). Manual rows are preserved.`);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function generateWord() {
    const {
      Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun,
      WidthType, AlignmentType, ShadingType, BorderStyle, PageOrientation, Footer,
    } = await import('docx');

    const border = { style: BorderStyle.SINGLE, size: 1, color: '65737B' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const headerFill = 'B8CCE4';
    const year = new Date(`${reportDate}T00:00:00`).getFullYear();
    const children = [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'WEEKLY PROGRESS REPORT – SYSTEM & MONITORING', bold: true, size: 28 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 220 }, children: [new TextRun({ text: `${formatLongDate(reportDate)} | Laporan Progress Mingguan – System & Monitoring`, bold: true, size: 20 })] }),
    ];

    let no = 1;
    for (const section of PROGRESS_SECTIONS) {
      children.push(sectionTitle(`${no}. ${section}`, { Paragraph, TextRun }));
      children.push(progressTable(grouped[section] || [], { Table, TableCell, TableRow, Paragraph, TextRun, WidthType, ShadingType, borders, headerFill }));
      children.push(new Paragraph({ text: '' }));
      if (section === 'ISPO' && plans.length) {
        children.push(new Paragraph({ spacing: { before: 40, after: 90 }, children: [new TextRun({ text: `ISPO Certification plan ${year} – ${year + 1}`, bold: true, size: 20 })] }));
        children.push(ispoPlanTable(plans, { Table, TableCell, TableRow, Paragraph, TextRun, WidthType, ShadingType, borders, headerFill }));
        children.push(new Paragraph({ text: '' }));
      }
      no++;
    }

    children.push(sectionTitle(`${no}. Grievance`, { Paragraph, TextRun }));
    children.push(simpleBilingualTable(grouped['Grievance'] || [], 'Grievance', { Table, TableCell, TableRow, Paragraph, TextRun, WidthType, ShadingType, borders, headerFill }));
    children.push(new Paragraph({ text: '' }));
    no++;
    children.push(sectionTitle(`${no}. Lain-lain`, { Paragraph, TextRun }));
    children.push(simpleBilingualTable(grouped['Lain-lain'] || [], 'Lain-lain', { Table, TableCell, TableRow, Paragraph, TextRun, WidthType, ShadingType, borders, headerFill }));
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'KPN Plantations – Sustainability HO | System & Monitoring', size: 15, color: '59666D' })] }));

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 16 }, paragraph: { spacing: { after: 40 } } } } },
      sections: [{
        properties: { page: { size: { orientation: PageOrientation.PORTRAIT }, margin: { top: 700, right: 600, bottom: 650, left: 600 } } },
        children,
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'KPN Plantations – Sustainability HO | System & Monitoring', size: 14, font: 'Arial', color: '59666D' })] })] }) },
      }],
    });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Progress_Weekly_System_Monitoring_Bilingual_${fileDate(reportDate)}.docx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return <div className="page-wrap">
    <div className="page-heading weekly-heading">
      <div><h1>Weekly Progress Report</h1><p>Build the bilingual report from real Certification, Audit and Grievance data already stored in Supabase.</p></div>
      <div className="detail-actions"><button className="secondary-btn" onClick={syncMonitoringData} disabled={syncing}>{syncing ? 'Building Draft…' : 'Build Draft from Live Data'}</button><button className="secondary-btn" onClick={copyPreviousReport}>Copy Previous Week</button><button className="primary-btn" onClick={generateWord}>Generate Word Report</button></div>
    </div>

    {error ? <div className="sync-error"><strong>Supabase error</strong><span>{error}</span></div> : <div className="sync-success">● Weekly Report is separate from NDPE Implementation</div>}

    <section className="panel weekly-report-date">
      <div><strong>Report Date</strong><span>The report is saved by weekly reporting date.</span></div>
      <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
    </section>

    <section className="panel weekly-auto-panel">
      <div>
        <strong>Live Monitoring Source</strong>
        <span>Build Draft reads the real Audit & Certification registers, plus grievances received/submitted during the reporting week. Manual wording and Lain-lain remain editable.</span>
      </div>
      <div className="weekly-auto-chips"><span>REAL · Audit</span><span>REAL · Certification</span><span>REAL · Grievance</span></div>
    </section>
    {syncMessage ? <div className="sync-success">● {syncMessage}</div> : null}

    <section className="panel weekly-paper">
      <div className="weekly-paper-title">WEEKLY PROGRESS REPORT – SYSTEM & MONITORING</div>
      <div className="weekly-paper-date">{formatLongDate(reportDate)} | Laporan Progress Mingguan – System & Monitoring</div>

      {PROGRESS_SECTIONS.map((section, index) => <div className="weekly-section" key={section}>
        <div className="weekly-section-head"><h2>{index + 1}. {section}</h2><button className="view-btn" onClick={() => openNewEntry(section)}>+ Add Row</button></div>
        <ProgressPreview rows={grouped[section] || []} onEdit={openEditEntry} onDelete={deleteEntry} loading={loading} />
        {section === 'ISPO' ? <div className="weekly-plan-block">
          <div className="weekly-section-head"><h3>ISPO Certification plan {new Date(`${reportDate}T00:00:00`).getFullYear()} – {new Date(`${reportDate}T00:00:00`).getFullYear() + 1}</h3><button className="view-btn" onClick={openNewPlan}>+ Add Plan</button></div>
          <PlanPreview rows={plans} onEdit={openEditPlan} onDelete={deletePlan} loading={loading} />
        </div> : null}
      </div>)}

      <div className="weekly-section">
        <div className="weekly-section-head"><h2>4. Grievance</h2><button className="view-btn" onClick={() => openNewEntry('Grievance')}>+ Add Row</button></div>
        <BilingualPreview rows={grouped['Grievance'] || []} section="Grievance" onEdit={openEditEntry} onDelete={deleteEntry} loading={loading} />
      </div>

      <div className="weekly-section">
        <div className="weekly-section-head"><h2>5. Lain-lain</h2><button className="view-btn" onClick={() => openNewEntry('Lain-lain')}>+ Add Row</button></div>
        <BilingualPreview rows={grouped['Lain-lain'] || []} section="Lain-lain" onEdit={openEditEntry} onDelete={deleteEntry} loading={loading} />
      </div>
      <div className="weekly-footer">KPN Plantations – Sustainability HO | System & Monitoring</div>
    </section>

    {showEntry && <div className="modal-backdrop"><form className="modal-card" onSubmit={saveEntry}>
      <div className="modal-head"><div><h2>{entryForm.id ? 'Edit' : 'Add'} {entryForm.section} Report Row</h2><p>Use the same bilingual wording style as the weekly report.</p></div><button type="button" className="icon-btn" onClick={() => setShowEntry(false)}>×</button></div>
      <div className="form-grid">
        <label className="form-field"><span>Section</span><select value={entryForm.section} onChange={e => setEntryForm(p => ({ ...p, section: e.target.value }))}>{ALL_SECTIONS.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="form-field"><span>Sort Order</span><input type="number" min="1" value={entryForm.sortOrder} onChange={e => setEntryForm(p => ({ ...p, sortOrder: e.target.value }))} /></label>
        {PROGRESS_SECTIONS.includes(entryForm.section) ? <>
          <label className="form-field"><span>Unit *</span><input required value={entryForm.unit} onChange={e => setEntryForm(p => ({ ...p, unit: e.target.value }))} placeholder="e.g. PACP, PAPM, PWKSM" /></label>
          <label className="form-field"><span>Stage *</span><input required value={entryForm.stage} onChange={e => setEntryForm(p => ({ ...p, stage: e.target.value }))} placeholder="e.g. Surveillance, Re-certification" /></label>
        </> : null}
        <label className="form-field wide"><span>{entryForm.section === 'Grievance' || entryForm.section === 'Lain-lain' ? 'Uraian – Bahasa Indonesia *' : 'Progress – Bahasa Indonesia *'}</span><textarea required value={entryForm.progressId} onChange={e => setEntryForm(p => ({ ...p, progressId: e.target.value }))} /></label>
        <label className="form-field wide"><span>{entryForm.section === 'Grievance' || entryForm.section === 'Lain-lain' ? 'Description – English *' : 'Progress – English *'}</span><textarea required value={entryForm.progressEn} onChange={e => setEntryForm(p => ({ ...p, progressEn: e.target.value }))} /></label>
      </div>
      <div className="form-actions"><div></div><div className="form-action-right"><button type="button" className="secondary-btn" onClick={() => setShowEntry(false)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save Report Row'}</button></div></div>
    </form></div>}

    {showPlan && <div className="modal-backdrop"><form className="modal-card" onSubmit={savePlan}>
      <div className="modal-head"><div><h2>{planForm.id ? 'Edit' : 'Add'} ISPO Certification Plan</h2><p>Stage 1 / Stage 2 timeline table shown below the ISPO progress table.</p></div><button type="button" className="icon-btn" onClick={() => setShowPlan(false)}>×</button></div>
      <div className="form-grid">
        <label className="form-field"><span>PT *</span><input required value={planForm.pt} onChange={e => setPlanForm(p => ({ ...p, pt: e.target.value }))} /></label>
        <label className="form-field"><span>Sort Order</span><input type="number" min="1" value={planForm.sortOrder} onChange={e => setPlanForm(p => ({ ...p, sortOrder: e.target.value }))} /></label>
        <label className="form-field"><span>Stage 1</span><input value={planForm.stage1} onChange={e => setPlanForm(p => ({ ...p, stage1: e.target.value }))} placeholder="3rd Week Oct 2026" /></label>
        <label className="form-field"><span>Stage 2</span><input value={planForm.stage2} onChange={e => setPlanForm(p => ({ ...p, stage2: e.target.value }))} placeholder="3rd Week Apr 2027" /></label>
        <label className="form-field wide"><span>Explanation</span><textarea value={planForm.explanation} onChange={e => setPlanForm(p => ({ ...p, explanation: e.target.value }))} /></label>
      </div>
      <div className="form-actions"><div></div><div className="form-action-right"><button type="button" className="secondary-btn" onClick={() => setShowPlan(false)}>Cancel</button><button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : 'Save Plan Row'}</button></div></div>
    </form></div>}
  </div>;
}

function ProgressPreview({ rows, onEdit, onDelete, loading }) {
  return <div className="table-wrap"><table className="weekly-table"><thead><tr><th>No.</th><th>Unit</th><th>Stage</th><th>Progress – Bahasa Indonesia</th><th>Progress – English</th><th>Actions</th></tr></thead><tbody>
    {loading ? <tr><td colSpan="6" className="empty-cell">Loading…</td></tr> : rows.length ? rows.map((r, i) => <tr key={r.id}><td>{i + 1}</td><td><strong>{r.unit || '-'}</strong>{r.source_module ? <div className="source-tag">AUTO · {sourceLabel(r.source_module)}</div> : <div className="source-tag manual">MANUAL</div>}</td><td>{r.stage || '-'}</td><td className="weekly-text-cell">{r.progress_id}{r.source_module ? <div className="source-tag">AUTO · {sourceLabel(r.source_module)}</div> : null}</td><td className="weekly-text-cell">{r.progress_en}</td><td><div className="table-actions"><button className="view-btn" onClick={() => onEdit(r)}>Edit</button><button className="danger-btn compact" onClick={() => onDelete(r)}>Delete</button></div></td></tr>) : <tr><td colSpan="6" className="empty-cell">No rows yet.</td></tr>}
  </tbody></table></div>;
}

function PlanPreview({ rows, onEdit, onDelete, loading }) {
  return <div className="table-wrap"><table className="weekly-table"><thead><tr><th>No.</th><th>PT</th><th>Stage 1</th><th>Stage 2</th><th>Explanation</th><th>Actions</th></tr></thead><tbody>
    {loading ? <tr><td colSpan="6" className="empty-cell">Loading…</td></tr> : rows.length ? rows.map((r, i) => <tr key={r.id}><td>{i + 1}</td><td><strong>{r.pt}</strong>{r.source_module ? <div className="source-tag">AUTO · Audit</div> : <div className="source-tag manual">MANUAL</div>}</td><td>{r.stage_1 || '-'}</td><td>{r.stage_2 || '-'}</td><td className="weekly-text-cell">{r.explanation || '-'}</td><td><div className="table-actions"><button className="view-btn" onClick={() => onEdit(r)}>Edit</button><button className="danger-btn compact" onClick={() => onDelete(r)}>Delete</button></div></td></tr>) : <tr><td colSpan="6" className="empty-cell">No ISPO plan rows yet.</td></tr>}
  </tbody></table></div>;
}

function BilingualPreview({ rows, section, onEdit, onDelete, loading }) {
  const fallback = section === 'Grievance' ? { id: 'Tidak terdapat grievance baru.', en: 'There are no new grievances.' } : null;
  return <div className="table-wrap"><table className="weekly-table"><thead><tr><th>No.</th><th>Uraian – Bahasa Indonesia</th><th>Description – English</th><th>Actions</th></tr></thead><tbody>
    {loading ? <tr><td colSpan="4" className="empty-cell">Loading…</td></tr> : rows.length ? rows.map((r, i) => <tr key={r.id}><td>{i + 1}</td><td className="weekly-text-cell">{r.progress_id}</td><td className="weekly-text-cell">{r.progress_en}</td><td><div className="table-actions"><button className="view-btn" onClick={() => onEdit(r)}>Edit</button><button className="danger-btn compact" onClick={() => onDelete(r)}>Delete</button></div></td></tr>) : fallback ? <tr><td>1</td><td>{fallback.id}</td><td>{fallback.en}</td><td><span className="muted">Default</span></td></tr> : <tr><td colSpan="4" className="empty-cell">No rows yet.</td></tr>}
  </tbody></table></div>;
}

function sectionTitle(text, D) { return new D.Paragraph({ spacing: { before: 120, after: 80 }, children: [new D.TextRun({ text, bold: true, size: 22 })] }); }
function cell(text, D, opts = {}) { return new D.TableCell({ borders: D.borders, shading: opts.header ? { type: D.ShadingType.CLEAR, fill: D.headerFill } : undefined, margins: { top: 45, bottom: 45, left: 55, right: 55 }, children: [new D.Paragraph({ children: [new D.TextRun({ text: String(text ?? ''), bold: !!opts.header, size: 15, font: 'Arial' })] })] }); }

function progressTable(rows, D) {
  const header = new D.TableRow({ children: ['No.','Unit','Stage','Progress – Bahasa Indonesia','Progress – English'].map(t => cell(t, D, { header: true })) });
  const data = rows.length ? rows.map((r, i) => new D.TableRow({ children: [i + 1, r.unit || '-', r.stage || '-', r.progress_id || '', r.progress_en || ''].map(v => cell(v, D)) })) : [new D.TableRow({ children: [cell('1', D), cell('-', D), cell('-', D), cell('-', D), cell('-', D)] })];
  return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [header, ...data] });
}

function ispoPlanTable(rows, D) {
  const headerTop = new D.TableRow({ children: [
    new D.TableCell({ rowSpan: 2, borders: D.borders, shading: { type: D.ShadingType.CLEAR, fill: D.headerFill }, children: [new D.Paragraph({ children: [new D.TextRun({ text: 'No', bold: true, size: 15, font: 'Arial' })] })] }),
    new D.TableCell({ rowSpan: 2, borders: D.borders, shading: { type: D.ShadingType.CLEAR, fill: D.headerFill }, children: [new D.Paragraph({ children: [new D.TextRun({ text: 'PT', bold: true, size: 15, font: 'Arial' })] })] }),
    new D.TableCell({ columnSpan: 2, borders: D.borders, shading: { type: D.ShadingType.CLEAR, fill: D.headerFill }, children: [new D.Paragraph({ alignment: D.AlignmentType?.CENTER, children: [new D.TextRun({ text: 'Timeline', bold: true, size: 15, font: 'Arial' })] })] }),
    new D.TableCell({ rowSpan: 2, borders: D.borders, shading: { type: D.ShadingType.CLEAR, fill: D.headerFill }, children: [new D.Paragraph({ children: [new D.TextRun({ text: 'Explanation', bold: true, size: 15, font: 'Arial' })] })] }),
  ] });
  const headerBottom = new D.TableRow({ children: [cell('Stage 1', D, { header: true }), cell('Stage 2', D, { header: true })] });
  const data = rows.map((r, i) => new D.TableRow({ children: [i + 1, r.pt, r.stage_1 || '', r.stage_2 || '', r.explanation || ''].map(v => cell(v, D)) }));
  return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [headerTop, headerBottom, ...data] });
}

function simpleBilingualTable(rows, section, D) {
  const header = new D.TableRow({ children: ['No.','Uraian – Bahasa Indonesia','Description – English'].map(t => cell(t, D, { header: true })) });
  let data;
  if (rows.length) data = rows.map((r, i) => new D.TableRow({ children: [i + 1, r.progress_id || '', r.progress_en || ''].map(v => cell(v, D)) }));
  else if (section === 'Grievance') data = [new D.TableRow({ children: [cell('1', D), cell('Tidak terdapat grievance baru.', D), cell('There are no new grievances.', D)] })];
  else data = [new D.TableRow({ children: [cell('1', D), cell('-', D), cell('-', D)] })];
  return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [header, ...data] });
}

function sourceLabel(source) {
  if (source === 'audit_events') return 'Audit';
  if (source === 'certifications') return 'Certification';
  if (source === 'grievances') return 'Grievance';
  return source || 'Source';
}
function addDays(value, amount) {
  const d = new Date(`${value}T00:00:00`); d.setDate(d.getDate() + amount);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function normalizeStandard(value) {
  const s = String(value || '').toUpperCase();
  if (s.includes('ISPO')) return 'ISPO'; if (s.includes('ISCC')) return 'ISCC'; if (/\bINS\b/.test(s)) return 'INS'; return '';
}
function inferStandard(value) { return normalizeStandard(value); }
function unitLabel(row, companyMap, siteMap) {
  const site = siteMap[row.site_id]; const company = companyMap[row.company_id];
  return site?.site_code || site?.site_name || company?.company_code || '-';
}
function certUnitLabel(row, companyMap, siteMap) { return unitLabel(row, companyMap, siteMap); }
function formatDateID(value) { if (!value) return '-'; const d=new Date(`${value}T00:00:00`); return d.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}); }
function formatDateEN(value) { if (!value) return '-'; const d=new Date(`${value}T00:00:00`); return d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}); }
function formatDateRangeID(start,end) { return start===end ? formatDateID(start) : `${formatDateID(start)}–${formatDateID(end)}`; }
function formatDateRangeEN(start,end) { return start===end ? formatDateEN(start) : `${formatDateEN(start)}–${formatDateEN(end)}`; }
function auditStatusID(status) {
  if (status === 'Done') return 'telah dilaksanakan'; if (status === 'Postponed') return 'ditunda';
  if (status === 'Confirmed') return 'dijadwalkan dan telah dikonfirmasi'; return 'direncanakan';
}
function auditStatusEN(status) {
  if (status === 'Done') return 'has been completed'; if (status === 'Postponed') return 'has been postponed';
  if (status === 'Confirmed') return 'is scheduled and confirmed'; return 'is planned';
}
function weekOfMonthLabel(value) {
  const d=new Date(`${value}T00:00:00`); const week=Math.ceil(d.getDate()/7); const suffix=week===1?'st':week===2?'nd':week===3?'rd':'th';
  return `${week}${suffix} Week ${d.toLocaleDateString('en-GB',{month:'short',year:'numeric'})}`;
}
function cleanSentence(value) { const t=String(value||'').trim(); return !t ? '' : /[.!?]$/.test(t) ? t : `${t}.`; }
function trimEnd(value) { return String(value||'').trim().replace(/[.;,]+$/,''); }

function formatLongDate(value) {
  if (!value) return '-';
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/^0/, '');
}
function fileDate(value) {
  if (!value) return 'Report';
  const d = new Date(`${value}T00:00:00`);
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  return `${String(d.getDate()).padStart(2,'0')}_${month}_${d.getFullYear()}`;
}
