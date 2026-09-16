'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../../../lib/supabaseClient';
import styles from '../sims.module.css';

const SELF=['Not Started','Fulfilled','Not Fulfilled','N/A'];
const VERIFY=['Pending','Verified','Need Revision'];
const REPORTS=[
  ['NDPE','NDPE Policy · KPN IMIS'],
  ['ISPO','ISPO · Permentan 33/2025'],
  ['RSPO','RSPO · P&C 2018'],
  ['ISCC','ISCC · v4.1'],
  ['INS','INS · mapping pending'],
  ['EUDR','EUDR · mapping pending'],
  ['CGF-FPCA','CGF-FPCA'],
  ['GGLS1','GGLS1'],['GGLS4','GGLS4'],['GGL1D','GGL 1d'],['SDG','SDG']
];
const safe=v=>String(v||'report').replace(/[^a-zA-Z0-9._-]+/g,'_');
const csv=v=>`"${String(v??'').replace(/"/g,'""')}"`;

export default function SustainabilityAssessment(){
  const [companies,setCompanies]=useState([]),[companyId,setCompanyId]=useState(''),[year,setYear]=useState(new Date().getFullYear());
  const [standard,setStandard]=useState(null),[sites,setSites]=useState([]),[principles,setPrinciples]=useState([]),[criteria,setCriteria]=useState([]),[indicators,setIndicators]=useState([]);
  const [assessment,setAssessment]=useState(null),[items,setItems]=useState([]),[evidence,setEvidence]=useState([]),[mappings,setMappings]=useState([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[savingId,setSavingId]=useState('');
  const [openP,setOpenP]=useState({}),[openI,setOpenI]=useState({}),[dirty,setDirty]=useState({}),[search,setSearch]=useState(''),[status,setStatus]=useState('All');
  const [reportType,setReportType]=useState('ISPO'),[showReport,setShowReport]=useState(false);

  useEffect(()=>{(async()=>{
    const ce=getSupabaseConfigError(); if(ce||!supabase){setError(ce||'Supabase not configured.');return}
    const [c,s]=await Promise.all([
      supabase.from('companies').select('id,company_code,company_name,region,province,status').eq('status','Active').order('company_code'),
      supabase.from('sims_standards').select('*').eq('code','NDPE-IMIS-KPN').eq('status','Active').maybeSingle()
    ]);
    if(c.error||s.error){setError((c.error||s.error).message);return}
    setCompanies(c.data||[]);setStandard(s.data||null);
    if(!s.data)setError('Master NDPE-IMIS-KPN belum tersedia.');
  })()},[]);

  useEffect(()=>{if(!companyId){setSites([]);return}(async()=>{
    const q=await supabase.from('sites').select('id,site_name,status').eq('company_id',companyId).eq('status','Active').order('site_name');
    if(!q.error)setSites(q.data||[]);
  })()},[companyId]);

  async function hierarchy(){
    const p=await supabase.from('sims_principles').select('*').eq('standard_id',standard.id).order('sort_order');if(p.error)throw p.error;
    const pids=(p.data||[]).map(x=>x.id);
    const c=pids.length?await supabase.from('sims_criteria').select('*').in('principle_id',pids).order('sort_order'):{data:[]};if(c.error)throw c.error;
    const cids=(c.data||[]).map(x=>x.id);
    const i=cids.length?await supabase.from('sims_indicators').select('*').in('criterion_id',cids).eq('active',true).order('sort_order'):{data:[]};if(i.error)throw i.error;
    setPrinciples(p.data||[]);setCriteria(c.data||[]);setIndicators(i.data||[]);
    return {p:p.data||[],c:c.data||[],i:i.data||[]};
  }

  async function openAssessment(){
    if(!companyId||!standard?.id)return;setLoading(true);setError('');setNotice('');setShowReport(false);setDirty({});
    try{
      const h=await hierarchy();if(!h.i.length)throw new Error('Master NDPE belum memiliki indikator aktif.');
      let aq=await supabase.from('sims_assessments').select('*').eq('company_id',companyId).eq('standard_id',standard.id).eq('assessment_year',Number(year)).maybeSingle();if(aq.error)throw aq.error;
      let a=aq.data;
      if(!a){const u=await supabase.auth.getUser();const q=await supabase.from('sims_assessments').insert({company_id:companyId,standard_id:standard.id,assessment_year:Number(year),created_by:u.data.user?.id||null}).select().single();if(q.error)throw q.error;a=q.data}
      setAssessment(a);
      let iq=await supabase.from('sims_assessment_items').select('*').eq('assessment_id',a.id);if(iq.error)throw iq.error;
      const have=new Set((iq.data||[]).map(x=>x.indicator_id)),missing=h.i.filter(x=>!have.has(x.id));
      if(missing.length){const u=await supabase.auth.getUser();const q=await supabase.from('sims_assessment_items').insert(missing.map(x=>({assessment_id:a.id,indicator_id:x.id,updated_by:u.data.user?.id||null}))).select();if(q.error)throw q.error;iq={data:[...(iq.data||[]),...(q.data||[])]}}
      setItems(iq.data||[]);
      const ids=(iq.data||[]).map(x=>x.id),indIds=h.i.map(x=>x.id);
      const [ev,mp]=await Promise.all([
        ids.length?supabase.from('sims_evidence').select('*').in('assessment_item_id',ids).order('uploaded_at',{ascending:false}):Promise.resolve({data:[]}),
        indIds.length?supabase.from('sims_report_standard_mappings').select('indicator_id,standard_code,standard_name,requirement_reference,sort_order').in('indicator_id',indIds).eq('active',true).order('sort_order'):Promise.resolve({data:[]})
      ]);
      if(ev.error||mp.error)throw(ev.error||mp.error);
      setEvidence(ev.data||[]);setMappings(mp.data||[]);setOpenP(h.p[0]?{[h.p[0].id]:true}:{});
    }catch(e){setError(e.message||String(e))}finally{setLoading(false)}
  }
  useEffect(()=>{if(companyId&&standard?.id)openAssessment();else{setAssessment(null);setPrinciples([]);setCriteria([]);setIndicators([]);setItems([]);setEvidence([]);setMappings([])}},[companyId,year,standard?.id]);

  const company=companies.find(x=>x.id===companyId);
  const itemMap=useMemo(()=>Object.fromEntries(items.map(x=>[x.indicator_id,x])),[items]);
  const criterionMap=useMemo(()=>Object.fromEntries(criteria.map(x=>[x.id,x])),[criteria]);
  const principleMap=useMemo(()=>Object.fromEntries(principles.map(x=>[x.id,x])),[principles]);
  const criteriaByP=useMemo(()=>{const m={};criteria.forEach(x=>(m[x.principle_id]??=[]).push(x));return m},[criteria]);
  const indsByC=useMemo(()=>{const m={};indicators.forEach(x=>(m[x.criterion_id]??=[]).push(x));return m},[indicators]);
  const evByItem=useMemo(()=>{const m={};evidence.forEach(x=>(m[x.assessment_item_id]??=[]).push(x));return m},[evidence]);

  const counts=useMemo(()=>{
    const total=items.length,assessed=items.filter(x=>x.self_status&&x.self_status!=='Not Started').length;
    return{total,assessed,fulfilled:items.filter(x=>x.self_status==='Fulfilled').length,verified:items.filter(x=>x.self_status==='Fulfilled'&&x.verifier_status==='Verified').length,gaps:items.filter(x=>x.self_status==='Not Fulfilled').length,evidence:items.filter(x=>(evByItem[x.id]||[]).length).length,progress:total?Math.round(assessed/total*100):0}
  },[items,evByItem]);

  function matches(ind){
    const it=itemMap[ind.id];if(!it)return false;if(status!=='All'&&it.self_status!==status)return false;
    const t=search.trim().toLowerCase();if(!t)return true;const c=criterionMap[ind.criterion_id],p=c?principleMap[c.principle_id]:null;
    return[ind.code,ind.description,ind.object_evidence,c?.code,c?.title,p?.code,p?.title].filter(Boolean).join(' ').toLowerCase().includes(t);
  }
  const visible=useMemo(()=>indicators.filter(matches).length,[indicators,itemMap,status,search,criterionMap,principleMap]);
  function patch(id,p){setItems(v=>v.map(x=>x.id===id?{...x,...p}:x));setDirty(v=>({...v,[id]:true}))}

  async function saveItem(indicatorId){
    const it=itemMap[indicatorId];if(!it)return;setSavingId(it.id);setError('');
    try{const u=await supabase.auth.getUser(),verified=it.verifier_status==='Verified';
      const q=await supabase.from('sims_assessment_items').update({self_status:it.self_status||'Not Started',explanation:it.explanation||null,verifier_status:it.verifier_status||'Pending',verifier_notes:it.verifier_notes||null,updated_by:u.data.user?.id||null,updated_at:new Date().toISOString(),verified_by:verified?u.data.user?.id||null:null,verified_at:verified?new Date().toISOString():null}).eq('id',it.id);if(q.error)throw q.error;
      if(it.self_status==='Not Fulfilled'){const ap=await supabase.from('sims_action_plans').upsert({assessment_item_id:it.id,status:'Open',created_by:u.data.user?.id||null,updated_at:new Date().toISOString()},{onConflict:'assessment_item_id'});if(ap.error)throw ap.error}
      setDirty(v=>{const n={...v};delete n[it.id];return n});setNotice(`NDPE ${indicators.find(x=>x.id===indicatorId)?.code||''} berhasil disimpan.`);
    }catch(e){setError(e.message||String(e))}finally{setSavingId('')}
  }
  async function uploadEvidence(it,file){
    if(!file||!assessment)return;setSavingId(it.id);setError('');
    try{const u=await supabase.auth.getUser(),path=`${assessment.id}/${it.id}/${Date.now()}-${safe(file.name)}`;
      const up=await supabase.storage.from('sims-evidence').upload(path,file,{upsert:false});if(up.error)throw up.error;
      const q=await supabase.from('sims_evidence').insert({assessment_item_id:it.id,file_name:file.name,file_path:path,file_type:file.type||null,file_size:file.size,uploaded_by:u.data.user?.id||null}).select().single();if(q.error)throw q.error;
      setEvidence(v=>[q.data,...v]);setNotice('Evidence berhasil di-upload.');
    }catch(e){setError(e.message||String(e))}finally{setSavingId('')}
  }
  async function openEvidence(ev){const q=await supabase.storage.from('sims-evidence').createSignedUrl(ev.file_path,120);if(q.error)setError(q.error.message);else window.open(q.data.signedUrl,'_blank','noopener,noreferrer')}

  const reportRows=useMemo(()=>{
    if(!showReport)return[];const mm=new Map();
    if(reportType!=='NDPE')mappings.filter(x=>x.standard_code===reportType).forEach(x=>mm.set(x.indicator_id,x));
    return indicators.filter(ind=>reportType==='NDPE'||mm.has(ind.id)).map((ind,n)=>{
      const it=itemMap[ind.id],c=criterionMap[ind.criterion_id],p=c?principleMap[c.principle_id]:null,ev=it?evByItem[it.id]||[]:[];
      return{no:n+1,id:ind.id,ref:reportType==='NDPE'?ind.code:mm.get(ind.id)?.requirement_reference||'',code:ind.code,requirement:ind.description,principle:p?`${p.code} - ${p.title}`:'',criterion:c?`${c.code} - ${c.title}`:'',status:it?.self_status||'Not Started',verify:it?.verifier_status||'Pending',evidence:ev.length,explanation:it?.explanation||''}
    })
  },[showReport,reportType,mappings,indicators,itemMap,criterionMap,principleMap,evByItem]);
  const rs=useMemo(()=>{const total=reportRows.length,fulfilled=reportRows.filter(x=>x.status==='Fulfilled').length;return{total,fulfilled,verified:reportRows.filter(x=>x.status==='Fulfilled'&&x.verify==='Verified').length,gaps:reportRows.filter(x=>x.status==='Not Fulfilled').length,evidence:reportRows.filter(x=>x.evidence>0).length,coverage:total?Math.round(fulfilled/total*100):0}},[reportRows]);
  const mapped=reportType==='NDPE'||mappings.some(x=>x.standard_code===reportType);
  const reportLabel=REPORTS.find(x=>x[0]===reportType)?.[1]||reportType;
  const filename=ext=>safe(`${company?.company_code||'PT'}_${reportType}_${year}_NDPE_Crosswalk.${ext}`);
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
  function exportCsv(){if(!reportRows.length)return;const h=['No','Standard Reference','NDPE Code','NDPE Requirement','Principle','Criterion','Status','Verifier','Evidence Count','Explanation'];const rows=[h.map(csv).join(','),...reportRows.map(r=>[r.no,r.ref,r.code,r.requirement,r.principle,r.criterion,r.status,r.verify,r.evidence,r.explanation].map(csv).join(','))];download(new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8'}),filename('csv'))}
  async function exportPdf(){if(!reportRows.length)return;const{jsPDF}=await import('jspdf'),doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();let y=14;
    const head=()=>{doc.setFontSize(14);doc.text(`${reportLabel} Report - ${company?.company_code||''}`,12,y);y+=6;doc.setFontSize(8);doc.text(`Year ${year} | Source: NDPE Policy KPN IMIS`,12,y);y+=7};head();doc.setFontSize(8);
    reportRows.forEach(r=>{const lines=doc.splitTextToSize(`${r.no}. [${r.ref}] NDPE ${r.code} - ${r.requirement} | ${r.status} | ${r.verify} | Evidence ${r.evidence}`,pw-24),h=lines.length*4+2;if(y+h>ph-10){doc.addPage();y=14;head()}doc.text(lines,12,y);y+=h});doc.save(filename('pdf'))
  }
  async function exportDocx(){if(!reportRows.length)return;const{Document,Packer,Paragraph,Table,TableRow,TableCell,TextRun,WidthType}=await import('docx');
    const row=vals=>new TableRow({children:vals.map(v=>new TableCell({children:[new Paragraph(String(v??''))]}))});
    const doc=new Document({sections:[{children:[new Paragraph({children:[new TextRun({text:`${reportLabel} Report - ${company?.company_code||''} - ${year}`,bold:true,size:28})]}),new Paragraph('Source assessment: NDPE Policy KPN IMIS. Crosswalk is not a certification conclusion.'),new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[row(['No','Standard Ref','NDPE','Requirement','Status','Verifier','Evidence']),...reportRows.map(r=>row([r.no,r.ref,r.code,r.requirement,r.status,r.verify,r.evidence]))]})]}]});
    download(await Packer.toBlob(doc),filename('docx'))
  }

  return <div className="ndpe-wrap">
    <style>{`
      .ndpe-wrap{padding-bottom:36px;color:#173f2d}.ndpe-titlebar{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.ndpe-titlebar h1{margin:4px 0 6px;font-size:28px}.ndpe-titlebar p{margin:0;color:#718379;max-width:760px}.ndpe-tag{padding:8px 11px;border-radius:999px;background:#eaf6ee;border:1px solid #cce5d4;color:#17583a;font-size:11px;font-weight:800;white-space:nowrap}
      .ndpe-card{background:#fff;border:1px solid #dce8e0;border-radius:15px;box-shadow:0 5px 18px rgba(24,64,43,.05)}.ndpe-context{display:grid;grid-template-columns:1.4fr .55fr 1fr;gap:12px;padding:15px;margin-bottom:15px;align-items:end}.ndpe-field span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.07em;font-weight:900;color:#718379;margin-bottom:5px}.ndpe-field select,.ndpe-field input,.ndpe-field textarea{width:100%;border:1px solid #d7e3dc;border-radius:9px;background:#fff;color:#244735;outline:none}.ndpe-field select,.ndpe-field input{height:39px;padding:0 10px}.ndpe-field textarea{padding:9px;resize:vertical}.ndpe-master{padding:9px 11px;background:#f5f9f6;border:1px solid #dcebe2;border-radius:10px}.ndpe-master small{display:block;color:#73867a}.ndpe-master strong{font-size:12px}
      .ndpe-company{padding:16px;margin-bottom:14px}.ndpe-company h2{margin:3px 0}.ndpe-info{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.ndpe-info div{background:#f8fbf9;border:1px solid #e6eee9;border-radius:10px;padding:9px}.ndpe-info small{display:block;color:#77897e}.ndpe-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px}.ndpe-kpi{background:#fff;border:1px solid #dce8e0;border-radius:12px;padding:11px}.ndpe-kpi:first-child{background:#0c4d35;color:#fff}.ndpe-kpi small{display:block;opacity:.7}.ndpe-kpi strong{display:block;font-size:23px;margin-top:3px}
      .ndpe-toolbar{padding:11px;display:grid;grid-template-columns:1fr .35fr auto;gap:9px;align-items:end;margin-bottom:14px;position:sticky;top:8px;z-index:4}.ndpe-actions{display:flex;gap:6px;flex-wrap:wrap}.ndpe-btn{height:38px;border:1px solid #d5e2da;border-radius:9px;background:#f8fbf9;color:#2a573f;padding:0 11px;font-weight:800;font-size:11px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}.ndpe-btn.primary{background:#176443;color:#fff;border-color:#176443}.ndpe-summary{grid-column:1/-1;font-size:11px;color:#718379}
      .ndpe-principle{margin-bottom:10px;overflow:hidden}.ndpe-pr-head{width:100%;border:0;background:#f4f9f6;padding:13px 15px;text-align:left;display:flex;justify-content:space-between;cursor:pointer}.ndpe-pr-head span{font-size:11px;color:#75867c}.ndpe-pr-body{padding:11px}.ndpe-criterion h3{font-size:12px;margin:9px 0;color:#315b45}.ndpe-item{border:1px solid #e2ebe5;border-radius:10px;margin-bottom:7px;overflow:hidden}.ndpe-item-head{width:100%;border:0;background:#fff;padding:10px 12px;display:grid;grid-template-columns:70px 1fr auto;gap:10px;text-align:left;align-items:center;cursor:pointer}.ndpe-code{font-weight:900;color:#15583b}.ndpe-desc{font-size:12px;line-height:1.4}.ndpe-badges{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.ndpe-pill{font-size:9px;font-weight:900;padding:4px 7px;border-radius:999px;background:#eef3f0;color:#61736a}.ndpe-pill.good{background:#e7f6ec;color:#1f6b43}.ndpe-pill.bad{background:#fdeceb;color:#9a362f}.ndpe-pill.warn{background:#fff4d7;color:#7b5a0b}.ndpe-pill.blue{background:#edf3ff;color:#315e91}.ndpe-editor{border-top:1px solid #e6eee9;background:#fbfdfb;padding:12px}.ndpe-req{padding:10px;background:#eff7f2;border-radius:9px;margin-bottom:9px}.ndpe-req.evidence{background:#fff8e9}.ndpe-req strong{font-size:9px}.ndpe-req p{white-space:pre-line;font-size:12px;line-height:1.45;margin:4px 0 0}.ndpe-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ndpe-full{grid-column:1/-1}.ndpe-files{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:9px}.ndpe-file{border:1px solid #d6e4db;background:#fff;border-radius:999px;padding:5px 8px;font-size:10px;cursor:pointer}.ndpe-upload{padding:6px 9px;border-radius:8px;background:#edf7f1;color:#17583a;font-size:10px;font-weight:900;cursor:pointer}
      .ndpe-report{margin-top:22px;padding:18px}.ndpe-report h2{margin:4px 0 5px}.ndpe-report-control{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:end;margin:13px 0}.ndpe-note{padding:10px;background:#f5f9f6;border:1px solid #dce7df;border-radius:9px;color:#63766a;font-size:11px}.ndpe-rkpis{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin:12px 0}.ndpe-rkpis div{border:1px solid #dfe9e3;border-radius:9px;padding:9px}.ndpe-rkpis small{display:block;color:#788a80}.ndpe-rkpis strong{font-size:20px}.ndpe-tablewrap{overflow:auto;border:1px solid #dfe8e2;border-radius:9px;margin-top:10px}.ndpe-table{border-collapse:collapse;width:100%;min-width:950px;font-size:10px}.ndpe-table th{background:#eef6f1;text-align:left;padding:8px}.ndpe-table td{padding:8px;border-top:1px solid #edf2ef;vertical-align:top;white-space:pre-line}.ndpe-table td.req{min-width:300px}.ndpe-alert{padding:10px 12px;border-radius:10px;margin-bottom:12px;font-size:12px}.ndpe-alert.error{background:#fff0ef;border:1px solid #efc7c2;color:#8c3028}.ndpe-alert.ok{background:#edf8f1;border:1px solid #cee7d6;color:#245c3d}.ndpe-alert.warn{background:#fff8e8;border:1px solid #ecd99f;color:#725711}
      @media(max-width:950px){.ndpe-context{grid-template-columns:1fr 1fr}.ndpe-master{grid-column:1/-1}.ndpe-info,.ndpe-kpis,.ndpe-rkpis{grid-template-columns:repeat(2,1fr)}.ndpe-toolbar{grid-template-columns:1fr 1fr}.ndpe-actions,.ndpe-summary{grid-column:1/-1}}@media(max-width:600px){.ndpe-titlebar{flex-direction:column}.ndpe-context,.ndpe-toolbar,.ndpe-report-control,.ndpe-grid{grid-template-columns:1fr}.ndpe-master,.ndpe-actions,.ndpe-summary,.ndpe-full{grid-column:auto}.ndpe-info,.ndpe-kpis,.ndpe-rkpis{grid-template-columns:1fr}.ndpe-item-head{grid-template-columns:60px 1fr}.ndpe-badges{grid-column:1/-1;justify-content:flex-start}.ndpe-toolbar{position:static}}
    `}</style>
    <div className="ndpe-titlebar"><div><div className={styles.eyebrow}>SIMS · SUSTAINABILITY MANAGEMENT</div><h1>NDPE Policy & Report Generator</h1><p>Assessment diisi satu kali berdasarkan NDPE Policy, lalu digenerate menjadi report ISPO, RSPO, ISCC dan standard lain berdasarkan crosswalk.</p></div><div className="ndpe-tag">Single Source · Multi Standard</div></div>
    <section className="ndpe-card ndpe-context">
      <label className="ndpe-field"><span>Company / PT</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Pilih Company / PT</option>{companies.map(x=><option key={x.id} value={x.id}>{x.company_code} — {x.company_name}</option>)}</select></label>
      <label className="ndpe-field"><span>Assessment Year</span><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
      <div className="ndpe-master"><small>Assessment Master</small><strong>{standard?.name||'Loading NDPE master…'}</strong></div>
    </section>
    {error?<div className="ndpe-alert error">{error}</div>:null}{notice?<div className="ndpe-alert ok">{notice}</div>:null}
    {companyId?<section className="ndpe-card ndpe-company"><small>INFORMASI PERUSAHAAN</small><h2>{company?.company_code} — {company?.company_name}</h2><div className="ndpe-info"><div><small>Region</small><strong>{company?.region||'-'}</strong></div><div><small>Province</small><strong>{company?.province||'-'}</strong></div><div><small>NDPE Indicators</small><strong>{indicators.length||177}</strong></div><div><small>Active Sites</small><strong>{sites.length}</strong></div></div></section>:null}
    {loading?<div className="ndpe-alert warn">Menyiapkan assessment NDPE dan crosswalk report…</div>:null}
    {!loading&&assessment?<>
      <section className="ndpe-kpis"><div className="ndpe-kpi"><small>Progress</small><strong>{counts.progress}%</strong></div><div className="ndpe-kpi"><small>Total NDPE</small><strong>{counts.total}</strong></div><div className="ndpe-kpi"><small>Fulfilled</small><strong>{counts.fulfilled}</strong></div><div className="ndpe-kpi"><small>Verified</small><strong>{counts.verified}</strong></div><div className="ndpe-kpi"><small>Gap</small><strong>{counts.gaps}</strong></div><div className="ndpe-kpi"><small>Evidence Ready</small><strong>{counts.evidence}</strong></div></section>
      <section className="ndpe-card ndpe-toolbar">
        <label className="ndpe-field"><span>Search NDPE</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari kode, policy, evidence…"/></label>
        <label className="ndpe-field"><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option>{SELF.map(x=><option key={x}>{x}</option>)}</select></label>
        <div className="ndpe-actions"><button className="ndpe-btn" onClick={()=>setOpenP(Object.fromEntries(principles.map(x=>[x.id,true])))}>Expand All</button><button className="ndpe-btn" onClick={()=>setOpenP({})}>Collapse</button><Link className="ndpe-btn" href="/sims/action-plan">Action Plan</Link></div>
        <div className="ndpe-summary">Menampilkan <strong>{visible}</strong> dari <strong>{counts.total}</strong> indikator NDPE.</div>
      </section>
      <section>{principles.map(p=>{const pcs=criteriaByP[p.id]||[],has=pcs.some(c=>(indsByC[c.id]||[]).some(matches));if(!has)return null;const opened=!!openP[p.id];return <article className="ndpe-card ndpe-principle" key={p.id}>
        <button className="ndpe-pr-head" onClick={()=>setOpenP(v=>({...v,[p.id]:!v[p.id]}))}><div><strong>{p.code}. {p.title}</strong><br/><span>{pcs.reduce((n,c)=>n+(indsByC[c.id]||[]).length,0)} indicator</span></div><strong>{opened?'−':'+'}</strong></button>
        {opened?<div className="ndpe-pr-body">{pcs.map(c=>{const inds=(indsByC[c.id]||[]).filter(matches);if(!inds.length)return null;return <div className="ndpe-criterion" key={c.id}><h3>{c.code} · {c.title}</h3>{inds.map(ind=>{const it=itemMap[ind.id];if(!it)return null;const files=evByItem[it.id]||[],openedI=!!openI[it.id];return <div className="ndpe-item" key={ind.id}>
          <button className="ndpe-item-head" onClick={()=>setOpenI(v=>({...v,[it.id]:!v[it.id]}))}><span className="ndpe-code">{ind.code}</span><span className="ndpe-desc">{ind.description}</span><span className="ndpe-badges"><span className={`ndpe-pill ${it.self_status==='Fulfilled'?'good':it.self_status==='Not Fulfilled'?'bad':'warn'}`}>{it.self_status}</span><span className={`ndpe-pill ${it.verifier_status==='Verified'?'good':it.verifier_status==='Need Revision'?'bad':'warn'}`}>{it.verifier_status}</span><span className="ndpe-pill blue">{files.length} evidence</span>{dirty[it.id]?<span className="ndpe-pill warn">Unsaved</span>:null}</span></button>
          {openedI?<div className="ndpe-editor"><div className="ndpe-req"><strong>NDPE REQUIREMENT</strong><p>{ind.description}</p></div>{ind.object_evidence?<div className="ndpe-req evidence"><strong>OBJECT EVIDENCE</strong><p>{ind.object_evidence}</p></div>:null}
            <div className="ndpe-grid"><label className="ndpe-field"><span>Assessment Status</span><select value={it.self_status||'Not Started'} onChange={e=>patch(it.id,{self_status:e.target.value})}>{SELF.map(x=><option key={x}>{x}</option>)}</select></label><label className="ndpe-field"><span>Verifier Status</span><select value={it.verifier_status||'Pending'} onChange={e=>patch(it.id,{verifier_status:e.target.value})}>{VERIFY.map(x=><option key={x}>{x}</option>)}</select></label><label className="ndpe-field ndpe-full"><span>Implementation / Explanation</span><textarea rows="3" value={it.explanation||''} onChange={e=>patch(it.id,{explanation:e.target.value})}/></label><label className="ndpe-field ndpe-full"><span>Verifier Notes</span><textarea rows="2" value={it.verifier_notes||''} onChange={e=>patch(it.id,{verifier_notes:e.target.value})}/></label></div>
            <div className="ndpe-files">{files.map(f=><button className="ndpe-file" key={f.id} onClick={()=>openEvidence(f)}>{f.file_name}</button>)}{!files.length?<span>Belum ada evidence.</span>:null}<label className="ndpe-upload">+ Upload Evidence<input hidden type="file" onChange={e=>uploadEvidence(it,e.target.files?.[0])}/></label></div>
            <div className="ndpe-actions" style={{marginTop:10}}><button className="ndpe-btn primary" disabled={savingId===it.id} onClick={()=>saveItem(ind.id)}>{savingId===it.id?'Saving…':'Save NDPE'}</button>{it.self_status==='Not Fulfilled'?<span className="ndpe-pill bad">Auto → Sustainability Action Plan</span>:null}</div>
          </div>:null}</div>})}</div>})}</div>:null}</article>})}</section>

      <section className="ndpe-card ndpe-report" id="report-generator"><div className={styles.eyebrow}>GENERATE REPORT</div><h2>Cross-Standard Report</h2><p>Report mengambil assessment NDPE yang sama dan menampilkan indikator yang memiliki mapping ke standard pilihan.</p>
        <div className="ndpe-report-control"><label className="ndpe-field"><span>Report Type</span><select value={reportType} onChange={e=>{setReportType(e.target.value);setShowReport(false)}}>{REPORTS.map(r=><option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></label><button className="ndpe-btn primary" onClick={()=>setShowReport(true)}>Generate Report</button></div>
        <div className="ndpe-note">Source mapping: <strong>SIMS - KPN - NDPE - ISPO Permentan 33 2025.xlsx</strong> · sheet NDPE 2022. Crosswalk adalah referensi keterkaitan requirement, bukan keputusan audit/sertifikasi.</div>
        {showReport&&!mapped?<div className="ndpe-alert warn" style={{marginTop:10}}>Mapping {reportLabel} belum tersedia pada source IMIS yang digunakan. Pilihan report sudah disiapkan; crosswalk resmi perlu dimasukkan sebelum report dapat dihitung.</div>:null}
        {showReport&&mapped?<div><div className="ndpe-rkpis"><div><small>Mapped NDPE</small><strong>{rs.total}</strong></div><div><small>Fulfilled</small><strong>{rs.fulfilled}</strong></div><div><small>Verified</small><strong>{rs.verified}</strong></div><div><small>Gap</small><strong>{rs.gaps}</strong></div><div><small>Evidence Ready</small><strong>{rs.evidence}</strong></div><div><small>NDPE Coverage</small><strong>{rs.coverage}%</strong></div></div>
          <div className="ndpe-actions"><button className="ndpe-btn" onClick={exportCsv}>Excel / CSV</button><button className="ndpe-btn" onClick={exportPdf}>PDF</button><button className="ndpe-btn" onClick={exportDocx}>Word</button><Link className="ndpe-btn" href="/sims/compliance">Open Compliance</Link></div>
          {reportRows.length?<div className="ndpe-tablewrap"><table className="ndpe-table"><thead><tr><th>No</th><th>{reportLabel} Requirement</th><th>NDPE</th><th>NDPE Requirement</th><th>Status</th><th>Verifier</th><th>Evidence</th></tr></thead><tbody>{reportRows.map(r=><tr key={`${reportType}-${r.id}`}><td>{r.no}</td><td>{r.ref}</td><td><strong>{r.code}</strong></td><td className="req">{r.requirement}</td><td>{r.status}</td><td>{r.verify}</td><td>{r.evidence}</td></tr>)}</tbody></table></div>:<div className="ndpe-alert warn" style={{marginTop:10}}>Tidak ada baris report untuk mapping ini.</div>}</div>:null}
      </section>
    </>:null}
    {!loading&&!companyId?<section className={styles.empty}><strong>Select Company / PT</strong><span>Pilih PT. Assessment NDPE akan dibuat atau dimuat otomatis untuk tahun yang dipilih.</span></section>:null}
  </div>
}
