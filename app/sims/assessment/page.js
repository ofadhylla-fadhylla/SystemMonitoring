'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../../../lib/supabaseClient';
import SimsContextBar from '../../../components/SimsContextBar';
import styles from '../sims.module.css';

const SELF_STATUSES=['Not Started','Fulfilled','Not Fulfilled','N/A'];
const VERIFY_STATUSES=['Pending','Verified','Need Revision'];
const safeName=v=>String(v||'file').replace(/[^a-zA-Z0-9._-]+/g,'_');

function selfStatusClass(status){
  if(status==='Fulfilled') return styles.good;
  if(status==='Not Fulfilled') return styles.bad;
  if(status==='N/A') return styles.mutedPill;
  return styles.neutral;
}
function verifyClass(status){
  if(status==='Verified') return styles.good;
  if(status==='Need Revision') return styles.bad;
  return styles.warn;
}

export default function SustainabilityAssessment(){
  const [companies,setCompanies]=useState([]);
  const [standards,setStandards]=useState([]);
  const [companyId,setCompanyId]=useState('');
  const [standardId,setStandardId]=useState('');
  const [year,setYear]=useState(new Date().getFullYear());
  const [sites,setSites]=useState([]);
  const [assessment,setAssessment]=useState(null);
  const [principles,setPrinciples]=useState([]);
  const [criteria,setCriteria]=useState([]);
  const [indicators,setIndicators]=useState([]);
  const [items,setItems]=useState([]);
  const [evidence,setEvidence]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [masterMissing,setMasterMissing]=useState(false);
  const [openPrinciples,setOpenPrinciples]=useState({});
  const [openItems,setOpenItems]=useState({});
  const [savingId,setSavingId]=useState('');

  useEffect(()=>{loadMasters()},[]);

  async function loadMasters(){
    const ce=getSupabaseConfigError();
    if(ce||!supabase){setError(ce||'Supabase not configured.');return;}
    const [c,s]=await Promise.all([
      supabase.from('companies').select('id,company_code,company_name,region,province,status').eq('status','Active').order('company_code'),
      supabase.from('sims_standards').select('*').eq('status','Active').order('name')
    ]);
    if(c.error||s.error){setError((c.error||s.error).message);return;}
    setCompanies(c.data||[]);
    setStandards(s.data||[]);
    if(s.data?.[0]) setStandardId(s.data[0].id);
  }

  useEffect(()=>{
    if(!companyId){setSites([]);return;}
    (async()=>{
      const q=await supabase.from('sites').select('id,site_name,province,location,status').eq('company_id',companyId).eq('status','Active').order('site_name');
      if(!q.error) setSites(q.data||[]);
    })();
  },[companyId]);

  async function loadHierarchy(stdId){
    const p=await supabase.from('sims_principles').select('*').eq('standard_id',stdId).order('sort_order');
    if(p.error) throw p.error;
    const pids=(p.data||[]).map(x=>x.id);
    const c=pids.length?await supabase.from('sims_criteria').select('*').in('principle_id',pids).order('sort_order'):{data:[]};
    if(c.error) throw c.error;
    const cids=(c.data||[]).map(x=>x.id);
    const i=cids.length?await supabase.from('sims_indicators').select('*').in('criterion_id',cids).eq('active',true).order('sort_order'):{data:[]};
    if(i.error) throw i.error;
    setPrinciples(p.data||[]);
    setCriteria(c.data||[]);
    setIndicators(i.data||[]);
    return {principles:p.data||[],criteria:c.data||[],indicators:i.data||[]};
  }

  async function openAssessment(){
    if(!companyId||!standardId)return;
    setLoading(true);setError('');setNotice('');setMasterMissing(false);
    try{
      const hierarchy=await loadHierarchy(standardId);
      const inds=hierarchy.indicators;
      if(!inds.length){setAssessment(null);setItems([]);setEvidence([]);setMasterMissing(true);return;}

      let q=await supabase.from('sims_assessments').select('*').eq('company_id',companyId).eq('standard_id',standardId).eq('assessment_year',year).maybeSingle();
      if(q.error)throw q.error;
      let a=q.data;
      if(!a){
        const u=await supabase.auth.getUser();
        const ins=await supabase.from('sims_assessments').insert({company_id:companyId,standard_id:standardId,assessment_year:year,created_by:u.data.user?.id||null}).select().single();
        if(ins.error)throw ins.error;
        a=ins.data;
      }
      setAssessment(a);

      let existing=await supabase.from('sims_assessment_items').select('*').eq('assessment_id',a.id);
      if(existing.error)throw existing.error;
      const have=new Set((existing.data||[]).map(x=>x.indicator_id));
      const missing=inds.filter(x=>!have.has(x.id));
      if(missing.length){
        const u=await supabase.auth.getUser();
        const ins=await supabase.from('sims_assessment_items').insert(missing.map(x=>({assessment_id:a.id,indicator_id:x.id,updated_by:u.data.user?.id||null}))).select();
        if(ins.error)throw ins.error;
        existing={data:[...(existing.data||[]),...(ins.data||[])]};
      }
      setItems(existing.data||[]);

      const ids=(existing.data||[]).map(x=>x.id);
      const ev=ids.length?await supabase.from('sims_evidence').select('*').in('assessment_item_id',ids).order('uploaded_at',{ascending:false}):{data:[]};
      if(ev.error)throw ev.error;
      setEvidence(ev.data||[]);
      const first=hierarchy.principles[0];
      setOpenPrinciples(first?{[first.id]:true}:{});
      setOpenItems({});
    }catch(e){setError(e.message||String(e))}finally{setLoading(false)}
  }

  useEffect(()=>{
    if(companyId&&standardId)openAssessment();
    if(!companyId){
      setAssessment(null);setItems([]);setEvidence([]);setPrinciples([]);setCriteria([]);setIndicators([]);setMasterMissing(false);
    }
  },[companyId,standardId,year]);

  const itemMap=useMemo(()=>Object.fromEntries(items.map(x=>[x.indicator_id,x])),[items]);
  const criteriaByP=useMemo(()=>{const m={};criteria.forEach(x=>(m[x.principle_id]??=[]).push(x));return m},[criteria]);
  const indsByC=useMemo(()=>{const m={};indicators.forEach(x=>(m[x.criterion_id]??=[]).push(x));return m},[indicators]);
  const evidenceByItem=useMemo(()=>{const m={};evidence.forEach(x=>(m[x.assessment_item_id]??=[]).push(x));return m},[evidence]);
  const company=companies.find(x=>x.id===companyId);
  const standard=standards.find(x=>x.id===standardId);
  const counts=useMemo(()=>{
    const total=items.length;
    const verified=items.filter(x=>x.self_status==='Fulfilled'&&x.verifier_status==='Verified').length;
    const pending=items.filter(x=>x.self_status==='Fulfilled'&&x.verifier_status!=='Verified').length;
    const gaps=items.filter(x=>x.self_status==='Not Fulfilled').length;
    return{total,verified,pending,gaps,compliance:total?Math.round(verified/total*100):0};
  },[items]);

  function patchItem(id,patch){setItems(v=>v.map(x=>x.id===id?{...x,...patch}:x))}

  async function saveItem(indicatorId){
    const item=itemMap[indicatorId];if(!item)return;
    setSavingId(item.id);setError('');
    try{
      const u=await supabase.auth.getUser();
      const payload={self_status:item.self_status,explanation:item.explanation||null,verifier_status:item.verifier_status||'Pending',verifier_notes:item.verifier_notes||null,updated_by:u.data.user?.id||null,updated_at:new Date().toISOString()};
      if(item.verifier_status==='Verified'){payload.verified_by=u.data.user?.id||null;payload.verified_at=new Date().toISOString();}else{payload.verified_by=null;payload.verified_at=null;}
      const up=await supabase.from('sims_assessment_items').update(payload).eq('id',item.id);if(up.error)throw up.error;
      if(item.self_status==='Not Fulfilled'){
        const ap=await supabase.from('sims_action_plans').upsert({assessment_item_id:item.id,status:'Open',created_by:u.data.user?.id||null,updated_at:new Date().toISOString()},{onConflict:'assessment_item_id'});if(ap.error)throw ap.error;
      }
      setNotice('Assessment berhasil disimpan.');
    }catch(e){setError(e.message||String(e))}finally{setSavingId('')}
  }

  async function uploadEvidence(item,file){
    if(!file||!assessment)return;
    setSavingId(item.id);setError('');
    try{
      const u=await supabase.auth.getUser();
      const path=`${assessment.id}/${item.id}/${Date.now()}-${safeName(file.name)}`;
      const up=await supabase.storage.from('sims-evidence').upload(path,file,{upsert:false});if(up.error)throw up.error;
      const ins=await supabase.from('sims_evidence').insert({assessment_item_id:item.id,file_name:file.name,file_path:path,file_type:file.type||null,file_size:file.size,uploaded_by:u.data.user?.id||null}).select().single();if(ins.error)throw ins.error;
      setEvidence(v=>[ins.data,...v]);setNotice('Evidence berhasil di-upload.');
    }catch(e){setError(e.message||String(e))}finally{setSavingId('')}
  }

  async function openEvidence(ev){
    const s=await supabase.storage.from('sims-evidence').createSignedUrl(ev.file_path,120);
    if(s.error)setError(s.error.message);else window.open(s.data.signedUrl,'_blank','noopener,noreferrer');
  }

  function principleProgress(pr){
    const ids=(criteriaByP[pr.id]||[]).map(x=>x.id);
    const pItems=ids.flatMap(id=>indsByC[id]||[]).map(ind=>itemMap[ind.id]).filter(Boolean);
    const verified=pItems.filter(x=>x.self_status==='Fulfilled'&&x.verifier_status==='Verified').length;
    return pItems.length?Math.round(verified/pItems.length*100):0;
  }

  return <div className="page-wrap">
    <style>{`
      .sims-company-card{background:#fff;border:1px solid #dce8e0;border-radius:16px;padding:20px;margin-bottom:18px;box-shadow:0 4px 16px rgba(24,64,43,.04)}
      .sims-company-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding-bottom:16px;border-bottom:1px solid #edf2ef}
      .sims-company-head>div:first-child>span{font-size:10px;letter-spacing:.1em;color:#718379;font-weight:800}.sims-company-head h2{margin:5px 0 4px;color:#0c3f2b;font-size:20px}.sims-company-head p{margin:0;color:#7b8b82;font-size:12px}
      .sims-year-badge{min-width:64px;height:42px;border-radius:12px;background:#eef7f1;color:#17583a;display:grid;place-items:center;font-weight:800;border:1px solid #d3e8da}
      .sims-company-info{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px}.sims-company-info>div{background:#f8fbf9;border:1px solid #e5eee8;border-radius:12px;padding:12px 14px}.sims-company-info span{display:block;font-size:9px;letter-spacing:.07em;color:#7a8a81;font-weight:800;text-transform:uppercase;margin-bottom:5px}.sims-company-info strong{font-size:13px;color:#153f2d}.sims-company-info small{display:block;margin-top:5px;color:#78887f;line-height:1.35}.sims-sites{grid-column:1/-1}
      .sims-loading{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #dfe9e3;border-radius:14px;padding:18px;margin-bottom:18px}.sims-loading-dot{width:12px;height:12px;border-radius:50%;background:#1d6c49;box-shadow:0 0 0 6px #e8f4ec}.sims-loading strong,.sims-loading span{display:block}.sims-loading span{font-size:11px;color:#7a8a81;margin-top:3px}
      .sims-master-missing{display:flex;gap:14px;align-items:flex-start;background:#fff8e8;border:1px solid #eed89e;border-radius:14px;padding:17px 18px;margin-bottom:18px;color:#6d5312}.sims-master-icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#ffe5a7;font-weight:900}.sims-master-missing strong{display:block;color:#65480c}.sims-master-missing p{margin:5px 0 0;font-size:12px;line-height:1.5}
      .sims-assessment-hero{display:grid;grid-template-columns:1.1fr 1.4fr auto;gap:18px;align-items:center;background:linear-gradient(135deg,#0d5137,#0a3e2b);color:white;border-radius:18px;padding:22px;margin-bottom:20px;box-shadow:0 12px 28px rgba(9,62,42,.13)}
      .sims-score>span{font-size:10px;letter-spacing:.1em;opacity:.72}.sims-score>strong{display:block;font-size:50px;line-height:1;margin:7px 0 10px}.sims-score small{opacity:.72;font-size:10px}.sims-hero-progress{height:8px;border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden;margin-bottom:8px}.sims-hero-progress i{display:block;height:100%;background:#d7f36a;border-radius:999px}
      .sims-hero-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sims-hero-stats>div{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px}.sims-hero-stats span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.05em;opacity:.7}.sims-hero-stats strong{font-size:22px}.sims-hero-actions{display:flex;flex-direction:column;gap:8px}.sims-hero-actions .secondary-btn{background:rgba(255,255,255,.12);color:white;border:1px solid rgba(255,255,255,.18);text-align:center}.sims-hero-actions .primary-btn{background:#d7f36a;color:#173426;text-align:center}
      .sims-section-intro{display:flex;gap:12px;align-items:center;margin:4px 0 14px}.sims-section-no{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:#173f2d;color:#fff;font-weight:800}.sims-section-intro h2{margin:0 0 3px;font-size:18px;color:#143e2c}.sims-section-intro p{margin:0;color:#7b8b82;font-size:12px}
      .sims-evidence-req{background:#fff8e9;border:1px solid #eee0b7;border-radius:10px;padding:12px 14px;margin-bottom:14px}.sims-evidence-req strong{font-size:11px;color:#6e5718}.sims-evidence-req p{margin:5px 0 0;font-size:12px;line-height:1.5;color:#655d45}.sims-no-evidence{font-size:11px;color:#87958d}
      @media(max-width:1000px){.sims-company-info{grid-template-columns:1fr 1fr}.sims-assessment-hero{grid-template-columns:1fr}.sims-hero-actions{flex-direction:row}.sims-hero-stats{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:650px){.sims-company-head{flex-direction:column}.sims-company-info{grid-template-columns:1fr}.sims-sites{grid-column:auto}.sims-hero-actions{flex-direction:column}}
    `}</style>

    <div className="page-heading"><div><div className={styles.eyebrow}>SIMS · SUSTAINABILITY MANAGEMENT</div><h1>Sustainability Assessment</h1><p>Pilih PT, lalu assessment langsung dimuat dari master Principle, Criterion, dan Indicator SIMS.</p></div></div>

    <SimsContextBar {...{companies,standards,companyId,setCompanyId,standardId,setStandardId,year,setYear,onOpen:openAssessment,loading}} hideOpenButton helperText="Tidak perlu upload Excel saat assessment. Setelah PT dipilih, form assessment tampil otomatis."/>

    {error?<div className="sync-error"><strong>SIMS error</strong><span>{error}</span></div>:null}
    {notice?<div className={styles.notice}>{notice}</div>:null}

    {companyId?<section className="sims-company-card">
      <div className="sims-company-head"><div><span>INFORMASI PERUSAHAAN</span><h2>{company?.company_code} — {company?.company_name}</h2><p>Data diambil dari Master Company & Site.</p></div><div className="sims-year-badge">{year}</div></div>
      <div className="sims-company-info">
        <div><span>Company Code</span><strong>{company?.company_code||'-'}</strong></div>
        <div><span>Region</span><strong>{company?.region||'-'}</strong></div>
        <div><span>Province</span><strong>{company?.province||'-'}</strong></div>
        <div><span>Standard</span><strong>{standard?.name||'-'}</strong></div>
        <div className="sims-sites"><span>Active Site / Unit</span><strong>{sites.length}</strong><small>{sites.length?sites.map(s=>s.site_name).join(' · '):'Belum ada site aktif pada master.'}</small></div>
      </div>
    </section>:null}

    {loading?<section className="sims-loading"><div className="sims-loading-dot"></div><div><strong>Loading assessment…</strong><span>Menyiapkan indikator untuk PT yang dipilih.</span></div></section>:null}

    {!loading&&masterMissing?<section className="sims-master-missing"><div className="sims-master-icon">!</div><div><strong>Master indikator belum tersedia di database.</strong><p>User tidak perlu upload Excel. Master ISPO Permentan 33/2025 cukup dimuat satu kali oleh administrator ke Supabase, lalu seluruh PT langsung menggunakan master yang sama.</p></div></section>:null}

    {!loading&&assessment?<>
      <section className="sims-assessment-hero">
        <div className="sims-score"><span>OVERALL COMPLIANCE</span><strong>{counts.compliance}%</strong><div className="sims-hero-progress"><i style={{width:`${counts.compliance}%`}}/></div><small>Fulfilled + Verified / total active indicator</small></div>
        <div className="sims-hero-stats"><div><span>Total Indicator</span><strong>{counts.total}</strong></div><div><span>Verified</span><strong>{counts.verified}</strong></div><div><span>Need Review</span><strong>{counts.pending}</strong></div><div><span>Gap</span><strong>{counts.gaps}</strong></div></div>
        <div className="sims-hero-actions"><Link href="/sims/action-plan" className="secondary-btn">Open Action Plan</Link><Link href="/sims/compliance" className="primary-btn">View Compliance</Link></div>
      </section>

      <section className="sims-section-intro"><div className="sims-section-no">1</div><div><h2>Sustainability Assessment</h2><p>Isi status, penjelasan, evidence, dan verification untuk setiap indikator.</p></div></section>

      <section className={styles.tree}>
        {principles.map(pr=>{
          const pPct=principleProgress(pr),isOpen=!!openPrinciples[pr.id];
          return <article className={styles.principle} key={pr.id}>
            <button className={styles.principleHead} onClick={()=>setOpenPrinciples(v=>({...v,[pr.id]:!v[pr.id]}))}>
              <div><span className={styles.code}>PRINCIPLE {pr.code}</span><h2>{pr.title}</h2></div>
              <div className={styles.progressWrap}><div className={styles.progress}><i style={{width:`${pPct}%`}}/></div><strong>{pPct}%</strong><span>{isOpen?'−':'+'}</span></div>
            </button>
            {isOpen?<div className={styles.criteriaList}>
              {(criteriaByP[pr.id]||[]).map(cr=>{
                const cIndicators=indsByC[cr.id]||[];
                const cVerified=cIndicators.filter(ind=>{const it=itemMap[ind.id];return it?.self_status==='Fulfilled'&&it?.verifier_status==='Verified'}).length;
                const cPct=cIndicators.length?Math.round(cVerified/cIndicators.length*100):0;
                return <section className={styles.criterion} key={cr.id}>
                  <div className={styles.criterionHead}><div><span className={styles.code}>CRITERION {cr.code}</span><h3>{cr.title}</h3></div><span>{cPct}% compliant</span></div>
                  <div className={styles.indicatorList}>
                    {cIndicators.map(ind=>{
                      const item=itemMap[ind.id];if(!item)return null;
                      const isItemOpen=!!openItems[ind.id],files=evidenceByItem[item.id]||[];
                      return <div className={styles.indicator} key={ind.id}>
                        <button className={styles.indicatorRow} onClick={()=>setOpenItems(v=>({...v,[ind.id]:!v[ind.id]}))}><span className={styles.code}>{ind.code}</span><span className={styles.indicatorText}>{ind.description}</span><span className={`${styles.pill} ${selfStatusClass(item.self_status)}`}>{item.self_status}</span><span>{isItemOpen?'−':'+'}</span></button>
                        {isItemOpen?<div className={styles.editor}>
                          <div className={styles.requirement}><strong>INDICATOR REQUIREMENT</strong><p>{ind.description}</p></div>
                          {ind.object_evidence?<div className="sims-evidence-req"><strong>OBJECT EVIDENCE</strong><p>{ind.object_evidence}</p></div>:null}
                          <div className={styles.editorGrid}>
                            <label className="form-field"><span>Assessment Status</span><select value={item.self_status||'Not Started'} onChange={e=>patchItem(item.id,{self_status:e.target.value})}>{SELF_STATUSES.map(x=><option key={x}>{x}</option>)}</select></label>
                            <label className="form-field"><span>Verifier Status</span><select value={item.verifier_status||'Pending'} onChange={e=>patchItem(item.id,{verifier_status:e.target.value})}>{VERIFY_STATUSES.map(x=><option key={x}>{x}</option>)}</select></label>
                            <label className={`form-field ${styles.full}`}><span>User Explanation</span><textarea rows="3" value={item.explanation||''} onChange={e=>patchItem(item.id,{explanation:e.target.value})} placeholder="Jelaskan pemenuhan indikator atau gap yang ditemukan…"/></label>
                            <label className={`form-field ${styles.full}`}><span>Verifier Notes</span><textarea rows="2" value={item.verifier_notes||''} onChange={e=>patchItem(item.id,{verifier_notes:e.target.value})} placeholder="Catatan verifikasi…"/></label>
                          </div>
                          <div className={styles.evidenceBox}><div><strong>Supporting Evidence</strong><span>{files.length} file(s)</span></div><div className={styles.evidenceList}>{files.length?files.map(ev=><button key={ev.id} className={styles.fileChip} onClick={()=>openEvidence(ev)}>{ev.file_name}</button>):<span className="sims-no-evidence">Belum ada evidence.</span>}</div><label className={styles.uploadBtn}>+ Upload Evidence<input hidden type="file" onChange={e=>uploadEvidence(item,e.target.files?.[0])}/></label></div>
                          <div className={styles.saveRow}><button className="primary-btn" disabled={savingId===item.id} onClick={()=>saveItem(ind.id)}>{savingId===item.id?'Saving…':'Save Assessment'}</button><span className={`${styles.pill} ${verifyClass(item.verifier_status)}`}>{item.verifier_status}</span>{item.self_status==='Not Fulfilled'?<span className={styles.gapNote}>Gap ini otomatis masuk Sustainability Action Plan.</span>:null}</div>
                        </div>:null}
                      </div>
                    })}
                  </div>
                </section>
              })}
            </div>:null}
          </article>
        })}
      </section>
    </>:null}

    {!loading&&!companyId?<section className={styles.empty}><strong>Select Company / PT</strong><span>Pilih PT pada bagian atas. Assessment akan terbuka otomatis tanpa upload Excel.</span></section>:null}
  </div>
}
