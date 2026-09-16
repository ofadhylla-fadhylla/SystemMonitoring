'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';

const CORE=['ISPO','RSPO','ISCC'];
const STORAGE_KEY='smd-innovation-impact-v1';
const EMPTY_ASSUMPTIONS={standardsBefore:'',assessmentHoursBefore:'',masterHoursAfter:'',reportHoursBefore:'',reportHoursAfter:'',evidenceHoursBefore:'',evidenceHoursAfter:'',cyclesPerYear:'1',costPerHour:''};
const n=v=>Number(v||0);
const fmt=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v):'—';
const rupiah=v=>Number.isFinite(v)?new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(v):'—';
const chunks=(arr,size=150)=>Array.from({length:Math.ceil(arr.length/size)},(_,i)=>arr.slice(i*size,(i+1)*size));

async function fetchAll(makeQuery){
  const out=[];let from=0;const size=1000;
  while(true){const q=await makeQuery().range(from,from+size-1);if(q.error)throw q.error;out.push(...(q.data||[]));if((q.data||[]).length<size)break;from+=size;}
  return out;
}

export default function InnovationImpact(){
  const [year,setYear]=useState(new Date().getFullYear());
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [data,setData]=useState({companies:[],indicators:[],assessments:[],items:[],mappings:[],actions:[],evidence:[]});
  const [assumptions,setAssumptions]=useState(EMPTY_ASSUMPTIONS);
  const [saved,setSaved]=useState(false);

  useEffect(()=>{try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)setAssumptions({...EMPTY_ASSUMPTIONS,...JSON.parse(raw)});}catch{}},[]);
  useEffect(()=>{load()},[year]);

  async function load(){
    const ce=getSupabaseConfigError();if(ce||!supabase){setError(ce||'Supabase not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const [co,st]=await Promise.all([
        supabase.from('companies').select('id,company_code,company_name,status').eq('status','Active').order('company_code'),
        supabase.from('sims_standards').select('id,code,name').eq('code','NDPE-IMIS-KPN').eq('status','Active').maybeSingle(),
      ]);
      if(co.error||st.error)throw(co.error||st.error);if(!st.data)throw new Error('NDPE-IMIS-KPN master belum tersedia.');
      const p=await supabase.from('sims_principles').select('id').eq('standard_id',st.data.id);if(p.error)throw p.error;
      const pids=(p.data||[]).map(x=>x.id);const cr=pids.length?await supabase.from('sims_criteria').select('id').in('principle_id',pids):{data:[]};if(cr.error)throw cr.error;
      const cids=(cr.data||[]).map(x=>x.id);const inds=cids.length?await supabase.from('sims_indicators').select('id,code').in('criterion_id',cids).eq('active',true):{data:[]};if(inds.error)throw inds.error;
      const indicatorIds=(inds.data||[]).map(x=>x.id);
      const assessments=await fetchAll(()=>supabase.from('sims_assessments').select('id,company_id,assessment_year').eq('standard_id',st.data.id).eq('assessment_year',Number(year)));
      const mappings=indicatorIds.length?await fetchAll(()=>supabase.from('sims_report_standard_mappings').select('indicator_id,standard_code,requirement_reference').in('indicator_id',indicatorIds).eq('active',true)):[];
      const assessmentIds=assessments.map(x=>x.id);
      const items=assessmentIds.length?await fetchAll(()=>supabase.from('sims_assessment_items').select('id,assessment_id,indicator_id,self_status,verifier_status').in('assessment_id',assessmentIds)):[];
      const itemIds=items.map(x=>x.id);let actions=[],evidence=[];
      for(const ids of chunks(itemIds)){
        const [ap,ev]=await Promise.all([
          supabase.from('sims_action_plans').select('id,assessment_item_id,status,priority,deadline,verifier_status').in('assessment_item_id',ids),
          supabase.from('sims_evidence').select('id,assessment_item_id').in('assessment_item_id',ids),
        ]);
        if(ap.error||ev.error)throw(ap.error||ev.error);actions.push(...(ap.data||[]));evidence.push(...(ev.data||[]));
      }
      setData({companies:co.data||[],indicators:inds.data||[],assessments,items,mappings,actions,evidence});
    }catch(e){setError(e.message||String(e));}
    finally{setLoading(false);}
  }

  const system=useMemo(()=>{
    const mappedCore=data.mappings.filter(m=>CORE.includes(m.standard_code));
    const coreCodes=[...new Set(mappedCore.map(m=>m.standard_code))];
    const byInd={};mappedCore.forEach(m=>(byInd[m.indicator_id]??=new Set()).add(m.standard_code));
    const multiReuse=Object.values(byInd).filter(s=>s.size>=2).length;
    const gapItems=data.items.filter(x=>x.self_status==='Not Fulfilled');
    const verifiedItems=data.items.filter(x=>x.self_status==='Fulfilled'&&x.verifier_status==='Verified');
    const closedVerified=data.actions.filter(a=>['Completed','Closed'].includes(a.status)&&a.verifier_status==='Verified');
    const evidenceReady=new Set(data.evidence.map(x=>x.assessment_item_id)).size;
    const reportViews=data.assessments.length*coreCodes.length;
    return{
      activePT:data.companies.length,coveredPT:data.assessments.length,coverage:data.companies.length?Math.round(data.assessments.length/data.companies.length*100):0,
      masterIndicators:data.indicators.length,mappingLinks:mappedCore.length,coreStandards:coreCodes.length,multiReuse,gaps:gapItems.length,verified:verifiedItems.length,
      closedVerified:closedVerified.length,evidenceReady,reportViews,
    };
  },[data]);

  const calc=useMemo(()=>{
    const standards=n(assumptions.standardsBefore),assessBefore=n(assumptions.assessmentHoursBefore),masterAfter=n(assumptions.masterHoursAfter),repBefore=n(assumptions.reportHoursBefore),repAfter=n(assumptions.reportHoursAfter),evBefore=n(assumptions.evidenceHoursBefore),evAfter=n(assumptions.evidenceHoursAfter),cycles=n(assumptions.cyclesPerYear)||1,cost=n(assumptions.costPerHour);
    const ready=standards>0&&assessBefore>0&&assumptions.masterHoursAfter!=='';
    if(!ready)return{ready:false};
    const beforePerPT=standards*assessBefore+repBefore+evBefore;
    const afterPerPT=masterAfter+repAfter+evAfter;
    const savedPerPT=Math.max(0,beforePerPT-afterPerPT);
    const annualBefore=beforePerPT*system.coveredPT*cycles,annualAfter=afterPerPT*system.coveredPT*cycles,annualSaved=Math.max(0,annualBefore-annualAfter);
    return{ready:true,beforePerPT,afterPerPT,savedPerPT,annualBefore,annualAfter,annualSaved,workdays:annualSaved/8,savingPct:annualBefore?Math.round(annualSaved/annualBefore*100):0,value:cost>0?annualSaved*cost:null,cycles};
  },[assumptions,system.coveredPT]);

  function patch(key,value){setAssumptions(v=>({...v,[key]:value}));setSaved(false)}
  function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(assumptions));setSaved(true)}
  function reset(){localStorage.removeItem(STORAGE_KEY);setAssumptions(EMPTY_ASSUMPTIONS);setSaved(false)}
  function exportCsv(){
    const rows=[['Type','Metric','Value','Source'],['System Evidence','Assessment Year',year,'SIMS'],['System Evidence','Active PT',system.activePT,'Master Company'],['System Evidence','PT with NDPE assessment',system.coveredPT,'SIMS'],['System Evidence','NDPE master indicators',system.masterIndicators,'SIMS'],['System Evidence','Core crosswalk links',system.mappingLinks,'SIMS Mapping'],['System Evidence','Multi-standard reusable indicators',system.multiReuse,'SIMS Mapping'],['System Evidence','Supported report views',system.reportViews,'Calculated from system coverage'],['System Evidence','Closed + verified actions',system.closedVerified,'Action Plan'],['User Assumption','Separate standards before',assumptions.standardsBefore,'User input'],['User Assumption','Assessment hours / standard',assumptions.assessmentHoursBefore,'User input'],['User Assumption','Single-master hours after',assumptions.masterHoursAfter,'User input'],['User Assumption','Report hours before',assumptions.reportHoursBefore,'User input'],['User Assumption','Report hours after',assumptions.reportHoursAfter,'User input'],['User Assumption','Evidence hours before',assumptions.evidenceHoursBefore,'User input'],['User Assumption','Evidence hours after',assumptions.evidenceHoursAfter,'User input'],['User Assumption','Cycles / year',assumptions.cyclesPerYear,'User input']];
    if(calc.ready){rows.push(['Calculated Impact','Annual hours before',calc.annualBefore,'Formula'],['Calculated Impact','Annual hours after',calc.annualAfter,'Formula'],['Calculated Impact','Annual hours saved',calc.annualSaved,'Formula'],['Calculated Impact','Workdays saved',calc.workdays,'8 hours/day'],['Calculated Impact','Efficiency improvement',`${calc.savingPct}%`,'Formula']);if(calc.value!==null)rows.push(['Calculated Impact','Estimated labor value',calc.value,'User cost/hour × saved hours']);}
    const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`SMD-Innovation-Impact-${year}.csv`;a.click();URL.revokeObjectURL(url);
  }

  return <div className="impact-wrap">
    <style>{`
      .impact-wrap{padding:26px 28px 44px;color:#173f2d}.impact-hero{background:linear-gradient(135deg,#0c4b35,#123f55);border-radius:22px;padding:24px;color:#fff;display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.impact-hero h1{margin:5px 0 8px;font-size:29px}.impact-hero p{margin:0;max-width:760px;color:#d9e8e0;line-height:1.55}.impact-eyebrow{font-size:10px;font-weight:900;letter-spacing:.12em;color:#bff36d}.impact-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.impact-actions a,.impact-actions button{border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;padding:9px 12px;border-radius:10px;font-weight:800;font-size:11px;cursor:pointer;text-decoration:none}.impact-actions button.primary{background:#d7f36a;color:#173f2d;border-color:#d7f36a}.impact-year{display:flex;align-items:center;gap:8px;margin:18px 0}.impact-year span{font-size:10px;font-weight:900;text-transform:uppercase;color:#6c8175}.impact-year input{width:100px;height:38px;border:1px solid #d6e3db;border-radius:9px;padding:0 10px}.impact-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.impact-card{background:#fff;border:1px solid #dce8e0;border-radius:14px;padding:14px}.impact-card small{display:block;color:#718379;font-weight:700;margin-bottom:4px}.impact-card strong{font-size:25px}.impact-card span{display:block;color:#7e9086;font-size:10px;margin-top:4px}.impact-section{background:#fff;border:1px solid #dce8e0;border-radius:17px;padding:18px;margin-top:16px}.impact-section h2{margin:0 0 5px;font-size:17px}.impact-section>p{margin:0 0 15px;color:#718379;font-size:11px}.impact-badge{display:inline-block;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900;background:#edf7f1;color:#216040}.impact-badge.assumption{background:#fff3d9;color:#75550a}.assumption-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.assumption-field{border:1px solid #e1eae4;background:#fbfdfb;border-radius:12px;padding:11px}.assumption-field label{display:block;font-size:10px;font-weight:900;color:#385c49;margin-bottom:5px}.assumption-field input{width:100%;height:38px;border:1px solid #d6e3db;border-radius:8px;padding:0 9px}.assumption-field small{display:block;color:#83948a;font-size:9px;margin-top:5px;line-height:1.35}.impact-result{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-top:14px}.impact-result .r{border-radius:12px;padding:12px;background:#f4f8f5;border:1px solid #e0e9e3}.impact-result .r.hero{background:#0e5037;color:#fff}.impact-result small{display:block;opacity:.7}.impact-result strong{font-size:22px}.impact-table{width:100%;border-collapse:collapse;font-size:11px;margin-top:12px}.impact-table th{text-align:left;background:#f1f7f3;padding:9px}.impact-table td{padding:9px;border-top:1px solid #edf1ef}.impact-note{margin-top:12px;padding:11px;border-radius:10px;background:#f8faf9;color:#64776c;font-size:10px;line-height:1.5}.impact-warning{margin-top:14px;padding:12px;border-radius:11px;background:#fff8e6;border:1px solid #ead9a4;color:#6f5615}.impact-success{margin-top:10px;color:#246844;font-size:10px;font-weight:800}.impact-error{margin:14px 0;padding:12px;border-radius:10px;background:#fdeceb;color:#8d312c}@media(max-width:1050px){.impact-grid{grid-template-columns:repeat(2,1fr)}.assumption-grid{grid-template-columns:repeat(2,1fr)}.impact-result{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.impact-wrap{padding:18px}.impact-hero{display:block}.impact-actions{justify-content:flex-start;margin-top:15px}.impact-grid,.assumption-grid,.impact-result{grid-template-columns:1fr}}
    `}</style>
    <section className="impact-hero"><div><div className="impact-eyebrow">INNOVATION COMPETITION · BUSINESS IMPACT</div><h1>Innovation Impact Calculator</h1><p>Mengubah cerita inovasi SMD menjadi angka yang dapat ditelusuri. Data aktual dari SIMS dipisahkan dari asumsi Before/After yang Anda masukkan sendiri.</p></div><div className="impact-actions"><Link href="/innovation-cockpit">← Innovation Cockpit</Link><button onClick={exportCsv}>Export Evidence CSV</button><button className="primary" onClick={save}>Save Assumptions</button></div></section>
    <div className="impact-year"><span>Assessment Year</span><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value))}/><button onClick={reset} style={{border:0,background:'transparent',fontSize:10,color:'#718379',cursor:'pointer'}}>Reset assumptions</button></div>
    {error?<div className="impact-error">{error}</div>:null}{loading?<div className="impact-warning">Loading system evidence…</div>:null}{saved?<div className="impact-success">✓ Assumptions saved in this browser.</div>:null}

    <section className="impact-section"><span className="impact-badge">SYSTEM EVIDENCE</span><h2 style={{marginTop:8}}>What SMD can prove automatically</h2><p>Angka di bawah berasal dari data live dan crosswalk SIMS, bukan asumsi manual.</p><div className="impact-grid">
      <Metric label="Active PT" value={loading?'…':system.activePT} hint={`${system.coveredPT} PT assessed · ${system.coverage}% coverage`}/><Metric label="NDPE Master" value={loading?'…':system.masterIndicators} hint="Single source indicators"/><Metric label="Core Mapping Links" value={loading?'…':system.mappingLinks} hint={`${system.coreStandards} core standards mapped`}/><Metric label="Multi-standard Reuse" value={loading?'…':system.multiReuse} hint="Indicators mapped to ≥2 core standards"/><Metric label="Supported Report Views" value={loading?'…':system.reportViews} hint="PT assessments × mapped core standards"/><Metric label="Verified Fulfilled" value={loading?'…':system.verified} hint="NDPE items fulfilled + verified"/><Metric label="Closed Loop" value={loading?'…':system.closedVerified} hint="Completed/Closed + verified actions"/><Metric label="Evidence Ready" value={loading?'…':system.evidenceReady} hint="Assessment items with evidence"/>
    </div></section>

    <section className="impact-section"><span className="impact-badge assumption">USER ASSUMPTION</span><h2 style={{marginTop:8}}>Before vs After baseline</h2><p>Isi berdasarkan time study / pengalaman aktual. Nilai ini disimpan lokal di browser dan tidak dianggap sebagai data sistem.</p><div className="assumption-grid">
      <Field label="Separate standards before" value={assumptions.standardsBefore} onChange={v=>patch('standardsBefore',v)} hint="Contoh: jumlah standard yang sebelumnya dikerjakan sebagai assessment terpisah."/>
      <Field label="Assessment hours / standard (Before)" value={assumptions.assessmentHoursBefore} onChange={v=>patch('assessmentHoursBefore',v)} hint="Jam rata-rata untuk input/review 1 standard per PT."/>
      <Field label="Single-master assessment hours (After)" value={assumptions.masterHoursAfter} onChange={v=>patch('masterHoursAfter',v)} hint="Jam rata-rata mengisi NDPE single source per PT."/>
      <Field label="Report preparation hours (Before)" value={assumptions.reportHoursBefore} onChange={v=>patch('reportHoursBefore',v)} hint="Total jam kompilasi report per PT per cycle."/>
      <Field label="Report preparation hours (After)" value={assumptions.reportHoursAfter} onChange={v=>patch('reportHoursAfter',v)} hint="Setelah cross-standard report generator."/>
      <Field label="Evidence retrieval hours (Before)" value={assumptions.evidenceHoursBefore} onChange={v=>patch('evidenceHoursBefore',v)} hint="Jam mencari / mengulang evidence."/>
      <Field label="Evidence retrieval hours (After)" value={assumptions.evidenceHoursAfter} onChange={v=>patch('evidenceHoursAfter',v)} hint="Setelah evidence reuse dari NDPE."/>
      <Field label="Assessment cycles / year" value={assumptions.cyclesPerYear} onChange={v=>patch('cyclesPerYear',v)} hint="Berapa kali siklus serupa terjadi dalam setahun."/>
      <Field label="Optional labor cost / hour (Rp)" value={assumptions.costPerHour} onChange={v=>patch('costPerHour',v)} hint="Opsional. Hanya untuk estimasi value, bukan saving kas aktual."/>
    </div>
    {!calc.ready?<div className="impact-warning">Isi minimal: Separate standards before, Assessment hours / standard, dan Single-master hours after untuk menghitung impact.</div>:<>
      <div className="impact-result"><div className="r"><small>Before / PT / Cycle</small><strong>{fmt(calc.beforePerPT)} h</strong></div><div className="r"><small>After / PT / Cycle</small><strong>{fmt(calc.afterPerPT)} h</strong></div><div className="r hero"><small>Annual Hours Saved</small><strong>{fmt(calc.annualSaved)} h</strong></div><div className="r"><small>Workdays Saved</small><strong>{fmt(calc.workdays)}</strong></div><div className="r"><small>Efficiency Improvement</small><strong>{calc.savingPct}%</strong></div></div>
      <table className="impact-table"><thead><tr><th>Calculation</th><th>Before</th><th>After</th><th>Difference</th></tr></thead><tbody><tr><td>Per PT / cycle</td><td>{fmt(calc.beforePerPT)} h</td><td>{fmt(calc.afterPerPT)} h</td><td>{fmt(calc.savedPerPT)} h saved</td></tr><tr><td>Portfolio / year ({system.coveredPT} assessed PT × {calc.cycles} cycle)</td><td>{fmt(calc.annualBefore)} h</td><td>{fmt(calc.annualAfter)} h</td><td>{fmt(calc.annualSaved)} h saved</td></tr>{calc.value!==null?<tr><td>Estimated labor value</td><td colSpan="2">User-entered cost/hour × saved hours</td><td>{rupiah(calc.value)}</td></tr>:null}</tbody></table>
    </>}
    <div className="impact-note"><strong>Methodology:</strong> Before hours = (separate standards × assessment hours/standard) + report preparation + evidence retrieval. After hours = single NDPE master assessment + report preparation after automation + evidence retrieval after reuse. Annual impact uses only PT that already have an NDPE assessment in the selected year. Workday = 8 hours. Monetary value is an estimate of labor capacity, not automatically a realized cash saving.</div></section>
  </div>
}

function Metric({label,value,hint}){return <div className="impact-card"><small>{label}</small><strong>{value}</strong><span>{hint}</span></div>}
function Field({label,value,onChange,hint}){return <div className="assumption-field"><label>{label}</label><input type="number" min="0" step="0.1" value={value} onChange={e=>onChange(e.target.value)} placeholder="0"/><small>{hint}</small></div>}
