'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../../lib/supabaseClient';
import styles from '../sims.module.css';

const PRIORITIES=['Low','Medium','High','Critical'];
const STATUSES=['Open','In Progress','Completed','Closed'];
const VERIFY=['Pending','Verified','Need Revision'];
const VIEWS=['Active','Closed','All'];
const safeName=v=>String(v||'file').replace(/[^a-zA-Z0-9._-]+/g,'_');
const isClosedStatus=v=>['Completed','Closed'].includes(v);

export default function SustainabilityActionPlan(){
  const [companies,setCompanies]=useState([]),[companyId,setCompanyId]=useState(''),[year,setYear]=useState(new Date().getFullYear());
  const [standard,setStandard]=useState(null),[assessment,setAssessment]=useState(null),[rows,setRows]=useState([]),[view,setView]=useState('Active');
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
  const stats=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10);
    const total=rows.length;
    const active=rows.filter(r=>r.item?.self_status==='Not Fulfilled').length;
    const open=rows.filter(r=>!isClosedStatus(r.status)).length;
    const overdue=rows.filter(r=>r.deadline&&r.deadline<today&&!isClosedStatus(r.status)).length;
    const critical=rows.filter(r=>r.priority==='Critical'&&!isClosedStatus(r.status)).length;
    const closedVerified=rows.filter(r=>isClosedStatus(r.status)&&r.verifier_status==='Verified'&&r.item?.self_status==='Fulfilled'&&r.item?.verifier_status==='Verified').length;
    return{total,active,open,overdue,critical,closedVerified};
  },[rows]);

  const visibleRows=useMemo(()=>{
    if(view==='All')return rows;
    if(view==='Closed')return rows.filter(r=>isClosedStatus(r.status)&&r.verifier_status==='Verified'&&r.item?.self_status==='Fulfilled');
    return rows.filter(r=>r.item?.self_status==='Not Fulfilled'||!isClosedStatus(r.status)||r.verifier_status!=='Verified');
  },[rows,view]);

  async function openPlan(){
    if(!companyId||!standard?.id)return;
    setLoading(true);setError('');setNotice('');
    try{
      const a=await supabase.from('sims_assessments').select('*').eq('company_id',companyId).eq('standard_id',standard.id).eq('assessment_year',Number(year)).maybeSingle();
      if(a.error)throw a.error;
      if(!a.data){setAssessment(null);setRows([]);setNotice('Belum ada assessment NDPE untuk PT dan tahun ini. Isi NDPE Policy & Report terlebih dahulu.');return;}
      setAssessment(a.data);

      const items=await supabase.from('sims_assessment_items').select('*').eq('assessment_id',a.data.id);
      if(items.error)throw items.error;
      const allItems=items.data||[];
      const allItemIds=allItems.map(x=>x.id);
      const acts=allItemIds.length?await supabase.from('sims_action_plans').select('*').in('assessment_item_id',allItemIds):{data:[]};
      if(acts.error)throw acts.error;
      const actBy=Object.fromEntries((acts.data||[]).map(x=>[x.assessment_item_id,x]));

      const relevantItems=allItems.filter(x=>x.self_status==='Not Fulfilled'||actBy[x.id]);
      if(!relevantItems.length){setRows([]);return;}

      const indIds=[...new Set(relevantItems.map(x=>x.indicator_id))];
      const [inds,maps]=await Promise.all([
        supabase.from('sims_indicators').select('id,code,description,criterion_id').in('id',indIds),
        supabase.from('sims_report_standard_mappings').select('indicator_id,standard_code,standard_name,requirement_reference').in('indicator_id',indIds).eq('active',true)
      ]);
      if(inds.error||maps.error)throw(inds.error||maps.error);

      const critIds=[...new Set((inds.data||[]).map(x=>x.criterion_id))];
      const crit=critIds.length?await supabase.from('sims_criteria').select('id,code,title,principle_id').in('id',critIds):{data:[]};
      if(crit.error)throw crit.error;
      const pids=[...new Set((crit.data||[]).map(x=>x.principle_id))];
      const prin=pids.length?await supabase.from('sims_principles').select('id,code,title').in('id',pids):{data:[]};
      if(prin.error)throw prin.error;

      const actionIds=(acts.data||[]).map(x=>x.id);
      const ae=actionIds.length?await supabase.from('sims_action_evidence').select('id,action_plan_id').in('action_plan_id',actionIds):{data:[]};
      if(ae.error)throw ae.error;
      const evidenceCount={};(ae.data||[]).forEach(x=>evidenceCount[x.action_plan_id]=(evidenceCount[x.action_plan_id]||0)+1);

      const indBy=Object.fromEntries((inds.data||[]).map(x=>[x.id,x]));
      const critBy=Object.fromEntries((crit.data||[]).map(x=>[x.id,x]));
      const prinBy=Object.fromEntries((prin.data||[]).map(x=>[x.id,x]));
      const mapBy={};(maps.data||[]).forEach(m=>(mapBy[m.indicator_id]??=[]).push(m));

      setRows(relevantItems.map(it=>{
        const ind=indBy[it.indicator_id],cr=ind?critBy[ind.criterion_id]:null,pr=cr?prinBy[cr.principle_id]:null;
        const ac=actBy[it.id]||{id:null,assessment_item_id:it.id,action_text:'',pic:'',priority:'Medium',deadline:'',status:'Open',completion_notes:'',verifier_status:'Pending',verifier_notes:''};
        return{...ac,item:it,indicator:ind,criterion:cr,principle:pr,mappings:mapBy[it.indicator_id]||[],completion_evidence_count:ac.id?evidenceCount[ac.id]||0:0};
      }));
    }catch(e){setError(e.message||String(e))}finally{setLoading(false)}
  }

  useEffect(()=>{if(companyId&&standard?.id)openPlan();else{setAssessment(null);setRows([])}},[companyId,year,standard?.id]);
  function patchRow(idx,patch){setRows(v=>v.map((r,i)=>i===idx?{...r,...patch}:r))}

  async function saveRow(row){
    setSavingId(row.assessment_item_id);setError('');setNotice('');
    try{
      const u=await supabase.auth.getUser();
      const userId=u.data.user?.id||null;
      const now=new Date().toISOString();
      const closure=isClosedStatus(row.status)&&row.verifier_status==='Verified';
      const payload={assessment_item_id:row.assessment_item_id,action_text:row.action_text||null,pic:row.pic||null,priority:row.priority||'Medium',deadline:row.deadline||null,status:row.status||'Open',completion_notes:row.completion_notes||null,verifier_status:row.verifier_status||'Pending',verifier_notes:row.verifier_notes||null,updated_at:now,created_by:userId};
      if(row.verifier_status==='Verified'){payload.verified_by=userId;payload.verified_at=now}else{payload.verified_by=null;payload.verified_at=null}

      const q=await supabase.from('sims_action_plans').upsert(payload,{onConflict:'assessment_item_id'}).select().single();
      if(q.error)throw q.error;

      const itemPatch=closure?{self_status:'Fulfilled',verifier_status:'Verified',updated_by:userId,updated_at:now,verified_by:userId,verified_at:now}:{self_status:'Not Fulfilled',verifier_status:row.verifier_status==='Need Revision'?'Need Revision':'Pending',updated_by:userId,updated_at:now,verified_by:null,verified_at:null};
      const sync=await supabase.from('sims_assessment_items').update(itemPatch).eq('id',row.assessment_item_id);
      if(sync.error)throw sync.error;

      setNotice(closure?`NDPE ${row.indicator?.code||''} closed: status otomatis menjadi Fulfilled + Verified. Compliance akan mengikuti status terbaru.`:`Action ${row.indicator?.code||''} tersimpan. NDPE tetap/menjadi Not Fulfilled sampai action Completed/Closed dan Verified.`);
      await openPlan();
    }catch(e){setError(e.message||String(e))}finally{setSavingId('')}
  }

  async function uploadActionEvidence(row,file){
    if(!file)return;setSavingId(row.assessment_item_id);setError('');
    try{
      let actionId=row.id;
      const u=await supabase.auth.getUser();
      const userId=u.data.user?.id||null;
      if(!actionId){const q=await supabase.from('sims_action_plans').upsert({assessment_item_id:row.assessment_item_id,status:'Open',verifier_status:'Pending',created_by:userId},{onConflict:'assessment_item_id'}).select().single();if(q.error)throw q.error;actionId=q.data.id;}
      const path=`action/${actionId}/${Date.now()}-${safeName(file.name)}`;
      const up=await supabase.storage.from('sims-evidence').upload(path,file);if(up.error)throw up.error;
      const ins=await supabase.from('sims_action_evidence').insert({action_plan_id:actionId,file_name:file.name,file_path:path,file_type:file.type||null,file_size:file.size,uploaded_by:userId});
      if(ins.error)throw ins.error;
      setNotice('Completion evidence uploaded.');await openPlan();
    }catch(e){setError(e.message||String(e))}finally{setSavingId('')}
  }

  return <div className="page-wrap">
    <style>{`
      .ap-context{display:grid;grid-template-columns:1.4fr .55fr 1fr;gap:14px;align-items:end;background:#fff;border:1px solid #dce8e0;border-radius:15px;padding:20px;margin-bottom:20px}.ap-field span{display:block;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#718379;margin-bottom:7px}.ap-field select,.ap-field input{width:100%;height:43px;border:1px solid #d7e3dc;border-radius:9px;padding:0 11px;background:#fff;color:#244735}.ap-master{padding:11px 13px;border-radius:10px;background:#f3f8f5;border:1px solid #dce9e1;min-height:43px}.ap-master small{display:block;color:#718379}.ap-master strong{font-size:12px}.ap-flow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:10px 0 22px}.ap-flow span{font-size:10px;font-weight:800;padding:6px 9px;border-radius:999px;background:#edf7f1;color:#1b5d3e}.ap-flow b{color:#9aaba1}.ap-mapchips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.ap-mapchip{font-size:9px;padding:4px 7px;border-radius:999px;background:#eef4ff;color:#365f8f;font-weight:800}.ap-source{font-size:10px;color:#718379;margin-top:4px}.ap-cards{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:18px}.ap-card{background:#fff;border:1px solid #dce8e0;border-radius:12px;padding:13px}.ap-card:first-child{background:#0d5137;color:#fff}.ap-card small{display:block;opacity:.72}.ap-card strong{font-size:23px}.ap-viewbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid #dce8e0;border-radius:12px;padding:12px 14px;margin-bottom:14px}.ap-tabs{display:flex;gap:6px;flex-wrap:wrap}.ap-tab{border:1px solid #d9e5dd;background:#f7faf8;color:#315743;border-radius:999px;padding:7px 11px;font-size:10px;font-weight:800;cursor:pointer}.ap-tab.active{background:#155d3e;color:#fff;border-color:#155d3e}.ap-rule{font-size:11px;color:#687c70}.ap-sync{margin-top:8px;font-size:10px;font-weight:800}.ap-sync.good{color:#1c6a42}.ap-sync.warn{color:#8a6400}.ap-empty{background:#fff;border:1px dashed #cfded5;border-radius:14px;padding:30px;text-align:center;color:#718379}.ap-empty strong{display:block;color:#244735;margin-bottom:5px}.ap-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ap-link{font-size:10px;font-weight:800;color:#17583a;background:#edf7f1;border:1px solid #cfe2d6;border-radius:8px;padding:7px 9px}.ap-history{font-size:10px;color:#718379;margin-top:5px}@media(max-width:1100px){.ap-cards{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.ap-context{grid-template-columns:1fr 1fr}.ap-master{grid-column:1/-1}}@media(max-width:600px){.ap-context,.ap-cards{grid-template-columns:1fr}.ap-master{grid-column:auto}}
    `}</style>

    <div className="page-heading"><div><div className={styles.eyebrow}>SIMS · NDPE CORRECTIVE ACTION</div><h1>Sustainability Action Plan</h1><p>Gap NDPE dikelola sampai closure. Saat action Completed/Closed dan Verified, NDPE serta Compliance otomatis tersinkron.</p></div></div>
    <div className="ap-flow"><span>NDPE Gap</span><b>→</b><span>Corrective Action</span><b>→</b><span>Completion Evidence</span><b>→</b><span>Verification</span><b>→</b><span>NDPE Fulfilled</span><b>→</b><span>Compliance Updated</span></div>

    <section className="ap-context">
      <label className="ap-field"><span>Company / PT</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Pilih Company / PT</option>{companies.map(x=><option key={x.id} value={x.id}>{x.company_code} — {x.company_name}</option>)}</select></label>
      <label className="ap-field"><span>Assessment Year</span><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
      <div className="ap-master"><small>Source Assessment</small><strong>{standard?.name||'NDPE Policy — KPN IMIS'}</strong></div>
    </section>

    {error?<div className="sync-error"><strong>SIMS error</strong><span>{error}</span></div>:null}
    {notice?<div className={styles.notice}>{notice}</div>:null}
    {loading?<div className={styles.notice}>Loading NDPE action & closure history…</div>:null}

    {!loading&&assessment?<>
      <section className="ap-cards">
        <div className="ap-card"><small>Total Action History</small><strong>{stats.total}</strong></div>
        <div className="ap-card"><small>Active NDPE Gap</small><strong>{stats.active}</strong></div>
        <div className="ap-card"><small>Open Action</small><strong>{stats.open}</strong></div>
        <div className="ap-card"><small>Overdue</small><strong>{stats.overdue}</strong></div>
        <div className="ap-card"><small>Critical Open</small><strong>{stats.critical}</strong></div>
        <div className="ap-card"><small>Closed + Verified</small><strong>{stats.closedVerified}</strong></div>
      </section>

      <section className="ap-viewbar">
        <div className="ap-tabs">{VIEWS.map(v=><button key={v} className={`ap-tab ${view===v?'active':''}`} onClick={()=>setView(v)}>{v}</button>)}</div>
        <div className="ap-rule">Closure rule: <strong>Completed/Closed + Verified = NDPE Fulfilled + Verified</strong>. Reopen/revision akan mengembalikan NDPE menjadi gap.</div>
      </section>

      <section className={styles.actionList}>{visibleRows.length?visibleRows.map(r=>{
        const rowIndex=rows.findIndex(x=>x.assessment_item_id===r.assessment_item_id);
        const overdue=r.deadline&&r.deadline<new Date().toISOString().slice(0,10)&&!isClosedStatus(r.status);
        const stds=[...new Set((r.mappings||[]).map(x=>x.standard_code))];
        const synced=r.item?.self_status==='Fulfilled'&&r.item?.verifier_status==='Verified'&&isClosedStatus(r.status)&&r.verifier_status==='Verified';
        return <article className={styles.actionCard} key={r.assessment_item_id}>
          <div className={styles.actionHead}><div>
            <span className={styles.code}>{r.principle?.code} · {r.criterion?.code} · NDPE {r.indicator?.code}</span>
            <h3>{r.indicator?.description||'Indicator'}</h3>
            <div className={styles.actionMeta}>Original assessment gap: {r.item?.explanation||'No explanation provided.'}</div>
            <div className="ap-mapchips">{stds.length?stds.map(s=><span className="ap-mapchip" key={s}>{s}</span>):<span className="ap-source">Belum ada crosswalk standard untuk indikator ini.</span>}</div>
            <div className={`ap-sync ${synced?'good':'warn'}`}>{synced?'✓ Synced to NDPE: Fulfilled + Verified':'NDPE current: '+(r.item?.self_status||'Not Started')+' / '+(r.item?.verifier_status||'Pending')}</div>
          </div><span className={`${styles.pill} ${r.verifier_status==='Verified'?styles.good:r.verifier_status==='Need Revision'?styles.bad:styles.warn}`}>{r.verifier_status}</span></div>

          <div className={styles.actionGrid}>
            <label className="form-field"><span>Corrective Action</span><textarea rows="3" value={r.action_text||''} onChange={e=>patchRow(rowIndex,{action_text:e.target.value})} placeholder="Describe corrective action…"/></label>
            <label className="form-field"><span>PIC</span><input value={r.pic||''} onChange={e=>patchRow(rowIndex,{pic:e.target.value})} placeholder="Person / function"/></label>
            <label className="form-field"><span>Priority</span><select value={r.priority||'Medium'} onChange={e=>patchRow(rowIndex,{priority:e.target.value})}>{PRIORITIES.map(x=><option key={x}>{x}</option>)}</select></label>
            <label className="form-field"><span>Deadline</span><input type="date" value={r.deadline||''} onChange={e=>patchRow(rowIndex,{deadline:e.target.value})}/>{overdue?<small className={styles.overdue}>OVERDUE</small>:null}</label>
            <label className="form-field"><span>Action Status</span><select value={r.status||'Open'} onChange={e=>patchRow(rowIndex,{status:e.target.value})}>{STATUSES.map(x=><option key={x}>{x}</option>)}</select></label>
            <label className="form-field"><span>Verifier Status</span><select value={r.verifier_status||'Pending'} onChange={e=>patchRow(rowIndex,{verifier_status:e.target.value})}>{VERIFY.map(x=><option key={x}>{x}</option>)}</select></label>
            <label className={`form-field ${styles.actionNotes}`}><span>Completion Notes</span><textarea rows="3" value={r.completion_notes||''} onChange={e=>patchRow(rowIndex,{completion_notes:e.target.value})} placeholder="Completion evidence summary…"/></label>
            <label className={`form-field ${styles.actionNotes}`}><span>Verifier Notes</span><textarea rows="2" value={r.verifier_notes||''} onChange={e=>patchRow(rowIndex,{verifier_notes:e.target.value})} placeholder="Verification remarks…"/></label>
          </div>

          <div className={styles.actionFooter}>
            <div><label className={styles.uploadBtn}>+ Upload Completion Evidence<input hidden type="file" onChange={e=>uploadActionEvidence(r,e.target.files?.[0])}/></label><div className="ap-history">Completion evidence: {r.completion_evidence_count||0} file(s)</div></div>
            <button className="primary-btn" disabled={savingId===r.assessment_item_id} onClick={()=>saveRow(r)}>{savingId===r.assessment_item_id?'Saving & Syncing…':'Save & Sync NDPE'}</button>
          </div>
        </article>
      }):<div className="ap-empty"><strong>{view==='Closed'?'Belum ada closed action.':'Tidak ada action pada filter ini.'}</strong><span>Gap baru dari NDPE Policy akan masuk otomatis dan closure tetap disimpan sebagai history.</span></div>}</section>

      <div className="ap-links"><Link className="ap-link" href="/sims/assessment">Open NDPE Policy</Link><Link className="ap-link" href="/sims/compliance">Open Compliance</Link></div>
    </>:!loading&&companyId?<div className="ap-empty"><strong>Belum ada assessment NDPE.</strong><span>Isi NDPE Policy & Report untuk PT dan tahun ini terlebih dahulu.</span></div>:!loading?<div className="ap-empty"><strong>Select Company / PT</strong><span>Pilih PT untuk memuat gap, action aktif, dan closure history dari assessment NDPE.</span></div>:null}
  </div>
}
