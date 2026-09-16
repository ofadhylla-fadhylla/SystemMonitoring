'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../../lib/supabaseClient';
import styles from '../sims.module.css';

const PRIORITIES=['Low','Medium','High','Critical'];
const STATUSES=['Open','In Progress','Completed','Closed'];
const VERIFY=['Pending','Verified','Need Revision'];
const safeName=v=>String(v||'file').replace(/[^a-zA-Z0-9._-]+/g,'_');

export default function SustainabilityActionPlan(){
  const [companies,setCompanies]=useState([]),[companyId,setCompanyId]=useState(''),[year,setYear]=useState(new Date().getFullYear());
  const [standard,setStandard]=useState(null),[assessment,setAssessment]=useState(null),[rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[savingId,setSavingId]=useState('');

  useEffect(()=>{(async()=>{
    const ce=getSupabaseConfigError();if(ce||!supabase){setError(ce||'Supabase not configured.');return;}
    const[c,s]=await Promise.all([
      supabase.from('companies').select('id,company_code,company_name,status').eq('status','Active').order('company_code'),
      supabase.from('sims_standards').select('*').eq('code','NDPE-IMIS-KPN').eq('status','Active').maybeSingle()
    ]);
    if(c.error||s.error){setError((c.error||s.error).message);return;}
    setCompanies(c.data||[]);setStandard(s.data||null);
  })()},[]);

  const company=companies.find(x=>x.id===companyId);
  const stats=useMemo(()=>{const today=new Date().toISOString().slice(0,10),total=rows.length,open=rows.filter(r=>!['Completed','Closed'].includes(r.status)).length,overdue=rows.filter(r=>r.deadline&&r.deadline<today&&!['Completed','Closed'].includes(r.status)).length,completed=rows.filter(r=>['Completed','Closed'].includes(r.status)).length,critical=rows.filter(r=>r.priority==='Critical'&&!['Completed','Closed'].includes(r.status)).length;return{total,open,overdue,completed,critical}},[rows]);

  async function openPlan(){
    if(!companyId||!standard?.id)return;setLoading(true);setError('');setNotice('');
    try{
      const a=await supabase.from('sims_assessments').select('*').eq('company_id',companyId).eq('standard_id',standard.id).eq('assessment_year',Number(year)).maybeSingle();
      if(a.error)throw a.error;
      if(!a.data){setAssessment(null);setRows([]);setNotice('Belum ada assessment NDPE untuk PT dan tahun ini. Isi NDPE Policy & Report terlebih dahulu.');return;}
      setAssessment(a.data);
      const items=await supabase.from('sims_assessment_items').select('*').eq('assessment_id',a.data.id);if(items.error)throw items.error;
      const gapItems=(items.data||[]).filter(x=>x.self_status==='Not Fulfilled');
      if(!gapItems.length){setRows([]);return;}
      const indIds=gapItems.map(x=>x.indicator_id),itemIds=gapItems.map(x=>x.id);
      const [inds,acts,maps]=await Promise.all([
        supabase.from('sims_indicators').select('id,code,description,criterion_id').in('id',indIds),
        supabase.from('sims_action_plans').select('*').in('assessment_item_id',itemIds),
        supabase.from('sims_report_standard_mappings').select('indicator_id,standard_code,standard_name,requirement_reference').in('indicator_id',indIds).eq('active',true)
      ]);
      if(inds.error||acts.error||maps.error)throw(inds.error||acts.error||maps.error);
      const critIds=[...new Set((inds.data||[]).map(x=>x.criterion_id))];
      const crit=critIds.length?await supabase.from('sims_criteria').select('id,code,title,principle_id').in('id',critIds):{data:[]};if(crit.error)throw crit.error;
      const pids=[...new Set((crit.data||[]).map(x=>x.principle_id))];
      const prin=pids.length?await supabase.from('sims_principles').select('id,code,title').in('id',pids):{data:[]};if(prin.error)throw prin.error;
      const indBy=Object.fromEntries((inds.data||[]).map(x=>[x.id,x])),critBy=Object.fromEntries((crit.data||[]).map(x=>[x.id,x])),prinBy=Object.fromEntries((prin.data||[]).map(x=>[x.id,x])),actBy=Object.fromEntries((acts.data||[]).map(x=>[x.assessment_item_id,x]));
      const mapBy={};(maps.data||[]).forEach(m=>(mapBy[m.indicator_id]??=[]).push(m));
      setRows(gapItems.map(it=>{const ind=indBy[it.indicator_id],cr=ind?critBy[ind.criterion_id]:null,pr=cr?prinBy[cr.principle_id]:null,ac=actBy[it.id]||{id:null,assessment_item_id:it.id,action_text:'',pic:'',priority:'Medium',deadline:'',status:'Open',completion_notes:'',verifier_status:'Pending',verifier_notes:''};return{...ac,item:it,indicator:ind,criterion:cr,principle:pr,mappings:mapBy[it.indicator_id]||[]}}));
    }catch(e){setError(e.message||String(e))}finally{setLoading(false)}
  }

  useEffect(()=>{if(companyId&&standard?.id)openPlan();else{setAssessment(null);setRows([])}},[companyId,year,standard?.id]);
  function patchRow(idx,patch){setRows(v=>v.map((r,i)=>i===idx?{...r,...patch}:r))}
  async function saveRow(row,idx){setSavingId(row.assessment_item_id);setError('');try{const u=await supabase.auth.getUser();const payload={assessment_item_id:row.assessment_item_id,action_text:row.action_text||null,pic:row.pic||null,priority:row.priority||'Medium',deadline:row.deadline||null,status:row.status||'Open',completion_notes:row.completion_notes||null,verifier_status:row.verifier_status||'Pending',verifier_notes:row.verifier_notes||null,updated_at:new Date().toISOString(),created_by:u.data.user?.id||null};if(row.verifier_status==='Verified'){payload.verified_by=u.data.user?.id||null;payload.verified_at=new Date().toISOString();}const q=await supabase.from('sims_action_plans').upsert(payload,{onConflict:'assessment_item_id'}).select().single();if(q.error)throw q.error;patchRow(idx,{...q.data,item:row.item,indicator:row.indicator,criterion:row.criterion,principle:row.principle,mappings:row.mappings});setNotice('Action plan saved.');}catch(e){setError(e.message||String(e))}finally{setSavingId('')}}
  async function uploadActionEvidence(row,file){if(!file)return;setSavingId(row.assessment_item_id);setError('');try{let actionId=row.id;if(!actionId){const u=await supabase.auth.getUser();const q=await supabase.from('sims_action_plans').upsert({assessment_item_id:row.assessment_item_id,status:'Open',created_by:u.data.user?.id||null},{onConflict:'assessment_item_id'}).select().single();if(q.error)throw q.error;actionId=q.data.id;}const u=await supabase.auth.getUser();const path=`action/${actionId}/${Date.now()}-${safeName(file.name)}`;const up=await supabase.storage.from('sims-evidence').upload(path,file);if(up.error)throw up.error;const ins=await supabase.from('sims_action_evidence').insert({action_plan_id:actionId,file_name:file.name,file_path:path,file_type:file.type||null,file_size:file.size,uploaded_by:u.data.user?.id||null});if(ins.error)throw ins.error;setNotice('Completion evidence uploaded.');await openPlan();}catch(e){setError(e.message||String(e))}finally{setSavingId('')}}

  return <div className="page-wrap">
    <style>{`
      .ap-context{display:grid;grid-template-columns:1.4fr .55fr 1fr;gap:12px;align-items:end;background:#fff;border:1px solid #dce8e0;border-radius:15px;padding:15px;margin-bottom:16px}.ap-field span{display:block;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#718379;margin-bottom:5px}.ap-field select,.ap-field input{width:100%;height:39px;border:1px solid #d7e3dc;border-radius:9px;padding:0 10px;background:#fff;color:#244735}.ap-master{padding:9px 11px;border-radius:10px;background:#f3f8f5;border:1px solid #dce9e1}.ap-master small{display:block;color:#718379}.ap-master strong{font-size:12px}.ap-flow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:8px 0 18px}.ap-flow span{font-size:10px;font-weight:800;padding:5px 8px;border-radius:999px;background:#edf7f1;color:#1b5d3e}.ap-flow b{color:#9aaba1}.ap-mapchips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.ap-mapchip{font-size:9px;padding:4px 7px;border-radius:999px;background:#eef4ff;color:#365f8f;font-weight:800}.ap-source{font-size:10px;color:#718379;margin-top:4px}.ap-cards{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:15px}.ap-card{background:#fff;border:1px solid #dce8e0;border-radius:12px;padding:12px}.ap-card:first-child{background:#0d5137;color:#fff}.ap-card small{display:block;opacity:.72}.ap-card strong{font-size:23px}.ap-empty{background:#fff;border:1px dashed #cfded5;border-radius:14px;padding:28px;text-align:center;color:#718379}.ap-empty strong{display:block;color:#244735;margin-bottom:5px}@media(max-width:900px){.ap-context{grid-template-columns:1fr 1fr}.ap-master{grid-column:1/-1}.ap-cards{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.ap-context,.ap-cards{grid-template-columns:1fr}.ap-master{grid-column:auto}}
    `}</style>
    <div className="page-heading"><div><div className={styles.eyebrow}>SIMS · NDPE CORRECTIVE ACTION</div><h1>Sustainability Action Plan</h1><p>Semua indikator NDPE berstatus Not Fulfilled otomatis masuk ke action plan. Tidak perlu memilih standard lagi.</p></div></div>
    <div className="ap-flow"><span>NDPE Assessment</span><b>→</b><span>Gap</span><b>→</b><span>Corrective Action</span><b>→</b><span>Verification</span><b>→</b><span>Standard Compliance</span></div>
    <section className="ap-context">
      <label className="ap-field"><span>Company / PT</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Pilih Company / PT</option>{companies.map(x=><option key={x.id} value={x.id}>{x.company_code} — {x.company_name}</option>)}</select></label>
      <label className="ap-field"><span>Assessment Year</span><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
      <div className="ap-master"><small>Source Assessment</small><strong>{standard?.name||'NDPE Policy — KPN IMIS'}</strong></div>
    </section>
    {error?<div className="sync-error"><strong>SIMS error</strong><span>{error}</span></div>:null}{notice?<div className={styles.notice}>{notice}</div>:null}{loading?<div className={styles.notice}>Loading NDPE gaps…</div>:null}
    {!loading&&assessment?<><section className="ap-cards"><div className="ap-card"><small>Total NDPE Gap</small><strong>{stats.total}</strong></div><div className="ap-card"><small>Open</small><strong>{stats.open}</strong></div><div className="ap-card"><small>Overdue</small><strong>{stats.overdue}</strong></div><div className="ap-card"><small>Critical Open</small><strong>{stats.critical}</strong></div><div className="ap-card"><small>Completed / Closed</small><strong>{stats.completed}</strong></div></section>
      <section className={styles.actionList}>{rows.length?rows.map((r,idx)=>{const overdue=r.deadline&&r.deadline<new Date().toISOString().slice(0,10)&&!['Completed','Closed'].includes(r.status),stds=[...new Set((r.mappings||[]).map(x=>x.standard_code))];return <article className={styles.actionCard} key={r.assessment_item_id}><div className={styles.actionHead}><div><span className={styles.code}>{r.principle?.code} · {r.criterion?.code} · NDPE {r.indicator?.code}</span><h3>{r.indicator?.description||'Indicator'}</h3><div className={styles.actionMeta}>Assessment gap: {r.item?.explanation||'No explanation provided.'}</div><div className="ap-mapchips">{stds.length?stds.map(s=><span className="ap-mapchip" key={s}>{s}</span>):<span className="ap-source">Belum ada crosswalk standard untuk indikator ini.</span>}</div></div><span className={`${styles.pill} ${r.verifier_status==='Verified'?styles.good:styles.warn}`}>{r.verifier_status}</span></div><div className={styles.actionGrid}><label className="form-field"><span>Corrective Action</span><textarea rows="3" value={r.action_text||''} onChange={e=>patchRow(idx,{action_text:e.target.value})} placeholder="Describe corrective action…"/></label><label className="form-field"><span>PIC</span><input value={r.pic||''} onChange={e=>patchRow(idx,{pic:e.target.value})} placeholder="Person / function"/></label><label className="form-field"><span>Priority</span><select value={r.priority||'Medium'} onChange={e=>patchRow(idx,{priority:e.target.value})}>{PRIORITIES.map(x=><option key={x}>{x}</option>)}</select></label><label className="form-field"><span>Deadline</span><input type="date" value={r.deadline||''} onChange={e=>patchRow(idx,{deadline:e.target.value})}/>{overdue?<small className={styles.overdue}>OVERDUE</small>:null}</label><label className="form-field"><span>Action Status</span><select value={r.status||'Open'} onChange={e=>patchRow(idx,{status:e.target.value})}>{STATUSES.map(x=><option key={x}>{x}</option>)}</select></label><label className="form-field"><span>Verifier Status</span><select value={r.verifier_status||'Pending'} onChange={e=>patchRow(idx,{verifier_status:e.target.value})}>{VERIFY.map(x=><option key={x}>{x}</option>)}</select></label><label className={`form-field ${styles.actionNotes}`}><span>Completion / Verifier Notes</span><textarea rows="3" value={r.completion_notes||''} onChange={e=>patchRow(idx,{completion_notes:e.target.value})} placeholder="Completion evidence summary…"/></label><label className={`form-field ${styles.actionNotes}`}><span>Verifier Notes</span><textarea rows="2" value={r.verifier_notes||''} onChange={e=>patchRow(idx,{verifier_notes:e.target.value})} placeholder="Verification remarks…"/></label></div><div className={styles.actionFooter}><label className={styles.uploadBtn}>+ Upload Completion Evidence<input hidden type="file" onChange={e=>uploadActionEvidence(r,e.target.files?.[0])}/></label><button className="primary-btn" disabled={savingId===r.assessment_item_id} onClick={()=>saveRow(r,idx)}>{savingId===r.assessment_item_id?'Saving…':'Save Action'}</button></div></article>}) : <div className="ap-empty"><strong>Tidak ada gap NDPE aktif.</strong><span>Indikator yang diubah menjadi Not Fulfilled pada NDPE Policy akan muncul otomatis di sini.</span></div>}</section>
    </>:!loading&&companyId?<div className="ap-empty"><strong>Belum ada assessment NDPE.</strong><span>Isi NDPE Policy & Report untuk PT dan tahun ini terlebih dahulu.</span></div>:<div className="ap-empty"><strong>Select Company / PT</strong><span>Pilih PT untuk melihat seluruh gap NDPE dan corrective action.</span></div>}
  </div>
}
