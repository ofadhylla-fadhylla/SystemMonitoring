'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';

const STANDARDS=[
  {code:'NDPE',label:'NDPE Policy — KPN IMIS'},
  {code:'ISPO',label:'ISPO — Permentan 33/2025'},
  {code:'RSPO',label:'RSPO — P&C 2018'},
  {code:'ISCC',label:'ISCC — v4.1'},
];
const CLOSED=new Set(['Completed','Closed']);
const safe=v=>String(v||'audit-pack').replace(/[^a-zA-Z0-9._-]+/g,'_');
const csv=v=>`"${String(v??'').replace(/"/g,'""')}"`;
const pct=(n,d)=>d?Math.round(n/d*100):0;

async function fetchByIds(table,columns,field,ids,chunk=150){
  const uniq=[...new Set((ids||[]).filter(Boolean))];
  if(!uniq.length)return[];
  const out=[];
  for(let i=0;i<uniq.length;i+=chunk){
    const q=await supabase.from(table).select(columns).in(field,uniq.slice(i,i+chunk));
    if(q.error)throw q.error;
    out.push(...(q.data||[]));
  }
  return out;
}

export default function DigitalAuditRoom(){
  const currentYear=new Date().getFullYear();
  const [companies,setCompanies]=useState([]);
  const [companyId,setCompanyId]=useState('');
  const [year,setYear]=useState(currentYear);
  const [standardCode,setStandardCode]=useState('ISPO');
  const [ndpeStandard,setNdpeStandard]=useState(null);
  const [assessment,setAssessment]=useState(null);
  const [principles,setPrinciples]=useState([]);
  const [criteria,setCriteria]=useState([]);
  const [indicators,setIndicators]=useState([]);
  const [items,setItems]=useState([]);
  const [evidence,setEvidence]=useState([]);
  const [actions,setActions]=useState([]);
  const [actionEvidence,setActionEvidence]=useState([]);
  const [mappings,setMappings]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [generatedAt,setGeneratedAt]=useState('');
  const [search,setSearch]=useState('');
  const [view,setView]=useState('All');

  useEffect(()=>{(async()=>{
    const ce=getSupabaseConfigError();
    if(ce||!supabase){setError(ce||'Supabase not configured.');return;}
    const [co,st]=await Promise.all([
      supabase.from('companies').select('id,company_code,company_name,region,province,status').eq('status','Active').order('company_code'),
      supabase.from('sims_standards').select('id,code,name,status').eq('code','NDPE-IMIS-KPN').eq('status','Active').maybeSingle(),
    ]);
    if(co.error||st.error){setError((co.error||st.error).message);return;}
    setCompanies(co.data||[]);setNdpeStandard(st.data||null);
    if(!st.data)setError('Master NDPE-IMIS-KPN belum tersedia.');
  })()},[]);

  async function generatePack(){
    if(!companyId||!ndpeStandard?.id)return;
    setLoading(true);setError('');setGeneratedAt('');
    try{
      const p=await supabase.from('sims_principles').select('id,code,title,sort_order').eq('standard_id',ndpeStandard.id).order('sort_order');
      if(p.error)throw p.error;
      const c=await fetchByIds('sims_criteria','id,principle_id,code,title,sort_order','principle_id',(p.data||[]).map(x=>x.id));
      const i=await fetchByIds('sims_indicators','id,criterion_id,code,description,object_evidence,sort_order,active','criterion_id',c.map(x=>x.id));
      const activeIndicators=i.filter(x=>x.active!==false);
      const aq=await supabase.from('sims_assessments').select('id,company_id,standard_id,assessment_year,status,started_at,completed_at,created_at,updated_at').eq('company_id',companyId).eq('standard_id',ndpeStandard.id).eq('assessment_year',Number(year)).maybeSingle();
      if(aq.error)throw aq.error;
      if(!aq.data){
        setAssessment(null);setPrinciples(p.data||[]);setCriteria(c);setIndicators(activeIndicators);setItems([]);setEvidence([]);setActions([]);setActionEvidence([]);setMappings([]);
        throw new Error(`Belum ada NDPE assessment ${year} untuk PT yang dipilih. Isi NDPE Policy & Report terlebih dahulu.`);
      }
      const iq=await supabase.from('sims_assessment_items').select('id,assessment_id,indicator_id,self_status,explanation,verifier_status,verifier_notes,verified_at,updated_at').eq('assessment_id',aq.data.id);
      if(iq.error)throw iq.error;
      const itemRows=iq.data||[],itemIds=itemRows.map(x=>x.id);
      const [ev,ap,mp]=await Promise.all([
        fetchByIds('sims_evidence','id,assessment_item_id,file_name,file_path,file_type,file_size,notes,uploaded_at','assessment_item_id',itemIds),
        fetchByIds('sims_action_plans','id,assessment_item_id,action_text,pic,priority,deadline,status,completion_notes,verifier_status,verifier_notes,verified_at,updated_at','assessment_item_id',itemIds),
        standardCode==='NDPE'?Promise.resolve([]):fetchByIds('sims_report_standard_mappings','indicator_id,standard_code,standard_name,requirement_reference,mapping_source,sort_order,active','indicator_id',activeIndicators.map(x=>x.id)),
      ]);
      const selectedMappings=(mp||[]).filter(x=>x.active!==false&&x.standard_code===standardCode);
      if(standardCode!=='NDPE'&&!selectedMappings.length)throw new Error(`Crosswalk ${standardCode} belum tersedia pada master mapping.`);
      const ae=await fetchByIds('sims_action_evidence','id,action_plan_id,file_name,file_path,file_type,file_size,uploaded_at','action_plan_id',ap.map(x=>x.id));
      setAssessment(aq.data);setPrinciples(p.data||[]);setCriteria(c);setIndicators(activeIndicators);setItems(itemRows);setEvidence(ev);setActions(ap);setActionEvidence(ae);setMappings(selectedMappings);setGeneratedAt(new Date().toISOString());
    }catch(e){setError(e.message||String(e));}
    finally{setLoading(false);}
  }

  const company=companies.find(x=>x.id===companyId)||null;
  const principleMap=useMemo(()=>Object.fromEntries(principles.map(x=>[x.id,x])),[principles]);
  const criterionMap=useMemo(()=>Object.fromEntries(criteria.map(x=>[x.id,x])),[criteria]);
  const itemByIndicator=useMemo(()=>Object.fromEntries(items.map(x=>[x.indicator_id,x])),[items]);
  const evidenceByItem=useMemo(()=>{const m={};evidence.forEach(x=>(m[x.assessment_item_id]??=[]).push(x));return m},[evidence]);
  const actionByItem=useMemo(()=>Object.fromEntries(actions.map(x=>[x.assessment_item_id,x])),[actions]);
  const actionEvidenceByPlan=useMemo(()=>{const m={};actionEvidence.forEach(x=>(m[x.action_plan_id]??=[]).push(x));return m},[actionEvidence]);
  const mappingByIndicator=useMemo(()=>Object.fromEntries(mappings.map(x=>[x.indicator_id,x])),[mappings]);

  const rows=useMemo(()=>{
    const base=indicators.filter(ind=>standardCode==='NDPE'||mappingByIndicator[ind.id]);
    return base.map(ind=>{
      const criterion=criterionMap[ind.criterion_id],principle=criterion?principleMap[criterion.principle_id]:null;
      const item=itemByIndicator[ind.id],action=item?actionByItem[item.id]:null;
      const ev=item?(evidenceByItem[item.id]||[]):[],ae=action?(actionEvidenceByPlan[action.id]||[]):[];
      const mp=mappingByIndicator[ind.id];
      return{
        indicatorId:ind.id,
        ndpeCode:ind.code,
        requirementRef:standardCode==='NDPE'?ind.code:(mp?.requirement_reference||''),
        requirement:ind.description||'',expectedEvidence:ind.object_evidence||'',
        principle:principle?`${principle.code} - ${principle.title}`:'',criterion:criterion?`${criterion.code} - ${criterion.title}`:'',
        status:item?.self_status||'Not Started',verifier:item?.verifier_status||'Pending',explanation:item?.explanation||'',verifierNotes:item?.verifier_notes||'',
        evidence:ev,actionEvidence:ae,evidenceCount:ev.length+ae.length,
        action:action?.action_text||'',pic:action?.pic||'',priority:action?.priority||'',deadline:action?.deadline||'',actionStatus:action?.status||'',actionVerifier:action?.verifier_status||'',completionNotes:action?.completion_notes||'',
        mappingSort:mp?.sort_order??999999,indicatorSort:ind.sort_order??999999,mappingSource:mp?.mapping_source||'',
      };
    }).sort((a,b)=>standardCode==='NDPE'?(a.indicatorSort-b.indicatorSort):(a.mappingSort-b.mappingSort||a.indicatorSort-b.indicatorSort));
  },[indicators,standardCode,mappingByIndicator,criterionMap,principleMap,itemByIndicator,actionByItem,evidenceByItem,actionEvidenceByPlan]);

  const metrics=useMemo(()=>{
    const total=rows.length,verified=rows.filter(r=>r.status==='Fulfilled'&&r.verifier==='Verified').length,gaps=rows.filter(r=>r.status==='Not Fulfilled').length,evidenceReady=rows.filter(r=>r.status==='N/A'||r.evidenceCount>0).length;
    const packReady=rows.filter(r=>r.status==='N/A'||(r.status==='Fulfilled'&&r.verifier==='Verified'&&r.evidenceCount>0)).length;
    const openActions=rows.filter(r=>r.status==='Not Fulfilled'&&(!r.actionStatus||!CLOSED.has(r.actionStatus))).length;
    return{total,verified,gaps,evidenceReady,packReady,openActions,verifiedPct:pct(verified,total),evidencePct:pct(evidenceReady,total),packPct:pct(packReady,total)};
  },[rows]);

  const filtered=useMemo(()=>rows.filter(r=>{
    const q=search.trim().toLowerCase();
    if(q&&!`${r.requirementRef} ${r.ndpeCode} ${r.requirement} ${r.principle} ${r.criterion}`.toLowerCase().includes(q))return false;
    if(view==='Gap'&&r.status!=='Not Fulfilled')return false;
    if(view==='Verified'&&!(r.status==='Fulfilled'&&r.verifier==='Verified'))return false;
    if(view==='Evidence Missing'&&(r.status==='N/A'||r.evidenceCount>0))return false;
    if(view==='Open Action'&&!(r.status==='Not Fulfilled'&&(!r.actionStatus||!CLOSED.has(r.actionStatus))))return false;
    return true;
  }),[rows,search,view]);

  const outstanding=useMemo(()=>rows.map(r=>{
    const reasons=[];
    if(r.status==='Not Fulfilled')reasons.push('Gap');
    if(r.verifier==='Need Revision'||r.actionVerifier==='Need Revision')reasons.push('Need Revision');
    if(r.status==='Fulfilled'&&r.evidenceCount===0)reasons.push('Evidence Missing');
    if(r.status==='Not Fulfilled'&&(!r.actionStatus||!CLOSED.has(r.actionStatus)))reasons.push('Open Action');
    return{...r,reasons};
  }).filter(r=>r.reasons.length),[rows]);

  const evidenceLibrary=useMemo(()=>{
    const out=[];
    rows.forEach(r=>{
      r.evidence.forEach(f=>out.push({...f,origin:'Assessment Evidence',requirementRef:r.requirementRef,ndpeCode:r.ndpeCode}));
      r.actionEvidence.forEach(f=>out.push({...f,origin:'Action Evidence',requirementRef:r.requirementRef,ndpeCode:r.ndpeCode}));
    });
    return out;
  },[rows]);

  const standardLabel=STANDARDS.find(x=>x.code===standardCode)?.label||standardCode;
  const mappingSource=standardCode==='NDPE'?'NDPE Policy — KPN IMIS':(mappings.find(x=>x.mapping_source)?.mapping_source||'Verified master crosswalk');
  const packId=generatedAt&&company?`${company.company_code}-${standardCode}-${year}-${generatedAt.slice(0,10).replaceAll('-','')}`:'';
  const filename=ext=>safe(`${company?.company_code||'PT'}_${standardCode}_${year}_Audit_Pack.${ext}`);

  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
  async function openEvidence(file){
    const q=await supabase.storage.from('sims-evidence').createSignedUrl(file.file_path,180);
    if(q.error){setError(q.error.message);return;}
    window.open(q.data.signedUrl,'_blank','noopener,noreferrer');
  }
  function exportCsv(){
    if(!rows.length)return;
    const header=['Standard','Requirement Reference','NDPE Code','NDPE Requirement','Principle','Criterion','Assessment Status','Verifier','Evidence Count','Explanation','Action','PIC','Priority','Deadline','Action Status','Action Verifier','Outstanding'];
    const data=[header,...rows.map(r=>[standardCode,r.requirementRef,r.ndpeCode,r.requirement,r.principle,r.criterion,r.status,r.verifier,r.evidenceCount,r.explanation,r.action,r.pic,r.priority,r.deadline,r.actionStatus,r.actionVerifier,outstanding.find(o=>o.indicatorId===r.indicatorId)?.reasons.join(' | ')||''])];
    download(new Blob(['\uFEFF'+data.map(x=>x.map(csv).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),filename('csv'));
  }
  async function exportPdf(){
    if(!rows.length)return;
    const{jsPDF}=await import('jspdf');const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();let y=13;
    const line=(text,size=8,bold=false)=>{doc.setFontSize(size);doc.setFont('helvetica',bold?'bold':'normal');const ls=doc.splitTextToSize(String(text||''),pw-24);if(y+ls.length*4>ph-12){doc.addPage();y=13}doc.text(ls,12,y);y+=ls.length*4+1};
    line('SMD DIGITAL AUDIT PACK',15,true);line(`${company?.company_code||''} — ${company?.company_name||''} | ${standardLabel} | ${year}`,10,true);line(`Pack ID: ${packId} | Source: ${mappingSource}`,8);line(`Verified Alignment ${metrics.verifiedPct}% | Evidence Readiness ${metrics.evidencePct}% | Pack Readiness ${metrics.packPct}% | Gap ${metrics.gaps} | Open Action ${metrics.openActions}`,9,true);line('Crosswalk-based audit preparation report. This document is not a certification conclusion.',8);y+=2;
    rows.forEach((r,n)=>{line(`${n+1}. ${r.requirementRef} | NDPE ${r.ndpeCode} | ${r.status} | ${r.verifier} | Evidence ${r.evidenceCount}`,8,true);line(r.requirement,7.5);if(r.explanation)line(`Implementation: ${r.explanation}`,7);if(r.action)line(`Action: ${r.action} | ${r.pic||'-'} | ${r.actionStatus||'-'} | ${r.deadline||'-'}`,7);});
    if(evidenceLibrary.length){line('EVIDENCE MANIFEST',11,true);evidenceLibrary.forEach((f,n)=>line(`${n+1}. ${f.requirementRef} | ${f.ndpeCode} | ${f.origin} | ${f.file_name}`,7));}
    doc.save(filename('pdf'));
  }
  async function exportDocx(){
    if(!rows.length)return;
    const{Document,Packer,Paragraph,TextRun}=await import('docx');
    const children=[
      new Paragraph({children:[new TextRun({text:'SMD DIGITAL AUDIT PACK',bold:true,size:30})]}),
      new Paragraph({children:[new TextRun({text:`${company?.company_code||''} — ${company?.company_name||''} | ${standardLabel} | ${year}`,bold:true,size:22})]}),
      new Paragraph(`Pack ID: ${packId}`),new Paragraph(`Source: ${mappingSource}`),
      new Paragraph(`Verified Alignment: ${metrics.verifiedPct}% | Evidence Readiness: ${metrics.evidencePct}% | Pack Readiness: ${metrics.packPct}% | Gap: ${metrics.gaps} | Open Action: ${metrics.openActions}`),
      new Paragraph('Crosswalk-based audit preparation report. This document is not a certification conclusion.'),
    ];
    rows.forEach((r,n)=>{children.push(new Paragraph({children:[new TextRun({text:`${n+1}. ${r.requirementRef} | NDPE ${r.ndpeCode}`,bold:true})]}),new Paragraph(r.requirement),new Paragraph(`Assessment: ${r.status} | Verifier: ${r.verifier} | Evidence: ${r.evidenceCount}`));if(r.explanation)children.push(new Paragraph(`Implementation: ${r.explanation}`));if(r.action)children.push(new Paragraph(`Corrective Action: ${r.action} | PIC: ${r.pic||'-'} | Status: ${r.actionStatus||'-'} | Deadline: ${r.deadline||'-'}`));const names=[...r.evidence,...r.actionEvidence].map(f=>f.file_name).filter(Boolean);if(names.length)children.push(new Paragraph(`Evidence Files: ${names.join('; ')}`));});
    if(evidenceLibrary.length){children.push(new Paragraph({children:[new TextRun({text:'EVIDENCE MANIFEST',bold:true,size:24})]}));evidenceLibrary.forEach((f,n)=>children.push(new Paragraph(`${n+1}. ${f.requirementRef} | ${f.ndpeCode} | ${f.origin} | ${f.file_name}`)));}
    const doc=new Document({sections:[{children}]});download(await Packer.toBlob(doc),filename('docx'));
  }

  return <main className="page-wrap audit-wrap">
    <style>{styles}</style>
    <section className="audit-hero">
      <div><span>DIGITAL AUDIT ROOM</span><h1>One-Click Audit Pack</h1><p>Pilih PT, tahun, dan standard. SMD menyatukan NDPE assessment, verified crosswalk, evidence, corrective action, dan outstanding dalam satu ruang persiapan audit.</p></div>
      <div className="audit-flow"><b>ONE INPUT</b><i>→</i><b>MULTI STANDARD</b><i>→</i><b>AUDIT PACK</b></div>
    </section>

    <section className="audit-card audit-controls">
      <label><span>Company / PT</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Select Company / PT</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></label>
      <label><span>Assessment Year</span><select value={year} onChange={e=>setYear(Number(e.target.value))}>{[currentYear+1,currentYear,currentYear-1,currentYear-2].map(y=><option key={y}>{y}</option>)}</select></label>
      <label><span>Audit Standard</span><select value={standardCode} onChange={e=>setStandardCode(e.target.value)}>{STANDARDS.map(s=><option key={s.code} value={s.code}>{s.label}</option>)}</select></label>
      <button onClick={generatePack} disabled={!companyId||loading}>{loading?'Building Pack…':'Generate Audit Pack'}</button>
    </section>

    {error?<div className="audit-error"><strong>Audit Pack Notice</strong><span>{error}</span></div>:null}

    {generatedAt&&assessment?<>
      <section className="audit-meta audit-card"><div><span>PACK ID</span><b>{packId}</b></div><div><span>PT</span><b>{company?.company_code} — {company?.company_name}</b></div><div><span>STANDARD</span><b>{standardLabel}</b></div><div><span>SOURCE</span><b>{mappingSource}</b></div></section>

      <section className="audit-kpis">
        <KPI label="Verified Alignment" value={`${metrics.verifiedPct}%`} hint={`${metrics.verified}/${metrics.total} mapped requirements`}/>
        <KPI label="Evidence Readiness" value={`${metrics.evidencePct}%`} hint={`${metrics.evidenceReady}/${metrics.total} evidence-ready`}/>
        <KPI label="Pack Readiness" value={`${metrics.packPct}%`} hint="Verified + evidence, N/A accepted"/>
        <KPI label="Active Gap" value={metrics.gaps} hint={`${metrics.openActions} open action`}/>
      </section>

      <section className="audit-grid">
        <div className="audit-card"><div className="audit-head"><div><span>OUTSTANDING QUEUE</span><h2>What Blocks Audit Readiness</h2></div><strong>{outstanding.length}</strong></div>{outstanding.length?<div className="out-list">{outstanding.slice(0,8).map(r=><div key={r.indicatorId}><b>{r.requirementRef}</b><span>{r.ndpeCode} · {r.reasons.join(' · ')}</span><small>{r.requirement}</small></div>)}</div>:<Empty text="No active outstanding item in this pack."/>}</div>
        <div className="audit-card"><div className="audit-head"><div><span>EVIDENCE LIBRARY</span><h2>Reusable Audit Evidence</h2></div><strong>{evidenceLibrary.length}</strong></div>{evidenceLibrary.length?<div className="evidence-list">{evidenceLibrary.slice(0,8).map(f=><button key={`${f.origin}-${f.id}`} onClick={()=>openEvidence(f)}><b>{f.file_name}</b><span>{f.requirementRef} · {f.origin}</span></button>)}</div>:<Empty text="No evidence file found for this pack."/>}</div>
      </section>

      <section className="audit-card audit-pack-head">
        <div><span>PACK CONTENT</span><h2>{standardLabel} Requirement Matrix</h2><p>{metrics.total} mapped NDPE requirements · {evidenceLibrary.length} evidence files · {actions.length} action plan records.</p></div>
        <div className="audit-actions"><button onClick={exportCsv}>CSV</button><button onClick={exportPdf}>PDF</button><button className="primary" onClick={exportDocx}>Download Audit Pack · Word</button></div>
      </section>

      <section className="audit-card audit-filter"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search requirement, NDPE code, principle…"/><select value={view} onChange={e=>setView(e.target.value)}>{['All','Gap','Verified','Evidence Missing','Open Action'].map(x=><option key={x}>{x}</option>)}</select><span>{filtered.length} shown</span></section>

      <section className="audit-card audit-table-wrap"><table className="audit-table"><thead><tr><th>Standard Ref</th><th>NDPE</th><th>Requirement</th><th>Status</th><th>Verifier</th><th>Evidence</th><th>Action</th></tr></thead><tbody>{filtered.map(r=><tr key={r.indicatorId}><td><b>{r.requirementRef||'—'}</b></td><td>{r.ndpeCode}</td><td><strong>{r.requirement}</strong>{r.explanation?<small>Implementation: {r.explanation}</small>:null}</td><td><Badge value={r.status}/></td><td><Badge value={r.verifier}/></td><td><button className="count-btn" disabled={!r.evidenceCount} onClick={()=>{const f=[...r.evidence,...r.actionEvidence][0];if(f)openEvidence(f)}}>{r.evidenceCount}</button></td><td>{r.actionStatus?<><Badge value={r.actionStatus}/><small>{r.pic||''}{r.deadline?` · ${r.deadline}`:''}</small></>:<span className="muted">—</span>}</td></tr>)}</tbody></table>{!filtered.length?<Empty text="No requirement matches the selected filter."/>:null}</section>

      <section className="audit-card audit-note"><b>Governance note</b><span>Sumber assessment tetap NDPE Policy — KPN IMIS. Standard eksternal ditampilkan melalui verified master crosswalk. Verified Alignment dan Pack Readiness adalah indikator internal untuk persiapan audit, bukan kesimpulan sertifikasi.</span></section>
    </>:<section className="audit-card audit-empty"><div><b>Build an Audit Pack</b><span>Pilih PT, tahun, dan standard lalu klik Generate Audit Pack. Data tidak diduplikasi; Audit Room membaca assessment dan evidence yang sudah ada di SIMS.</span></div></section>}
  </main>
}

function KPI({label,value,hint}){return <div className="audit-kpi"><span>{label}</span><b>{value}</b><small>{hint}</small></div>}
function Empty({text}){return <div className="audit-empty-mini">{text}</div>}
function Badge({value}){const v=String(value||'Pending');const cls=v.toLowerCase().replaceAll(' ','-').replaceAll('/','-');return <span className={`audit-badge ${cls}`}>{v}</span>}

const styles=`
.audit-wrap{padding:24px 26px 42px;color:#173f2d}.audit-hero{background:linear-gradient(120deg,#123f2d,#0f6948);color:#fff;border-radius:20px;padding:24px 26px;display:flex;justify-content:space-between;gap:22px;align-items:center;margin-bottom:18px;box-shadow:0 14px 34px rgba(20,70,48,.12)}.audit-hero span,.audit-head span,.audit-pack-head span,.audit-meta span{font-size:10px;letter-spacing:.14em;font-weight:900;opacity:.72}.audit-hero h1{font-size:29px;margin:5px 0 8px}.audit-hero p{max-width:780px;margin:0;line-height:1.55;color:#d6eadf}.audit-flow{display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:10px}.audit-flow b{background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.16);padding:9px 10px;border-radius:9px}.audit-flow i{opacity:.6}.audit-card{background:#fff;border:1px solid #dce8e0;border-radius:16px;box-shadow:0 5px 18px rgba(24,64,43,.05)}.audit-controls{padding:18px;display:grid;grid-template-columns:1.4fr .55fr 1fr auto;gap:13px;align-items:end;margin-bottom:18px}.audit-controls label span{display:block;font-size:10px;font-weight:900;color:#698076;margin-bottom:6px}.audit-controls select,.audit-filter input,.audit-filter select{width:100%;height:42px;border:1px solid #d7e4dc;border-radius:10px;padding:0 11px;background:#fff;color:#214c36}.audit-controls button,.audit-actions button{height:42px;border:0;border-radius:10px;padding:0 15px;font-weight:900;cursor:pointer;background:#e8f3ec;color:#19553a}.audit-controls button{background:#195c3d;color:#fff}.audit-controls button:disabled{opacity:.45;cursor:not-allowed}.audit-error{display:flex;gap:10px;padding:12px 14px;border-radius:12px;background:#fff2f1;border:1px solid #f1cbc6;color:#9f352b;margin-bottom:15px;font-size:12px}.audit-meta{display:grid;grid-template-columns:.9fr 1.5fr 1.1fr 1.5fr;gap:12px;padding:15px;margin-bottom:14px}.audit-meta div{padding:9px 11px;background:#f8fbf9;border-radius:10px}.audit-meta span{display:block;color:#6c7f74;margin-bottom:5px}.audit-meta b{font-size:12px}.audit-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:14px}.audit-kpi{padding:16px;background:#fff;border:1px solid #dce8e0;border-radius:14px}.audit-kpi span{font-size:10px;font-weight:900;color:#708178}.audit-kpi b{display:block;font-size:25px;margin:7px 0 2px;color:#164c33}.audit-kpi small{color:#77887e}.audit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.audit-grid>.audit-card{padding:16px}.audit-head,.audit-pack-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start}.audit-head h2,.audit-pack-head h2{font-size:16px;margin:4px 0}.audit-head>strong{font-size:25px;color:#276344}.out-list,.evidence-list{display:flex;flex-direction:column;gap:7px;margin-top:11px}.out-list>div,.evidence-list button{border:1px solid #e1ebe5;background:#fafcfb;border-radius:10px;padding:9px 10px;text-align:left}.out-list b,.evidence-list b{font-size:11px;color:#1c563b}.out-list span,.evidence-list span{display:block;font-size:10px;color:#a04a32;margin-top:2px}.out-list small{display:block;color:#78877e;margin-top:4px;line-height:1.35}.evidence-list button{cursor:pointer}.evidence-list span{color:#708178}.audit-pack-head{padding:17px;margin-bottom:11px;align-items:center}.audit-pack-head p{font-size:11px;color:#718278;margin:4px 0 0}.audit-actions{display:flex;gap:7px}.audit-actions .primary{background:#185b3c;color:#fff}.audit-filter{padding:12px;display:grid;grid-template-columns:1fr 220px auto;gap:10px;align-items:center;margin-bottom:11px}.audit-filter span{font-size:11px;color:#718278;font-weight:800}.audit-table-wrap{overflow:auto}.audit-table{width:100%;border-collapse:collapse;min-width:1050px}.audit-table th{font-size:10px;letter-spacing:.04em;text-align:left;padding:10px;background:#f3f8f5;color:#5c7768;border-bottom:1px solid #dce8e0}.audit-table td{font-size:11px;padding:10px;border-bottom:1px solid #e8efeb;vertical-align:top}.audit-table td:nth-child(3){min-width:330px}.audit-table td strong{font-weight:700;line-height:1.4}.audit-table td small{display:block;color:#78877e;margin-top:5px;line-height:1.35}.audit-badge{display:inline-block;padding:4px 7px;border-radius:999px;background:#edf2ef;color:#536b5d;font-size:9px;font-weight:900;white-space:nowrap}.audit-badge.fulfilled,.audit-badge.verified,.audit-badge.completed,.audit-badge.closed{background:#e5f5e9;color:#237343}.audit-badge.not-fulfilled,.audit-badge.need-revision{background:#fde8e5;color:#a43b31}.audit-badge.pending,.audit-badge.not-started,.audit-badge.open,.audit-badge.in-progress{background:#fff3d9;color:#8b6418}.count-btn{border:0;border-radius:8px;background:#e8f4ed;color:#1c6542;font-weight:900;padding:5px 9px;cursor:pointer}.count-btn:disabled{opacity:.45;cursor:default}.muted{color:#9aa8a0}.audit-note{margin-top:12px;padding:13px 15px;display:flex;gap:12px;font-size:11px;color:#687a70}.audit-note b{color:#244f39;white-space:nowrap}.audit-empty{min-height:190px;display:grid;place-items:center;text-align:center;padding:28px}.audit-empty div{max-width:600px}.audit-empty b{display:block;font-size:17px;color:#24553c;margin-bottom:7px}.audit-empty span,.audit-empty-mini{font-size:11px;color:#7a8b81;line-height:1.5}.audit-empty-mini{padding:22px;text-align:center}.audit-table-wrap>.audit-empty-mini{padding:28px}
@media(max-width:1150px){.audit-controls{grid-template-columns:1fr 1fr}.audit-meta{grid-template-columns:1fr 1fr}.audit-flow{display:none}.audit-kpis{grid-template-columns:1fr 1fr}}@media(max-width:760px){.audit-wrap{padding:16px}.audit-hero{padding:20px}.audit-hero h1{font-size:23px}.audit-controls,.audit-meta,.audit-kpis,.audit-grid,.audit-filter{grid-template-columns:1fr}.audit-pack-head{display:block}.audit-actions{margin-top:12px;flex-wrap:wrap}}
`;
