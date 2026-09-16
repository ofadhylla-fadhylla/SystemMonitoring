'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../../../lib/supabaseClient';
import styles from '../sims.module.css';

const REPORTS=[['NDPE','NDPE Policy'],['ISPO','ISPO · Permentan 33/2025'],['RSPO','RSPO · P&C 2018'],['ISCC','ISCC · v4.1'],['INS','INS · mapping pending'],['EUDR','EUDR · mapping pending'],['CGF-FPCA','CGF-FPCA'],['GGLS1','GGLS1'],['GGLS4','GGLS4'],['GGL1D','GGL 1d'],['SDG','SDG']];

export default function SustainabilityCompliance(){
  const [companies,setCompanies]=useState([]),[companyId,setCompanyId]=useState(''),[year,setYear]=useState(new Date().getFullYear()),[reportType,setReportType]=useState('NDPE');
  const [standard,setStandard]=useState(null),[assessment,setAssessment]=useState(null),[principles,setPrinciples]=useState([]),[criteria,setCriteria]=useState([]),[indicators,setIndicators]=useState([]),[items,setItems]=useState([]),[mappings,setMappings]=useState([]),[evidence,setEvidence]=useState([]),[actions,setActions]=useState([]),[ranking,setRanking]=useState([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');

  useEffect(()=>{(async()=>{
    const ce=getSupabaseConfigError();if(ce||!supabase){setError(ce||'Supabase not configured.');return;}
    const[c,s]=await Promise.all([
      supabase.from('companies').select('id,company_code,company_name,status').eq('status','Active').order('company_code'),
      supabase.from('sims_standards').select('*').eq('code','NDPE-IMIS-KPN').eq('status','Active').maybeSingle()
    ]);
    if(c.error||s.error){setError((c.error||s.error).message);return;}
    setCompanies(c.data||[]);setStandard(s.data||null);
  })()},[]);

  const company=companies.find(x=>x.id===companyId),reportLabel=REPORTS.find(x=>x[0]===reportType)?.[1]||reportType;

  async function loadHierarchy(){
    const p=await supabase.from('sims_principles').select('*').eq('standard_id',standard.id).order('sort_order');if(p.error)throw p.error;
    const pids=(p.data||[]).map(x=>x.id),c=pids.length?await supabase.from('sims_criteria').select('*').in('principle_id',pids).order('sort_order'):{data:[]};if(c.error)throw c.error;
    const cids=(c.data||[]).map(x=>x.id),i=cids.length?await supabase.from('sims_indicators').select('*').in('criterion_id',cids).eq('active',true).order('sort_order'):{data:[]};if(i.error)throw i.error;
    setPrinciples(p.data||[]);setCriteria(c.data||[]);setIndicators(i.data||[]);return{p:p.data||[],c:c.data||[],i:i.data||[]};
  }

  async function loadRanking(selectedIds){
    if(!selectedIds.length){setRanking([]);return;}
    const ass=await supabase.from('sims_assessments').select('id,company_id,assessment_year').eq('standard_id',standard.id).eq('assessment_year',Number(year));if(ass.error)throw ass.error;
    const aids=(ass.data||[]).map(x=>x.id);if(!aids.length){setRanking([]);return;}
    const its=await supabase.from('sims_assessment_items').select('assessment_id,indicator_id,self_status,verifier_status').in('assessment_id',aids).in('indicator_id',selectedIds);if(its.error)throw its.error;
    const by={};(its.data||[]).forEach(x=>(by[x.assessment_id]??=[]).push(x));const total=selectedIds.length||1;
    setRanking((ass.data||[]).map(a=>{const arr=by[a.id]||[],verified=arr.filter(x=>x.self_status==='Fulfilled'&&x.verifier_status==='Verified').length,gaps=arr.filter(x=>x.self_status==='Not Fulfilled').length,comp=companies.find(c=>c.id===a.company_id);return{company_id:a.company_id,code:comp?.company_code||'-',name:comp?.company_name||'Unknown',verified,gaps,total,percent:Math.round(verified/total*100)}}).sort((a,b)=>b.percent-a.percent||a.code.localeCompare(b.code)));
  }

  async function openCompliance(){
    if(!companyId||!standard?.id)return;setLoading(true);setError('');setNotice('');
    try{
      const h=await loadHierarchy(),allIds=h.i.map(x=>x.id);
      let mp=[];
      if(reportType!=='NDPE'&&allIds.length){const q=await supabase.from('sims_report_standard_mappings').select('indicator_id,standard_code,standard_name,requirement_reference,sort_order').in('indicator_id',allIds).eq('standard_code',reportType).eq('active',true).order('sort_order');if(q.error)throw q.error;mp=q.data||[];}
      setMappings(mp);
      const selectedIds=reportType==='NDPE'?allIds:[...new Set(mp.map(x=>x.indicator_id))];
      const a=await supabase.from('sims_assessments').select('*').eq('company_id',companyId).eq('standard_id',standard.id).eq('assessment_year',Number(year)).maybeSingle();if(a.error)throw a.error;setAssessment(a.data||null);
      if(a.data){
        const it=await supabase.from('sims_assessment_items').select('*').eq('assessment_id',a.data.id);if(it.error)throw it.error;setItems(it.data||[]);
        const itemIds=(it.data||[]).map(x=>x.id);
        const [ev,ap]=await Promise.all([
          itemIds.length?supabase.from('sims_evidence').select('id,assessment_item_id').in('assessment_item_id',itemIds):Promise.resolve({data:[]}),
          itemIds.length?supabase.from('sims_action_plans').select('id,assessment_item_id,status,priority,deadline,verifier_status').in('assessment_item_id',itemIds):Promise.resolve({data:[]})
        ]);
        if(ev.error||ap.error)throw(ev.error||ap.error);setEvidence(ev.data||[]);setActions(ap.data||[]);
      }else{setItems([]);setEvidence([]);setActions([]);setNotice('Belum ada assessment NDPE untuk PT dan tahun ini.');}
      await loadRanking(selectedIds);
    }catch(e){setError(e.message||String(e))}finally{setLoading(false)}
  }

  useEffect(()=>{if(companyId&&standard?.id)openCompliance();else{setAssessment(null);setItems([]);setMappings([]);setEvidence([]);setActions([]);setRanking([])}},[companyId,year,reportType,standard?.id]);

  const mappingByInd=useMemo(()=>{const m={};mappings.forEach(x=>{m[x.indicator_id]=x});return m},[mappings]);
  const selectedIndicators=useMemo(()=>reportType==='NDPE'?indicators:indicators.filter(i=>mappingByInd[i.id]),[reportType,indicators,mappingByInd]);
  const selectedIds=useMemo(()=>new Set(selectedIndicators.map(x=>x.id)),[selectedIndicators]);
  const itemByInd=useMemo(()=>Object.fromEntries(items.map(x=>[x.indicator_id,x])),[items]);
  const evCountByItem=useMemo(()=>{const m={};evidence.forEach(x=>m[x.assessment_item_id]=(m[x.assessment_item_id]||0)+1);return m},[evidence]);
  const actionByItem=useMemo(()=>Object.fromEntries(actions.map(x=>[x.assessment_item_id,x])),[actions]);
  const criterionById=useMemo(()=>Object.fromEntries(criteria.map(x=>[x.id,x])),[criteria]);
  const principleById=useMemo(()=>Object.fromEntries(principles.map(x=>[x.id,x])),[principles]);

  const stats=useMemo(()=>{
    const total=selectedIndicators.length,arr=selectedIndicators.map(ind=>({ind,it:itemByInd[ind.id]})),assessed=arr.filter(x=>x.it?.self_status&&x.it.self_status!=='Not Started').length,fulfilled=arr.filter(x=>x.it?.self_status==='Fulfilled').length,verified=arr.filter(x=>x.it?.self_status==='Fulfilled'&&x.it?.verifier_status==='Verified').length,gaps=arr.filter(x=>x.it?.self_status==='Not Fulfilled').length,evidenceReady=arr.filter(x=>x.it&&evCountByItem[x.it.id]>0).length,openActions=arr.filter(x=>{const ap=x.it?actionByItem[x.it.id]:null;return x.it?.self_status==='Not Fulfilled'&&(!ap||!['Completed','Closed'].includes(ap.status))}).length;return{total,assessed,fulfilled,verified,gaps,evidenceReady,openActions,overall:total?Math.round(verified/total*100):0,progress:total?Math.round(assessed/total*100):0}
  },[selectedIndicators,itemByInd,evCountByItem,actionByItem]);

  const principleRows=useMemo(()=>principles.map(p=>{const critIds=criteria.filter(c=>c.principle_id===p.id).map(c=>c.id),inds=selectedIndicators.filter(i=>critIds.includes(i.criterion_id));if(!inds.length)return null;const verified=inds.filter(ind=>itemByInd[ind.id]?.self_status==='Fulfilled'&&itemByInd[ind.id]?.verifier_status==='Verified').length,gaps=inds.filter(ind=>itemByInd[ind.id]?.self_status==='Not Fulfilled').length;return{...p,total:inds.length,verified,gaps,percent:Math.round(verified/inds.length*100)}}).filter(Boolean),[principles,criteria,selectedIndicators,itemByInd]);
  const criterionRows=useMemo(()=>criteria.map(c=>{const inds=selectedIndicators.filter(i=>i.criterion_id===c.id);if(!inds.length)return null;const verified=inds.filter(ind=>itemByInd[ind.id]?.self_status==='Fulfilled'&&itemByInd[ind.id]?.verifier_status==='Verified').length,gaps=inds.filter(ind=>itemByInd[ind.id]?.self_status==='Not Fulfilled').length,p=principles.find(x=>x.id===c.principle_id);return{...c,principle:p,total:inds.length,verified,gaps,percent:Math.round(verified/inds.length*100)}}).filter(Boolean),[criteria,selectedIndicators,itemByInd,principles]);
  const detailRows=useMemo(()=>selectedIndicators.map(ind=>{const it=itemByInd[ind.id],cr=criterionById[ind.criterion_id],pr=cr?principleById[cr.principle_id]:null,ap=it?actionByItem[it.id]:null;return{ind,it,cr,pr,ref:reportType==='NDPE'?ind.code:mappingByInd[ind.id]?.requirement_reference||'',evidence:it?evCountByItem[it.id]||0:0,action:ap}}),[selectedIndicators,itemByInd,criterionById,principleById,reportType,mappingByInd,evCountByItem,actionByItem]);
  const mappingAvailable=reportType==='NDPE'||mappings.length>0;

  return <div className="page-wrap">
    <style>{`
      .cp-context{display:grid;grid-template-columns:1.3fr .48fr .8fr 1fr;gap:10px;align-items:end;background:#fff;border:1px solid #dce8e0;border-radius:15px;padding:15px;margin-bottom:15px}.cp-field span{display:block;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#718379;margin-bottom:5px}.cp-field select,.cp-field input{width:100%;height:39px;border:1px solid #d7e3dc;border-radius:9px;padding:0 10px;background:#fff;color:#244735}.cp-master{padding:9px 11px;border-radius:10px;background:#f3f8f5;border:1px solid #dce9e1}.cp-master small{display:block;color:#718379}.cp-master strong{font-size:11px}.cp-flow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:8px 0 18px}.cp-flow span{font-size:10px;font-weight:800;padding:5px 8px;border-radius:999px;background:#edf7f1;color:#1b5d3e}.cp-flow b{color:#9aaba1}.cp-kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:15px}.cp-kpi{background:#fff;border:1px solid #dce8e0;border-radius:11px;padding:10px}.cp-kpi.hero{background:#0d5137;color:#fff}.cp-kpi small{display:block;opacity:.72}.cp-kpi strong{font-size:21px}.cp-warning{background:#fff8e8;border:1px solid #ecd99f;color:#725711;border-radius:10px;padding:11px;margin-bottom:14px}.cp-tablewrap{overflow:auto;background:#fff;border:1px solid #dce8e0;border-radius:12px;margin-top:16px}.cp-table{width:100%;border-collapse:collapse;min-width:980px;font-size:10px}.cp-table th{background:#eef6f1;text-align:left;padding:8px}.cp-table td{padding:8px;border-top:1px solid #edf2ef;vertical-align:top}.cp-pill{display:inline-block;font-size:9px;font-weight:800;padding:4px 7px;border-radius:999px;background:#eef3f0;color:#61736a}.cp-pill.good{background:#e7f6ec;color:#1f6b43}.cp-pill.bad{background:#fdeceb;color:#9a362f}.cp-pill.warn{background:#fff4d7;color:#7b5a0b}.cp-source{font-size:10px;color:#718379;margin-top:5px}@media(max-width:1100px){.cp-context{grid-template-columns:1fr 1fr}.cp-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.cp-context,.cp-kpis{grid-template-columns:1fr}}
    `}</style>
    <div className="page-heading"><div><div className={styles.eyebrow}>SIMS · CROSS-STANDARD COMPLIANCE</div><h1>Sustainability Compliance Level</h1><p>Compliance ISPO, RSPO, ISCC dan standard lain dihitung dari satu assessment NDPE yang sama melalui crosswalk.</p></div></div>
    <div className="cp-flow"><span>NDPE Assessment</span><b>→</b><span>Crosswalk</span><b>→</b><span>{reportType}</span><b>→</b><span>Compliance</span><b>→</b><span>Action Plan Closure</span></div>
    <section className="cp-context">
      <label className="cp-field"><span>Company / PT</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}><option value="">Pilih Company / PT</option>{companies.map(x=><option key={x.id} value={x.id}>{x.company_code} — {x.company_name}</option>)}</select></label>
      <label className="cp-field"><span>Year</span><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value))}/></label>
      <label className="cp-field"><span>Compliance Standard</span><select value={reportType} onChange={e=>setReportType(e.target.value)}>{REPORTS.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
      <div className="cp-master"><small>Single Source Assessment</small><strong>{standard?.name||'NDPE Policy — KPN IMIS'}</strong></div>
    </section>
    {error?<div className="sync-error"><strong>SIMS error</strong><span>{error}</span></div>:null}{notice?<div className={styles.notice}>{notice}</div>:null}{loading?<div className={styles.notice}>Calculating {reportLabel} from NDPE crosswalk…</div>:null}
    {!loading&&companyId&&!mappingAvailable?<div className="cp-warning"><strong>{reportLabel}</strong> belum memiliki crosswalk pada master mapping yang digunakan. Compliance belum dihitung agar sistem tidak membuat asumsi requirement.</div>:null}
    {!loading&&companyId&&mappingAvailable?<>
      <section className="cp-kpis"><div className="cp-kpi hero"><small>Verified Compliance</small><strong>{stats.overall}%</strong></div><div className="cp-kpi"><small>Applicable / Mapped</small><strong>{stats.total}</strong></div><div className="cp-kpi"><small>Assessed</small><strong>{stats.assessed}</strong></div><div className="cp-kpi"><small>Fulfilled</small><strong>{stats.fulfilled}</strong></div><div className="cp-kpi"><small>Verified</small><strong>{stats.verified}</strong></div><div className="cp-kpi"><small>Gap</small><strong>{stats.gaps}</strong></div><div className="cp-kpi"><small>Open Action</small><strong>{stats.openActions}</strong></div></section>
      <section className={styles.rankGrid}><div><div className={styles.complianceHero}><span>{reportLabel} Compliance</span><strong>{stats.overall}%</strong><p>{stats.verified} verified fulfilled of {stats.total} mapped NDPE indicators. Assessment progress {stats.progress}% · evidence ready {stats.evidenceReady}/{stats.total}.</p></div><div className={styles.principleBars} style={{marginTop:16}}><h2 style={{fontSize:16,margin:'0 0 16px'}}>Compliance by NDPE Principle</h2>{principleRows.map(r=><div className={styles.barRow} key={r.id}><div className={styles.barLabel}><strong>{r.code} · {r.title}</strong><span>{r.verified}/{r.total} · {r.percent}% · Gap {r.gaps}</span></div><div className={styles.barTrack}><i style={{width:`${r.percent}%`}}/></div></div>)}</div></div><div className={styles.ranking}><div className="panel-head"><div><h2>Company Compliance Ranking</h2><p>{reportLabel} · {year} · same NDPE source.</p></div></div>{ranking.length?ranking.map((r,idx)=><div className={styles.rankRow} key={r.company_id}><span className={styles.rankNo}>{idx+1}</span><div className={styles.rankName}><strong>{r.code} — {r.name}</strong><span>{r.verified}/{r.total} verified · {r.gaps} gap</span></div><span className={styles.rankPct}>{r.percent}%</span></div>):<div className={styles.empty}><span>No comparable NDPE assessment yet.</span></div>}</div></section>
      <section className={styles.matrix}><table><thead><tr><th>NDPE Principle</th><th>NDPE Criterion</th><th>Mapped Indicators</th><th>Verified</th><th>Gap</th><th>Compliance</th></tr></thead><tbody>{criterionRows.map(r=><tr key={r.id}><td><strong>{r.principle?.code}</strong> {r.principle?.title}</td><td><strong>{r.code}</strong> {r.title}</td><td>{r.total}</td><td>{r.verified}</td><td className={r.gaps?styles.danger:''}>{r.gaps}</td><td><strong>{r.percent}%</strong></td></tr>)}</tbody></table></section>
      <div className="cp-tablewrap"><table className="cp-table"><thead><tr><th>{reportType} Ref</th><th>NDPE</th><th>Requirement</th><th>Assessment</th><th>Verifier</th><th>Evidence</th><th>Action Plan</th></tr></thead><tbody>{detailRows.map(r=><tr key={r.ind.id}><td>{r.ref}</td><td><strong>{r.ind.code}</strong></td><td>{r.ind.description}</td><td><span className={`cp-pill ${r.it?.self_status==='Fulfilled'?'good':r.it?.self_status==='Not Fulfilled'?'bad':'warn'}`}>{r.it?.self_status||'Not Started'}</span></td><td><span className={`cp-pill ${r.it?.verifier_status==='Verified'?'good':r.it?.verifier_status==='Need Revision'?'bad':'warn'}`}>{r.it?.verifier_status||'Pending'}</span></td><td>{r.evidence}</td><td>{r.it?.self_status==='Not Fulfilled'?<span className={`cp-pill ${r.action&&['Completed','Closed'].includes(r.action.status)?'good':'bad'}`}>{r.action?.status||'Open'}</span>:'-'}</td></tr>)}</tbody></table></div>
      <div className="cp-source">Source: NDPE Policy KPN IMIS assessment + sims_report_standard_mappings. Compliance = Fulfilled + Verified / applicable mapped NDPE indicators.</div>
    </>:!loading&&!companyId?<section className={styles.empty}><strong>Select Company / PT</strong><span>Pilih PT, tahun dan standard compliance. Sistem akan menghitung dari assessment NDPE yang sama.</span></section>:null}
  </div>
}
