'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';

const DEMO_SECONDS=180;
const IMPACT_KEY='smd-innovation-impact-v1';
const CORE=['ISPO','RSPO','ISCC'];
const n=v=>Number(v||0);
const fmt=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:1});
const chunks=(arr,size=150)=>Array.from({length:Math.ceil(arr.length/size)},(_,i)=>arr.slice(i*size,(i+1)*size));
const isOpen=s=>!['Completed','Closed'].includes(s||'Open');

async function fetchAll(makeQuery){
  const out=[];let from=0;const size=1000;
  while(true){const q=await makeQuery().range(from,from+size-1);if(q.error)throw q.error;out.push(...(q.data||[]));if((q.data||[]).length<size)break;from+=size;}
  return out;
}

export default function CompetitionDemoMode(){
  const currentYear=new Date().getFullYear();
  const [year,setYear]=useState(currentYear);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [data,setData]=useState({companies:[],indicators:[],assessments:[],items:[],mappings:[],actions:[],evidence:[]});
  const [impact,setImpact]=useState(null);
  const [step,setStep]=useState(0),[started,setStarted]=useState(false),[paused,setPaused]=useState(false),[secondsLeft,setSecondsLeft]=useState(DEMO_SECONDS),[focus,setFocus]=useState(false);

  useEffect(()=>{load()},[year]);
  useEffect(()=>{try{const raw=localStorage.getItem(IMPACT_KEY);setImpact(raw?JSON.parse(raw):null)}catch{setImpact(null)}},[]);
  useEffect(()=>{
    if(!started||paused||secondsLeft<=0)return;
    const id=setInterval(()=>setSecondsLeft(s=>Math.max(0,s-1)),1000);
    return()=>clearInterval(id);
  },[started,paused,secondsLeft]);

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
      const cids=(cr.data||[]).map(x=>x.id);const ind=cids.length?await supabase.from('sims_indicators').select('id,code').in('criterion_id',cids).eq('active',true):{data:[]};if(ind.error)throw ind.error;
      const indicatorIds=(ind.data||[]).map(x=>x.id);
      const [assessments,mappings]=await Promise.all([
        fetchAll(()=>supabase.from('sims_assessments').select('id,company_id,assessment_year').eq('standard_id',st.data.id).eq('assessment_year',Number(year))),
        indicatorIds.length?fetchAll(()=>supabase.from('sims_report_standard_mappings').select('indicator_id,standard_code,requirement_reference').in('indicator_id',indicatorIds).eq('active',true)):[],
      ]);
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
      setData({companies:co.data||[],indicators:ind.data||[],assessments,items,mappings,actions,evidence});
    }catch(e){setError(e.message||String(e));}finally{setLoading(false)}
  }

  const system=useMemo(()=>{
    const mapped=data.mappings.filter(m=>CORE.includes(m.standard_code));
    const byStd=Object.fromEntries(CORE.map(code=>[code,mapped.filter(m=>m.standard_code===code).length]));
    const verified=data.items.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;
    const gaps=data.items.filter(i=>i.self_status==='Not Fulfilled').length;
    const evidenceReady=new Set(data.evidence.map(e=>e.assessment_item_id)).size;
    const openActions=data.actions.filter(a=>isOpen(a.status)).length;
    const closedVerified=data.actions.filter(a=>['Completed','Closed'].includes(a.status)&&a.verifier_status==='Verified').length;
    const today=new Date();today.setHours(0,0,0,0);
    const overdue=data.actions.filter(a=>{if(!isOpen(a.status)||!a.deadline)return false;const d=new Date(`${a.deadline}T00:00:00`);return !Number.isNaN(d.getTime())&&d<today}).length;
    const multi={};mapped.forEach(m=>(multi[m.indicator_id]??=new Set()).add(m.standard_code));
    return{activePT:data.companies.length,coveredPT:new Set(data.assessments.map(a=>a.company_id)).size,master:data.indicators.length,mappingLinks:mapped.length,multiReuse:Object.values(multi).filter(s=>s.size>=2).length,byStd,verified,gaps,evidenceReady,openActions,closedVerified,overdue};
  },[data]);

  const impactCalc=useMemo(()=>{
    if(!impact)return null;
    const standards=n(impact.standardsBefore),assessBefore=n(impact.assessmentHoursBefore),masterAfter=n(impact.masterHoursAfter),repBefore=n(impact.reportHoursBefore),repAfter=n(impact.reportHoursAfter),evBefore=n(impact.evidenceHoursBefore),evAfter=n(impact.evidenceHoursAfter),cycles=n(impact.cyclesPerYear)||1;
    if(!(standards>0&&assessBefore>0&&impact.masterHoursAfter!==''))return null;
    const before=standards*assessBefore+repBefore+evBefore,after=masterAfter+repAfter+evAfter;
    const saved=Math.max(0,(before-after)*system.coveredPT*cycles);
    return{hours:saved,days:saved/8,pct:before?Math.round(Math.max(0,before-after)/before*100):0};
  },[impact,system.coveredPT]);

  const steps=useMemo(()=>[
    {key:'problem',kicker:'01 · THE CHALLENGE',title:'From fragmented preparation to one sustainability operating system',summary:'SMD addresses the risk of repeated data preparation, scattered evidence and disconnected follow-up by bringing assessment, warning, action and reporting into one flow.',presenter:'“Tantangan yang kami jawab bukan sekadar membuat dashboard. Kami menyatukan proses sustainability yang sebelumnya berpotensi tersebar menjadi satu alur data yang dapat ditelusuri.”',route:'/innovation-cockpit',routeLabel:'Open Innovation Cockpit',metrics:[['Active PT',system.activePT,'Portfolio in master company'],['PT Covered',system.coveredPT,`NDPE assessment ${year}`],['NDPE Master',system.master,'Single source indicators']]},
    {key:'input',kicker:'02 · INPUT ONCE',title:'One NDPE master becomes the single source of truth',summary:'Assessment status, explanation and evidence are entered once at NDPE level. Downstream modules reuse the same assessment item instead of creating parallel records.',presenter:`“User cukup bekerja pada ${system.master||177} indikator master NDPE. Data yang sama menjadi sumber untuk report, action plan dan compliance.”`,route:'/sims/assessment',routeLabel:'Open NDPE Policy & Report',metrics:[['Master Indicators',system.master,'Single-source NDPE'],['Evidence Ready',system.evidenceReady,'Assessment items with evidence'],['Verified Items',system.verified,'Fulfilled + Verified']]},
    {key:'crosswalk',kicker:'03 · MULTI-STANDARD CROSSWALK',title:'One input is reused across verified standards',summary:'The crosswalk maps NDPE indicators to external standard references without creating a new assessment for every standard.',presenter:`“Dari satu sumber NDPE, sistem saat ini memiliki ${fmt(system.mappingLinks)} mapping links yang terverifikasi di database untuk ISPO, RSPO dan ISCC.”`,route:'/sims/compliance',routeLabel:'Open Cross-Standard Compliance',metrics:[['ISPO',system.byStd.ISPO,'Mapped NDPE indicators'],['RSPO',system.byStd.RSPO,'Mapped NDPE indicators'],['ISCC',system.byStd.ISCC,'Mapped NDPE indicators'],['Multi-Reuse',system.multiReuse,'Indicators reused by ≥2 standards']]},
    {key:'warning',kicker:'04 · PREVENT BEFORE LATE',title:'Early Warning turns monitoring into preventive management',summary:'SMD highlights active gaps and overdue corrective actions so management can focus before an issue becomes an audit surprise.',presenter:`“Sistem tidak hanya menunggu laporan. Saat ini engine membaca ${system.gaps} gap, ${system.openActions} open action dan ${system.overdue} overdue action dari data live.”`,route:'/early-warning',routeLabel:'Open Early Warning',metrics:[['NDPE Gaps',system.gaps,'Not Fulfilled'],['Open Actions',system.openActions,'Not Completed / Closed'],['Overdue',system.overdue,'Past deadline']]},
    {key:'closure',kicker:'05 · CLOSED LOOP',title:'Gap → Action → Evidence → Verification → Compliance',summary:'When a corrective action is completed and verified, the related NDPE item is resolved and compliance updates from the same source.',presenter:`“Closure tidak berhenti di checklist. ${system.closedVerified} action sudah tercatat Completed/Closed + Verified dan menjadi bagian dari closed-loop governance.”`,route:'/sims/action-plan',routeLabel:'Open Sustainability Action Plan',metrics:[['Closed + Verified',system.closedVerified,'Corrective actions'],['Verified NDPE',system.verified,'Current verified alignment'],['Open Actions',system.openActions,'Remaining follow-up']]},
    {key:'audit',kicker:'06 · ONE-CLICK AUDIT PREPARATION',title:'Digital Audit Room packages the same data for audit readiness',summary:'Choose PT, year and a verified standard to assemble requirement status, evidence, corrective action, verifier and outstanding items in one audit pack.',presenter:'“Ketika auditor atau buyer meminta data, kami tidak mulai mencari dokumen dari nol. Audit Room menyusun pack dari data yang sudah hidup di sistem.”',route:'/audit-room',routeLabel:'Open Digital Audit Room',metrics:[['Supported Views',4,'NDPE + ISPO + RSPO + ISCC'],['Mapping Links',system.mappingLinks,'Verified crosswalk records'],['Evidence Items',data.evidence.length,'Reusable source evidence']]},
    {key:'impact',kicker:'07 · BUSINESS IMPACT',title:'Innovation value is separated into system evidence and user assumptions',summary:'SMD distinguishes what the system can prove automatically from time/cost assumptions entered by the process owner, keeping the competition claim auditable.',presenter:impactCalc?`“Berdasarkan baseline yang sudah disimpan, estimasi kapasitas yang dapat dihemat adalah ${fmt(impactCalc.hours)} jam atau ${fmt(impactCalc.days)} hari kerja per tahun. Asumsi dan rumusnya dapat ditelusuri.”`:'“Untuk klaim efisiensi, kami tidak membuat angka asumsi sebagai fakta. Baseline Before/After diisi terpisah dan rumusnya transparan di Innovation Impact.”',route:'/innovation-impact',routeLabel:'Open Innovation Impact',metrics:impactCalc?[['Hours Saved',fmt(impactCalc.hours),'Calculated from saved assumptions'],['Workdays Saved',fmt(impactCalc.days),'8 hours / workday'],['Efficiency',`${impactCalc.pct}%`,'Calculated improvement']]:[['Impact Baseline','Not set','Fill Before/After assumptions'],['System Evidence',system.mappingLinks,'Crosswalk links'],['Closed Loop',system.closedVerified,'Verified closures']]},
  ],[system,year,data.evidence.length,impactCalc]);

  const current=steps[step];
  const mm=String(Math.floor(secondsLeft/60)).padStart(2,'0'),ss=String(secondsLeft%60).padStart(2,'0');
  const stepPct=((step+1)/steps.length)*100,timePct=((DEMO_SECONDS-secondsLeft)/DEMO_SECONDS)*100;
  function startDemo(){setStep(0);setSecondsLeft(DEMO_SECONDS);setStarted(true);setPaused(false)}
  function next(){if(step<steps.length-1)setStep(s=>s+1);else setStarted(false)}
  function prev(){if(step>0)setStep(s=>s-1)}

  return <main className={`demo-shell ${focus?'focus':''}`}>
    <style>{styles}</style>
    <section className="demo-topbar">
      <div><span>INNOVATION COMPETITION · GUIDED STORY</span><h1>Competition Demo Mode</h1><p>3-minute guided walkthrough using live SMD evidence.</p></div>
      <div className="demo-controls"><label>Year <input type="number" value={year} onChange={e=>setYear(Number(e.target.value))}/></label><button onClick={()=>setFocus(v=>!v)}>{focus?'Exit Focus':'Presentation Focus'}</button><button className="primary" onClick={startDemo}>{started?'Restart Demo':'Start 3-Minute Demo'}</button></div>
    </section>

    {error?<div className="demo-error">{error}</div>:null}
    <section className="demo-status">
      <div className="timer"><small>TIME</small><strong className={secondsLeft<=30?'danger':''}>{mm}:{ss}</strong><button onClick={()=>setPaused(v=>!v)} disabled={!started}>{paused?'Resume':'Pause'}</button></div>
      <div className="status-track"><div className="status-row"><span>Story Progress</span><b>Step {step+1} / {steps.length}</b></div><div className="track"><i style={{width:`${stepPct}%`}}/></div><div className="status-row small"><span>Timer progress</span><span>{Math.round(timePct)}%</span></div></div>
      <div className="live-pill"><i className={loading?'loading':''}/><div><small>LIVE SYSTEM EVIDENCE</small><strong>{loading?'Loading…':`${system.coveredPT} PT · ${system.master} NDPE`}</strong></div></div>
    </section>

    <section className="demo-layout">
      <nav className="demo-steps">{steps.map((s,i)=><button key={s.key} className={`${i===step?'active':''} ${i<step?'done':''}`} onClick={()=>setStep(i)}><em>{i<step?'✓':String(i+1).padStart(2,'0')}</em><span>{s.kicker.split(' · ')[1]}<small>{s.title}</small></span></button>)}</nav>

      <article className="demo-slide">
        <div className="slide-kicker">{current.kicker}</div><h2>{current.title}</h2><p className="slide-summary">{current.summary}</p>
        <div className={`metric-grid ${current.metrics.length===4?'four':''}`}>{current.metrics.map(([label,value,hint])=><div className="metric" key={label}><small>{label}</small><strong>{value}</strong><span>{hint}</span></div>)}</div>
        <div className="presenter-note"><span>PRESENTER NOTE</span><p>{current.presenter}</p></div>
        <div className="proof-note"><b>Proof principle:</b> live system metrics are shown separately from process-owner assumptions. Cross-standard views are alignment/crosswalk support, not certification conclusions.</div>
        <div className="slide-actions"><button onClick={prev} disabled={step===0}>← Back</button><Link href={current.route}>{current.routeLabel} ↗</Link><button className="next" onClick={next}>{step===steps.length-1?'Finish Demo':'Next →'}</button></div>
      </article>
    </section>

    <section className="demo-footer"><div><b>One Data</b><span>NDPE Single Source</span></div><i>→</i><div><b>Multi Standard</b><span>Verified Crosswalk</span></div><i>→</i><div><b>Preventive</b><span>Early Warning</span></div><i>→</i><div><b>Closed Loop</b><span>Action + Verification</span></div><i>→</i><div><b>Audit Ready</b><span>One-Click Pack</span></div></section>
  </main>
}

const styles=`
.demo-shell{padding:26px 28px 42px;color:#173f2d;background:#f4f7f5;min-height:calc(100vh - 74px)}.demo-shell.focus{position:fixed;inset:0;z-index:99999;overflow:auto;min-height:100vh;padding:24px 32px;background:#f4f7f5}.demo-topbar{background:linear-gradient(135deg,#083e31,#103e56 64%,#34502d);border-radius:22px;padding:22px 24px;color:white;display:flex;justify-content:space-between;gap:20px;align-items:center}.demo-topbar span{font-size:10px;letter-spacing:.13em;font-weight:900;color:#c9ef72}.demo-topbar h1{margin:4px 0 5px;font-size:28px}.demo-topbar p{margin:0;color:#d5e4dd;font-size:12px}.demo-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.demo-controls label{font-size:10px;color:#c9d8d1;font-weight:800}.demo-controls input{display:block;width:90px;height:38px;margin-top:4px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);border-radius:9px;color:white;padding:0 9px}.demo-controls button,.slide-actions button,.slide-actions a{height:40px;border-radius:10px;padding:0 13px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:white;font-weight:900;font-size:10px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}.demo-controls .primary{background:#d7f36a;color:#173f2d;border-color:#d7f36a}.demo-error{margin-top:12px;padding:12px;background:#fdeceb;color:#8d312c;border-radius:10px}.demo-status{display:grid;grid-template-columns:150px 1fr 220px;gap:11px;margin:14px 0}.timer,.status-track,.live-pill{background:white;border:1px solid #dce7e0;border-radius:14px;padding:12px}.timer{display:flex;align-items:center;gap:9px}.timer small{font-size:8px;font-weight:900;color:#7c8f84}.timer strong{font-size:21px}.timer strong.danger{color:#b63a34}.timer button{margin-left:auto;border:0;background:#edf4ef;border-radius:7px;padding:6px 8px;font-size:9px;font-weight:800;color:#3b5b49}.status-row{display:flex;justify-content:space-between;font-size:9px;font-weight:900;color:#526b5d}.status-row.small{margin-top:5px;color:#86968d;font-weight:700}.track{height:7px;background:#edf2ef;border-radius:999px;overflow:hidden;margin-top:7px}.track i{display:block;height:100%;background:linear-gradient(90deg,#2db66f,#d7f36a);border-radius:999px}.live-pill{display:flex;align-items:center;gap:10px}.live-pill>i{width:10px;height:10px;border-radius:50%;background:#37bd74;box-shadow:0 0 0 5px #e9f7ef}.live-pill>i.loading{background:#d7a63f;box-shadow:0 0 0 5px #fff5df}.live-pill small{display:block;font-size:8px;color:#7c8f84;font-weight:900}.live-pill strong{font-size:11px}.demo-layout{display:grid;grid-template-columns:250px 1fr;gap:14px}.demo-steps{display:flex;flex-direction:column;gap:7px}.demo-steps button{border:1px solid #dce7e0;background:white;border-radius:12px;padding:10px;text-align:left;display:flex;gap:10px;cursor:pointer;color:#294d39}.demo-steps button.active{border-color:#5ab981;background:#eef8f2;box-shadow:0 7px 20px rgba(32,111,70,.08)}.demo-steps button.done{background:#f7faf8}.demo-steps em{width:29px;height:29px;flex:0 0 29px;border-radius:9px;background:#edf3ef;display:grid;place-items:center;font-style:normal;font-size:9px;font-weight:900}.demo-steps .active em{background:#185d3d;color:white}.demo-steps span{font-size:9px;font-weight:900}.demo-steps small{display:block;margin-top:3px;font-size:8.5px;font-weight:600;color:#7a8d82;line-height:1.25}.demo-slide{background:white;border:1px solid #dce7e0;border-radius:18px;padding:25px;min-height:510px;display:flex;flex-direction:column}.slide-kicker{font-size:10px;letter-spacing:.1em;color:#56816a;font-weight:900}.demo-slide h2{font-size:30px;line-height:1.13;max-width:900px;margin:8px 0 10px;color:#173f2d}.slide-summary{max-width:900px;color:#61766a;line-height:1.55;margin:0 0 18px;font-size:13px}.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric-grid.four{grid-template-columns:repeat(4,1fr)}.metric{border:1px solid #e0e8e3;background:#f8fbf9;border-radius:13px;padding:14px}.metric small{display:block;font-size:9px;font-weight:900;color:#688075}.metric strong{display:block;font-size:27px;margin:3px 0;color:#123f2d}.metric span{font-size:9px;color:#87968e}.presenter-note{margin-top:17px;border-left:4px solid #d7f36a;background:#153f31;color:white;border-radius:0 13px 13px 0;padding:14px 16px}.presenter-note span{font-size:8px;letter-spacing:.12em;color:#caeb7e;font-weight:900}.presenter-note p{font-size:13px;line-height:1.5;margin:5px 0 0;color:#f0f6f2}.proof-note{margin-top:10px;background:#f5f8f6;border:1px solid #e0e8e3;border-radius:10px;padding:10px;color:#73857b;font-size:9.5px;line-height:1.45}.slide-actions{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:18px}.slide-actions button,.slide-actions a{color:#385947;background:white;border-color:#d5e2da}.slide-actions .next{margin-left:auto;background:#173f2d;color:white;border-color:#173f2d}.slide-actions button:disabled{opacity:.4;cursor:not-allowed}.demo-footer{margin-top:13px;background:white;border:1px solid #dce7e0;border-radius:14px;padding:12px;display:flex;align-items:center;justify-content:center;gap:13px}.demo-footer div{text-align:center}.demo-footer b{display:block;font-size:10px}.demo-footer span{font-size:8px;color:#819289}.demo-footer i{font-style:normal;color:#87a292}@media(max-width:1050px){.demo-status{grid-template-columns:140px 1fr}.live-pill{grid-column:1/-1}.demo-layout{grid-template-columns:1fr}.demo-steps{display:grid;grid-template-columns:repeat(4,1fr)}.metric-grid.four{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.demo-shell,.demo-shell.focus{padding:14px}.demo-topbar{display:block}.demo-controls{justify-content:flex-start;margin-top:13px}.demo-status{grid-template-columns:1fr}.live-pill{grid-column:auto}.demo-steps{grid-template-columns:1fr 1fr}.metric-grid,.metric-grid.four{grid-template-columns:1fr}.demo-slide h2{font-size:24px}.demo-footer{overflow:auto;justify-content:flex-start}}
`;
