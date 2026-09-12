'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../../lib/supabaseClient';
import SimsContextBar from '../../../components/SimsContextBar';
import styles from '../sims.module.css';

const SELF_STATUSES=['Not Started','Fulfilled','Not Fulfilled','N/A'];
const VERIFY_STATUSES=['Pending','Verified','Need Revision'];
const norm=v=>String(v??'').trim();
const key=v=>norm(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
const safeName=v=>String(v||'file').replace(/[^a-zA-Z0-9._-]+/g,'_');

function findColumn(headers, patterns){
  const hs=headers.map((h,i)=>({i,k:key(h),raw:String(h||'')}));
  for(const p of patterns){const f=hs.find(x=>x.k.includes(p));if(f)return f.i;}return -1;
}
function classifyCode(code){const c=norm(code);if(!c)return '';const parts=c.split(/[.\-]/).filter(Boolean);if(parts.length<=1)return 'principle';if(parts.length===2)return 'criterion';return 'indicator';}
function parseWorkbookSheet(sheet,XLSX){
  const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
  if(!grid.length)return[];
  let headerRow=0,best=-1;
  for(let r=0;r<Math.min(30,grid.length);r++){
    const joined=grid[r].map(key);let score=0;
    ['prinsip','principle','kriteria','criteria','criterion','indikator','indicator','evidence','bukti','code','kode'].forEach(w=>{if(joined.some(v=>v.includes(w)))score++});
    if(score>best){best=score;headerRow=r;}
  }
  const headers=grid[headerRow].map(v=>String(v||''));
  const pCode=findColumn(headers,['kodeprinsip','codeprinsip','principlecode','prinsipcode']);
  const pName=findColumn(headers,['prinsip','principle']);
  const cCode=findColumn(headers,['kodekriteria','codekriteria','criterioncode','criteriacode']);
  const cName=findColumn(headers,['kriteria','criterion','criteria']);
  const iCode=findColumn(headers,['kodeindikator','codeindikator','indicatorcode']);
  const iName=findColumn(headers,['indikator','indicator']);
  const ev=findColumn(headers,['objectevidence','evidence','bukti','dokumen']);
  const genericCode=findColumn(headers,['kode','code']);
  const genericDesc=findColumn(headers,['deskripsi','description','uraian','requirement','persyaratan']);
  let lastPCode='',lastPName='',lastCCode='',lastCName='';const out=[];
  for(let r=headerRow+1;r<grid.length;r++){
    const row=grid[r];
    let pc=pCode>=0?norm(row[pCode]):'',pn=pName>=0?norm(row[pName]):'';
    let cc=cCode>=0?norm(row[cCode]):'',cn=cName>=0?norm(row[cName]):'';
    let ic=iCode>=0?norm(row[iCode]):'',id=iName>=0?norm(row[iName]):'';
    const evidence=ev>=0?norm(row[ev]):'';
    if((iName<0||iCode<0)&&genericCode>=0){
      const gc=norm(row[genericCode]),gd=genericDesc>=0?norm(row[genericDesc]):'';const level=classifyCode(gc);
      if(level==='principle'){pc=gc;pn=gd;}
      if(level==='criterion'){cc=gc;cn=gd;}
      if(level==='indicator'){ic=gc;id=gd;}
    }
    if(pc){lastPCode=pc;lastPName=pn||lastPName;} else if(pn){lastPName=pn;}
    if(cc){lastCCode=cc;lastCName=cn||lastCName;} else if(cn){lastCName=cn;}
    if(ic||id){
      out.push({principle_code:lastPCode||'P?',principle_title:lastPName||'Principle',criterion_code:lastCCode||`${lastPCode||'P?'}.?`,criterion_title:lastCName||'Criterion',indicator_code:ic||`${lastCCode||'C?'}.${out.length+1}`,indicator_description:id||'Indicator',object_evidence:evidence});
    }
  }
  return out.filter(x=>x.indicator_description&&x.indicator_description!=='Indicator');
}

export default function SustainabilityAssessment(){
  const [companies,setCompanies]=useState([]),[standards,setStandards]=useState([]),[companyId,setCompanyId]=useState(''),[standardId,setStandardId]=useState(''),[year,setYear]=useState(new Date().getFullYear());
  const [assessment,setAssessment]=useState(null),[principles,setPrinciples]=useState([]),[criteria,setCriteria]=useState([]),[indicators,setIndicators]=useState([]),[items,setItems]=useState([]),[evidence,setEvidence]=useState([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[openPrinciples,setOpenPrinciples]=useState({}),[openItems,setOpenItems]=useState({}),[savingId,setSavingId]=useState('');
  const [importOpen,setImportOpen]=useState(false),[importFile,setImportFile]=useState(null),[sheetNames,setSheetNames]=useState([]),[sheetName,setSheetName]=useState(''),[parsedRows,setParsedRows]=useState([]),[importing,setImporting]=useState(false);

  useEffect(()=>{loadMasters()},[]);
  async function loadMasters(){
    const ce=getSupabaseConfigError();if(ce||!supabase){setError(ce||'Supabase not configured.');return;}
    const [c,s]=await Promise.all([supabase.from('companies').select('id,company_code,company_name,status').eq('status','Active').order('company_code'),supabase.from('sims_standards').select('*').eq('status','Active').order('name')]);
    if(c.error||s.error)setError((c.error||s.error).message);setCompanies(c.data||[]);setStandards(s.data||[]);if(!standardId&&s.data?.[0])setStandardId(s.data[0].id);
  }
  async function loadHierarchy(stdId){
    const p=await supabase.from('sims_principles').select('*').eq('standard_id',stdId).order('sort_order');if(p.error)throw p.error;
    const pids=(p.data||[]).map(x=>x.id);const c=pids.length?await supabase.from('sims_criteria').select('*').in('principle_id',pids).order('sort_order'):{data:[]};if(c.error)throw c.error;
    const cids=(c.data||[]).map(x=>x.id);const i=cids.length?await supabase.from('sims_indicators').select('*').in('criterion_id',cids).eq('active',true).order('sort_order'):{data:[]};if(i.error)throw i.error;
    setPrinciples(p.data||[]);setCriteria(c.data||[]);setIndicators(i.data||[]);return i.data||[];
  }
  async function openAssessment(){
    setLoading(true);setError('');setNotice('');try{
      const inds=await loadHierarchy(standardId);if(!inds.length){setAssessment(null);setImportOpen(true);setNotice('Master indicator belum tersedia. Upload workbook ISPO Permentan 33/2025 melalui Import Master Excel.');return;}
      let q=await supabase.from('sims_assessments').select('*').eq('company_id',companyId).eq('standard_id',standardId).eq('assessment_year',year).maybeSingle();
      if(q.error)throw q.error;let a=q.data;
      if(!a){const u=await supabase.auth.getUser();const ins=await supabase.from('sims_assessments').insert({company_id:companyId,standard_id:standardId,assessment_year:year,created_by:u.data.user?.id||null}).select().single();if(ins.error)throw ins.error;a=ins.data;}
      setAssessment(a);
      let existing=await supabase.from('sims_assessment_items').select('*').eq('assessment_id',a.id);if(existing.error)throw existing.error;
      const have=new Set((existing.data||[]).map(x=>x.indicator_id));const missing=inds.filter(x=>!have.has(x.id));
      if(missing.length){const u=await supabase.auth.getUser();const ins=await supabase.from('sims_assessment_items').insert(missing.map(x=>({assessment_id:a.id,indicator_id:x.id,updated_by:u.data.user?.id||null}))).select();if(ins.error)throw ins.error;existing={data:[...(existing.data||[]),...(ins.data||[])]};}
      setItems(existing.data||[]);const ids=(existing.data||[]).map(x=>x.id);const ev=ids.length?await supabase.from('sims_evidence').select('*').in('assessment_item_id',ids).order('uploaded_at',{ascending:false}):{data:[]};if(ev.error)throw ev.error;setEvidence(ev.data||[]);
      setOpenPrinciples(Object.fromEntries((principles||[]).slice(0,1).map(x=>[x.id,true])));
    }catch(e){setError(e.message||String(e))}finally{setLoading(false)}
  }
  useEffect(()=>{if(assessment&&standardId)loadHierarchy(standardId)},[standardId]);
  const itemMap=useMemo(()=>Object.fromEntries(items.map(x=>[x.indicator_id,x])),[items]);
  const criteriaByP=useMemo(()=>{const m={};criteria.forEach(x=>(m[x.principle_id]??=[]).push(x));return m},[criteria]);
  const indsByC=useMemo(()=>{const m={};indicators.forEach(x=>(m[x.criterion_id]??=[]).push(x));return m},[indicators]);
  const company=companies.find(x=>x.id===companyId),standard=standards.find(x=>x.id===standardId);
  const counts=useMemo(()=>{const total=items.length,fulfilled=items.filter(x=>x.self_status==='Fulfilled').length,verified=items.filter(x=>x.self_status==='Fulfilled'&&x.verifier_status==='Verified').length,gaps=items.filter(x=>x.self_status==='Not Fulfilled').length;return{total,fulfilled,verified,gaps,compliance:total?Math.round(verified/total*100):0}},[items]);

  function patchItem(id,patch){setItems(v=>v.map(x=>x.id===id?{...x,...patch}:x))}
  async function saveItem(indicatorId){
    const item=itemMap[indicatorId];if(!item)return;setSavingId(item.id);setError('');try{
      const u=await supabase.auth.getUser();const payload={self_status:item.self_status,explanation:item.explanation||null,verifier_status:item.verifier_status||'Pending',verifier_notes:item.verifier_notes||null,updated_by:u.data.user?.id||null,updated_at:new Date().toISOString()};
      if(item.verifier_status==='Verified'){payload.verified_by=u.data.user?.id||null;payload.verified_at=new Date().toISOString();}
      const up=await supabase.from('sims_assessment_items').update(payload).eq('id',item.id);if(up.error)throw up.error;
      if(item.self_status==='Not Fulfilled'){const ap=await supabase.from('sims_action_plans').upsert({assessment_item_id:item.id,status:'Open',created_by:u.data.user?.id||null},{onConflict:'assessment_item_id'});if(ap.error)throw ap.error;}
      setNotice('Assessment indicator saved.');
    }catch(e){setError(e.message||String(e))}finally{setSavingId('')}
  }
  async function uploadEvidence(item,file){
    if(!file)return;setSavingId(item.id);setError('');try{const u=await supabase.auth.getUser();const path=`${assessment.id}/${item.id}/${Date.now()}-${safeName(file.name)}`;const up=await supabase.storage.from('sims-evidence').upload(path,file,{upsert:false});if(up.error)throw up.error;const ins=await supabase.from('sims_evidence').insert({assessment_item_id:item.id,file_name:file.name,file_path:path,file_type:file.type||null,file_size:file.size,uploaded_by:u.data.user?.id||null}).select().single();if(ins.error)throw ins.error;setEvidence(v=>[ins.data,...v]);setNotice('Evidence uploaded.');}catch(e){setError(e.message||String(e))}finally{setSavingId('')}
  }
  async function openEvidence(ev){const s=await supabase.storage.from('sims-evidence').createSignedUrl(ev.file_path,120);if(s.error)setError(s.error.message);else window.open(s.data.signedUrl,'_blank','noopener,noreferrer')}

  async function inspectExcel(file){
    setImportFile(file);setParsedRows([]);setSheetNames([]);setSheetName('');if(!file)return;setError('');try{const XLSX=await import('xlsx');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});setSheetNames(wb.SheetNames);const preferred=wb.SheetNames.find(n=>/ispo|draft|33/i.test(n))||wb.SheetNames[0];setSheetName(preferred);setParsedRows(parseWorkbookSheet(wb.Sheets[preferred],XLSX));}catch(e){setError(`Excel parse failed: ${e.message}`)}
  }
  async function changeSheet(name){setSheetName(name);if(!importFile)return;try{const XLSX=await import('xlsx');const wb=XLSX.read(await importFile.arrayBuffer(),{type:'array'});setParsedRows(parseWorkbookSheet(wb.Sheets[name],XLSX));}catch(e){setError(e.message)} }
  async function importMaster(){
    if(!standardId||!parsedRows.length)return;setImporting(true);setError('');setNotice('');try{
      const pMap={},cMap={};let pOrder=0,cOrder=0,iOrder=0;
      for(const r of parsedRows){
        const pk=r.principle_code||r.principle_title;if(!pMap[pk]){const x=await supabase.from('sims_principles').upsert({standard_id:standardId,code:r.principle_code||pk,title:r.principle_title||pk,sort_order:++pOrder},{onConflict:'standard_id,code'}).select().single();if(x.error)throw x.error;pMap[pk]=x.data;}
        const ck=`${pMap[pk].id}|${r.criterion_code||r.criterion_title}`;if(!cMap[ck]){const x=await supabase.from('sims_criteria').upsert({principle_id:pMap[pk].id,code:r.criterion_code||r.criterion_title,title:r.criterion_title||r.criterion_code,sort_order:++cOrder},{onConflict:'principle_id,code'}).select().single();if(x.error)throw x.error;cMap[ck]=x.data;}
        const x=await supabase.from('sims_indicators').upsert({criterion_id:cMap[ck].id,code:r.indicator_code,description:r.indicator_description,object_evidence:r.object_evidence||null,sort_order:++iOrder,source_name:importFile?.name||'SIMS source workbook',active:true},{onConflict:'criterion_id,code'});if(x.error)throw x.error;
      }
      setNotice(`${parsedRows.length} indicator rows imported from ${sheetName}.`);setImportOpen(false);await loadHierarchy(standardId);
    }catch(e){setError(`Import failed: ${e.message}`)}finally{setImporting(false)}
  }

  return <div className="page-wrap">
    <div className="page-heading"><div><div className={styles.eyebrow}>SIMS · SUSTAINABILITY MANAGEMENT</div><h1>Sustainability Assessment</h1><p>Select a company, standard and assessment year, then review each Principle, Criterion and Indicator with supporting evidence.</p></div><button className="secondary-btn" onClick={()=>setImportOpen(v=>!v)}>Import Master Excel</button></div>
    <SimsContextBar {...{companies,standards,companyId,setCompanyId,standardId,setStandardId,year,setYear,onOpen:openAssessment,loading}} />
    {error?<div className="sync-error"><strong>SIMS error</strong><span>{error}</span></div>:null}{notice?<div className={styles.notice}>{notice}</div>:null}
    {importOpen?<section className={`panel ${styles.importPanel}`}><div className="panel-head"><div><h2>Import Principle / Criterion / Indicator</h2><p>Use the KPN workbook for ISPO Permentan 33/2025. Select the relevant sheet before importing.</p></div></div><div className={styles.importGrid}><label className="form-field"><span>Excel workbook</span><input type="file" accept=".xlsx,.xls" onChange={e=>inspectExcel(e.target.files?.[0])}/></label><label className="form-field"><span>Sheet</span><select value={sheetName} onChange={e=>changeSheet(e.target.value)} disabled={!sheetNames.length}><option value="">Select sheet…</option>{sheetNames.map(n=><option key={n}>{n}</option>)}</select></label><div className={styles.importSummary}><strong>{parsedRows.length}</strong><span>indicator rows detected</span></div><button className="primary-btn" disabled={!parsedRows.length||importing||!standardId} onClick={importMaster}>{importing?'Importing…':'Import Master'}</button></div>{parsedRows.length?<div className={styles.preview}><strong>Preview:</strong> {parsedRows.slice(0,3).map(x=>`${x.indicator_code} ${x.indicator_description}`).join(' · ')}</div>:null}</section>:null}
    {assessment?<>
      <section className={styles.contextSummary}><div><span>Company</span><strong>{company?.company_code} — {company?.company_name}</strong></div><div><span>Standard</span><strong>{standard?.name}</strong></div><div><span>Assessment</span><strong>{year}</strong></div></section>
      <section className={styles.kpis}><div><span>Overall Compliance</span><strong>{counts.compliance}%</strong></div><div><span>Verified Fulfilled</span><strong>{counts.verified}</strong><small>of {counts.total} indicators</small></div><div><span>Self Fulfilled</span><strong>{counts.fulfilled}</strong></div><div><span>Action Required</span><strong>{counts.gaps}</strong></div></section>
      <section className={styles.tree}>{principles.map(p=>{const pcs=criteriaByP[p.id]||[];const pinds=pcs.flatMap(c=>indsByC[c.id]||[]);const pv=pinds.filter(i=>{const it=itemMap[i.id];return it?.self_status==='Fulfilled'&&it?.verifier_status==='Verified'}).length;const pct=pinds.length?Math.round(pv/pinds.length*100):0;return <article className={styles.principle} key={p.id}><button className={styles.principleHead} onClick={()=>setOpenPrinciples(v=>({...v,[p.id]:!v[p.id]}))}><div><span className={styles.code}>{p.code}</span><h2>{p.title}</h2></div><div className={styles.progressWrap}><strong>{pct}%</strong><div className={styles.progress}><i style={{width:`${pct}%`}}/></div><span>{openPrinciples[p.id]?'−':'+'}</span></div></button>{openPrinciples[p.id]?<div className={styles.criteriaList}>{pcs.map(c=><div className={styles.criterion} key={c.id}><div className={styles.criterionHead}><div><span className={styles.code}>{c.code}</span><h3>{c.title}</h3></div><span>{(indsByC[c.id]||[]).length} indicators</span></div><div className={styles.indicatorList}>{(indsByC[c.id]||[]).map(ind=>{const it=itemMap[ind.id];if(!it)return null;const isOpen=openItems[it.id];const evs=evidence.filter(x=>x.assessment_item_id===it.id);return <div className={styles.indicator} key={ind.id}><button className={styles.indicatorRow} onClick={()=>setOpenItems(v=>({...v,[it.id]:!v[it.id]}))}><span className={styles.code}>{ind.code}</span><span className={styles.indicatorText}>{ind.description}</span><StatusPill item={it}/><span>{isOpen?'−':'+'}</span></button>{isOpen?<div className={styles.editor}><div className={styles.requirement}><strong>Object Evidence / Expected Evidence</strong><p>{ind.object_evidence||'No specific object evidence text available in master.'}</p></div><div className={styles.editorGrid}><label className="form-field"><span>Assessment Status</span><select value={it.self_status} onChange={e=>patchItem(it.id,{self_status:e.target.value})}>{SELF_STATUSES.map(x=><option key={x}>{x}</option>)}</select></label><label className={`form-field ${styles.full}`}><span>User Explanation</span><textarea rows="4" value={it.explanation||''} onChange={e=>patchItem(it.id,{explanation:e.target.value})} placeholder="Explain how this indicator is fulfilled or describe the gap…"/></label><label className="form-field"><span>Verifier Status</span><select value={it.verifier_status||'Pending'} onChange={e=>patchItem(it.id,{verifier_status:e.target.value})}>{VERIFY_STATUSES.map(x=><option key={x}>{x}</option>)}</select></label><label className={`form-field ${styles.full}`}><span>Verifier Notes</span><textarea rows="3" value={it.verifier_notes||''} onChange={e=>patchItem(it.id,{verifier_notes:e.target.value})} placeholder="Verification note / revision request…"/></label></div><div className={styles.evidenceBox}><div><strong>Evidence</strong><span>{evs.length} file(s)</span></div><div className={styles.evidenceList}>{evs.map(ev=><button className={styles.fileChip} key={ev.id} onClick={()=>openEvidence(ev)}>📎 {ev.file_name}</button>)}</div><label className={styles.uploadBtn}>+ Upload Evidence<input type="file" hidden onChange={e=>uploadEvidence(it,e.target.files?.[0])}/></label></div><div className={styles.saveRow}><button className="primary-btn" disabled={savingId===it.id} onClick={()=>saveItem(ind.id)}>{savingId===it.id?'Saving…':'Save Indicator'}</button>{it.self_status==='Not Fulfilled'?<span className={styles.gapNote}>Gap will appear automatically in Sustainability Action Plan.</span>:null}</div></div>:null}</div>})}</div></div>)}</div>:null}</article>})}</section>
    </>:<section className={styles.empty}><strong>Select PT, standard and year.</strong><span>Assessment data is separated by company and assessment year so management can compare compliance consistently.</span></section>}
  </div>
}

function StatusPill({item}){let cls=styles.neutral,label=item.self_status;if(item.self_status==='Fulfilled'&&item.verifier_status==='Verified'){cls=styles.good;label='Verified'}else if(item.self_status==='Not Fulfilled'){cls=styles.bad;label='Gap'}else if(item.self_status==='Fulfilled'){cls=styles.warn;label='Need Verification'}else if(item.self_status==='N/A'){cls=styles.mutedPill}return <span className={`${styles.pill} ${cls}`}>{label}</span>}
