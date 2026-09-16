'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';

const CORE=[
  {code:'NDPE',label:'NDPE Master'},
  {code:'ISPO',label:'ISPO'},
  {code:'RSPO',label:'RSPO'},
  {code:'ISCC',label:'ISCC'},
];

const activeAction=s=>!['Completed','Closed'].includes(s||'Open');
const pct=(a,b)=>b?Math.round(a/b*100):0;

async function fetchPaged(makeQuery,pageSize=1000){
  const all=[];let from=0;
  while(true){
    const q=await makeQuery().range(from,from+pageSize-1);
    if(q.error)throw q.error;
    const rows=q.data||[];all.push(...rows);
    if(rows.length<pageSize)break;
    from+=pageSize;
  }
  return all;
}

async function fetchChunked(ids,makeQuery,chunkSize=250){
  const all=[];
  for(let i=0;i<ids.length;i+=chunkSize){
    const part=ids.slice(i,i+chunkSize);
    const rows=await fetchPaged(()=>makeQuery(part));
    all.push(...rows);
  }
  return all;
}

export default function InnovationCockpit(){
  const [year,setYear]=useState(new Date().getFullYear());
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [data,setData]=useState({companies:[],standard:null,indicators:[],assessments:[],items:[],mappings:[],actions:[],evidence:[]});

  useEffect(()=>{load()},[year]);

  async function load(){
    const ce=getSupabaseConfigError();
    if(ce||!supabase){setError(ce||'Supabase not configured.');setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const [co,st]=await Promise.all([
        supabase.from('companies').select('id,company_code,company_name,region,province,status').eq('status','Active').order('company_code'),
        supabase.from('sims_standards').select('id,code,name,status').eq('code','NDPE-IMIS-KPN').eq('status','Active').maybeSingle(),
      ]);
      if(co.error||st.error)throw(co.error||st.error);
      if(!st.data)throw new Error('NDPE-IMIS-KPN master belum tersedia.');

      const p=await supabase.from('sims_principles').select('id').eq('standard_id',st.data.id);
      if(p.error)throw p.error;
      const pids=(p.data||[]).map(x=>x.id);
      const c=pids.length?await supabase.from('sims_criteria').select('id').in('principle_id',pids):{data:[]};
      if(c.error)throw c.error;
      const cids=(c.data||[]).map(x=>x.id);
      const ind=cids.length?await supabase.from('sims_indicators').select('id,code,description,criterion_id').in('criterion_id',cids).eq('active',true):{data:[]};
      if(ind.error)throw ind.error;
      const indicatorIds=(ind.data||[]).map(x=>x.id);

      const [ass,mp]=await Promise.all([
        supabase.from('sims_assessments').select('id,company_id,standard_id,assessment_year,created_at').eq('standard_id',st.data.id).eq('assessment_year',Number(year)),
        indicatorIds.length?supabase.from('sims_report_standard_mappings').select('indicator_id,standard_code,standard_name,requirement_reference').in('indicator_id',indicatorIds).eq('active',true):Promise.resolve({data:[]}),
      ]);
      if(ass.error||mp.error)throw(ass.error||mp.error);
      const assessmentIds=(ass.data||[]).map(x=>x.id);
      const itemRows=assessmentIds.length?await fetchPaged(()=>supabase.from('sims_assessment_items').select('id,assessment_id,indicator_id,self_status,verifier_status,updated_at').in('assessment_id',assessmentIds)):[];
      const itemIds=itemRows.map(x=>x.id);
      const [actionRows,evidenceRows]=await Promise.all([
        itemIds.length?fetchChunked(itemIds,ids=>supabase.from('sims_action_plans').select('id,assessment_item_id,status,priority,deadline,verifier_status,updated_at').in('assessment_item_id',ids)):Promise.resolve([]),
        itemIds.length?fetchChunked(itemIds,ids=>supabase.from('sims_evidence').select('id,assessment_item_id').in('assessment_item_id',ids)):Promise.resolve([]),
      ]);
      setData({companies:co.data||[],standard:st.data,indicators:ind.data||[],assessments:ass.data||[],items:itemRows,mappings:mp.data||[],actions:actionRows,evidence:evidenceRows});
    }catch(e){setError(e.message||String(e));setData(v=>({...v,assessments:[],items:[],actions:[],evidence:[]}));}
    finally{setLoading(false);}
  }

  const companyMap=useMemo(()=>Object.fromEntries(data.companies.map(x=>[x.id,x])),[data.companies]);
  const assessmentByCompany=useMemo(()=>Object.fromEntries(data.assessments.map(x=>[x.company_id,x])),[data.assessments]);
  const itemsByAssessment=useMemo(()=>{const m={};data.items.forEach(x=>(m[x.assessment_id]??=[]).push(x));return m},[data.items]);
  const evidenceSet=useMemo(()=>new Set(data.evidence.map(x=>x.assessment_item_id)),[data.evidence]);
  const actionByItem=useMemo(()=>Object.fromEntries(data.actions.map(x=>[x.assessment_item_id,x])),[data.actions]);
  const mapsByIndicator=useMemo(()=>{const m={};data.mappings.forEach(x=>(m[x.indicator_id]??=[]).push(x));return m},[data.mappings]);
  const idsByStandard=useMemo(()=>{
    const out={NDPE:new Set(data.indicators.map(x=>x.id))};
    CORE.filter(x=>x.code!=='NDPE').forEach(s=>out[s.code]=new Set(data.mappings.filter(m=>m.standard_code===s.code).map(m=>m.indicator_id)));
    return out;
  },[data.indicators,data.mappings]);

  const portfolio=useMemo(()=>{
    const totalPT=data.companies.length,covered=new Set(data.assessments.map(x=>x.company_id)).size;
    const total=data.items.length,verified=data.items.filter(x=>x.self_status==='Fulfilled'&&x.verifier_status==='Verified').length;
    const assessed=data.items.filter(x=>x.self_status&&x.self_status!=='Not Started').length;
    const gaps=data.items.filter(x=>x.self_status==='Not Fulfilled').length;
    const evidenceReady=data.items.filter(x=>x.self_status&&x.self_status!=='Not Started'&&evidenceSet.has(x.id)).length;
    const open=data.actions.filter(x=>activeAction(x.status)).length;
    const today=new Date().toISOString().slice(0,10);
    const overdue=data.actions.filter(x=>activeAction(x.status)&&x.deadline&&x.deadline<today).length;
    const critical=data.actions.filter(x=>activeAction(x.status)&&x.priority==='Critical').length;
    const closedVerified=data.actions.filter(x=>['Completed','Closed'].includes(x.status)&&x.verifier_status==='Verified').length;
    return {totalPT,covered,coverage:pct(covered,totalPT),total,verified,compliance:pct(verified,total),assessed,gaps,evidenceReady,evidencePct:pct(evidenceReady,assessed),open,overdue,critical,closedVerified};
  },[data,evidenceSet]);

  const standardCards=useMemo(()=>CORE.map(s=>{
    const ids=idsByStandard[s.code]||new Set();
    let total=0,verified=0,gaps=0;
    data.assessments.forEach(a=>{
      const arr=(itemsByAssessment[a.id]||[]).filter(i=>ids.has(i.indicator_id));
      total+=arr.length;verified+=arr.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;gaps+=arr.filter(i=>i.self_status==='Not Fulfilled').length;
    });
    return {...s,total,verified,gaps,score:pct(verified,total),mapped:s.code==='NDPE'?data.indicators.length:ids.size};
  }),[data.assessments,data.indicators,idsByStandard,itemsByAssessment]);

  const companyRows=useMemo(()=>data.companies.map(c=>{
    const a=assessmentByCompany[c.id],arr=a?(itemsByAssessment[a.id]||[]):[];
    const cells={};
    CORE.forEach(s=>{
      const ids=idsByStandard[s.code]||new Set();const selected=arr.filter(i=>ids.has(i.indicator_id));
      const verified=selected.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;
      const gaps=selected.filter(i=>i.self_status==='Not Fulfilled').length;
      cells[s.code]={score:selected.length?pct(verified,selected.length):null,gaps,total:selected.length};
    });
    const open=arr.filter(i=>{const ac=actionByItem[i.id];return i.self_status==='Not Fulfilled'&&(!ac||activeAction(ac.status))}).length;
    return {company:c,hasAssessment:!!a,cells,open,ndpe:cells.NDPE.score};
  }).sort((a,b)=>{
    if(a.hasAssessment!==b.hasAssessment)return a.hasAssessment?1:-1;
    if((b.open||0)!==(a.open||0))return(b.open||0)-(a.open||0);
    return(a.ndpe??-1)-(b.ndpe??-1);
  }).slice(0,12),[data.companies,assessmentByCompany,itemsByAssessment,idsByStandard,actionByItem]);

  const impact=useMemo(()=>{
    const mappedCodes=[...new Set(data.mappings.map(x=>x.standard_code))];
    const mappedUnique=new Set(data.mappings.map(x=>x.indicator_id)).size;
    const mappingLinks=data.mappings.length;
    const reuseInstances=Math.max(0,mappingLinks-mappedUnique);
    let evidenceReuse=0;
    data.items.forEach(i=>{if(evidenceSet.has(i.id))evidenceReuse+=(mapsByIndicator[i.indicator_id]||[]).length});
    return {mappedCodes,mappedUnique,mappingLinks,reuseInstances,evidenceReuse};
  },[data.mappings,data.items,evidenceSet,mapsByIndicator]);

  const warnings=useMemo(()=>{
    const arr=[],today=new Date().toISOString().slice(0,10);
    const missing=data.companies.filter(c=>!assessmentByCompany[c.id]);
    if(missing.length)arr.push({tone:'high',title:`${missing.length} PT belum memiliki assessment NDPE ${year}`,detail:'Portfolio coverage belum 100%.',href:'/sims/assessment'});
    const itemById=Object.fromEntries(data.items.map(x=>[x.id,x]));
    data.actions.forEach(a=>{
      if(!activeAction(a.status))return;
      const it=itemById[a.assessment_item_id],ass=it?data.assessments.find(x=>x.id===it.assessment_id):null,co=ass?companyMap[ass.company_id]:null;
      if(a.deadline&&a.deadline<today)arr.push({tone:a.priority==='Critical'?'critical':'high',title:`${co?.company_code||'PT'} · action overdue`,detail:`Deadline ${a.deadline} · ${a.priority||'Priority n/a'}`,href:'/sims/action-plan'});
      else if(a.priority==='Critical')arr.push({tone:'critical',title:`${co?.company_code||'PT'} · critical action masih open`,detail:`Status ${a.status||'Open'}`,href:'/sims/action-plan'});
    });
    const gapNoAction=data.items.filter(i=>i.self_status==='Not Fulfilled'&&!actionByItem[i.id]);
    if(gapNoAction.length)arr.push({tone:'high',title:`${gapNoAction.length} gap belum memiliki action plan`,detail:'Perlu corrective action dan PIC.',href:'/sims/action-plan'});
    const verifiedNoEvidence=data.items.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified'&&!evidenceSet.has(i.id));
    if(verifiedNoEvidence.length)arr.push({tone:'medium',title:`${verifiedNoEvidence.length} verified item belum memiliki evidence file`,detail:'Review evidence readiness sebelum audit.',href:'/sims/assessment'});
    return arr.slice(0,8);
  },[data,year,assessmentByCompany,companyMap,actionByItem,evidenceSet]);

  return <div className="page-wrap innovation-wrap">
    <style>{`
      .innovation-wrap{padding-bottom:8px}.ic-hero{background:linear-gradient(125deg,#0b3e2b,#0c5c3c 58%,#12806a);border-radius:22px;padding:24px;color:#fff;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;box-shadow:0 14px 34px rgba(12,76,51,.16);margin-bottom:16px}.ic-eyebrow{font-size:10px;font-weight:900;letter-spacing:.16em;color:#bde8cf}.ic-hero h1{font-size:30px;margin:7px 0 8px}.ic-hero p{margin:0;max-width:780px;color:#d6e9df;line-height:1.55;font-size:13px}.ic-tag{display:inline-flex;margin-top:15px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);border-radius:999px;padding:8px 11px;font-size:11px;font-weight:800}.ic-control{display:flex;gap:8px;align-items:end}.ic-control label span{display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px;color:#c7e0d2;font-weight:800}.ic-control input{height:40px;width:105px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:0 10px}.ic-control button{height:40px;border:0;border-radius:10px;padding:0 13px;background:#d7f36a;color:#163c2a;font-weight:900;cursor:pointer}
      .ic-flow{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}.ic-step{background:#fff;border:1px solid #dce8e0;border-radius:13px;padding:12px 13px;position:relative}.ic-step small{display:block;font-size:9px;color:#798a80;font-weight:900;letter-spacing:.06em}.ic-step strong{display:block;font-size:12px;color:#174632;margin-top:4px}.ic-step:not(:last-child):after{content:'→';position:absolute;right:-8px;top:50%;transform:translateY(-50%);z-index:2;color:#6f897a;font-weight:900}
      .ic-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin-bottom:16px}.ic-kpi{background:#fff;border:1px solid #dce8e0;border-radius:14px;padding:13px;box-shadow:0 3px 12px rgba(25,65,43,.035)}.ic-kpi.hero{background:#123f2d;color:#fff}.ic-kpi.warn{background:#fff9e9;border-color:#eadca8}.ic-kpi.danger{background:#fff0ee;border-color:#efc9c3}.ic-kpi small{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;opacity:.7}.ic-kpi strong{display:block;font-size:25px;margin-top:4px}.ic-kpi span{font-size:10px;color:#74867b}.ic-kpi.hero span{color:#c2dacd}
      .ic-standard-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}.ic-standard{background:#fff;border:1px solid #dce8e0;border-radius:15px;padding:15px}.ic-standard-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.ic-standard-head strong{font-size:14px;color:#153e2d}.ic-standard-head span{font-size:20px;font-weight:900;color:#0c6543}.ic-bar{height:8px;border-radius:999px;background:#edf2ee;overflow:hidden;margin:10px 0 8px}.ic-bar i{height:100%;display:block;border-radius:999px;background:#1b7650}.ic-standard small{font-size:10px;color:#76877d}
      .ic-grid{display:grid;grid-template-columns:1.45fr .75fr;gap:14px;margin-bottom:16px}.ic-panel{background:#fff;border:1px solid #dce8e0;border-radius:16px;padding:16px;box-shadow:0 4px 15px rgba(25,65,43,.035)}.ic-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.ic-panel h2{font-size:16px;margin:0;color:#173f2d}.ic-panel p{font-size:10px;color:#7b8b82;margin:4px 0 0}.ic-panel-head a{font-size:10px;font-weight:900;color:#12633f}.ic-tablewrap{overflow:auto}.ic-table{width:100%;border-collapse:collapse;min-width:690px}.ic-table th,.ic-table td{padding:9px 8px;border-bottom:1px solid #edf2ef;font-size:10px;text-align:left}.ic-table th{font-size:9px;color:#718077;text-transform:uppercase;letter-spacing:.05em;background:#f7faf8}.ic-pt strong{display:block;font-size:11px;color:#204632}.ic-pt span{font-size:9px;color:#809087}.ic-cell{display:inline-flex;min-width:50px;justify-content:center;padding:5px 7px;border-radius:8px;font-weight:900;background:#eef3f0;color:#61736a}.ic-cell.good{background:#e6f5eb;color:#17633f}.ic-cell.mid{background:#fff4d8;color:#80600b}.ic-cell.bad{background:#fdebe9;color:#9a382f}.ic-cell.none{background:#f0f2f1;color:#9aa49e}.ic-open{font-weight:900;color:#9b3c31}
      .ic-impact{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.ic-impact>div{background:#f6faf7;border:1px solid #e2ebe5;border-radius:11px;padding:11px}.ic-impact small{display:block;font-size:9px;color:#74857a;text-transform:uppercase;font-weight:900}.ic-impact strong{display:block;font-size:20px;color:#124b32;margin-top:3px}.ic-impact span{font-size:9px;color:#7b8b82}.ic-note{margin-top:10px;padding:9px 10px;border-radius:9px;background:#eff7f2;color:#4f6d5d;font-size:9px;line-height:1.45}
      .ic-warning-list{display:flex;flex-direction:column;gap:7px}.ic-warning{display:flex;gap:9px;align-items:flex-start;padding:10px;border:1px solid #e4ebe7;border-radius:10px;text-decoration:none}.ic-dot{width:8px;height:8px;border-radius:50%;margin-top:4px;background:#d4a72c;flex:0 0 8px}.ic-warning.high .ic-dot{background:#df7c2f}.ic-warning.critical .ic-dot{background:#c6473c}.ic-warning.medium .ic-dot{background:#d4a72c}.ic-warning strong{display:block;font-size:10px;color:#294a39}.ic-warning span{display:block;font-size:9px;color:#7b8a81;margin-top:2px}.ic-empty{padding:16px;text-align:center;color:#819087;font-size:10px}.ic-error{padding:11px 13px;border-radius:10px;background:#fff0ee;border:1px solid #efc7c2;color:#8c3028;margin-bottom:14px;font-size:11px}
      @media(max-width:1100px){.ic-kpis{grid-template-columns:repeat(3,1fr)}.ic-grid{grid-template-columns:1fr}.ic-flow{grid-template-columns:repeat(3,1fr)}.ic-step:after{display:none}}@media(max-width:760px){.ic-hero{grid-template-columns:1fr}.ic-standard-grid,.ic-kpis,.ic-flow{grid-template-columns:repeat(2,1fr)}.ic-impact{grid-template-columns:1fr}}@media(max-width:520px){.ic-standard-grid,.ic-kpis,.ic-flow{grid-template-columns:1fr}.ic-hero h1{font-size:24px}}
    `}</style>

    <section className="ic-hero">
      <div><div className="ic-eyebrow">INNOVATION COCKPIT · SUSTAINABILITY MANAGEMENT</div><h1>One Data. Multi Standard. One Action.</h1><p>Satu assessment NDPE menjadi single source untuk cross-standard compliance, corrective action, verification, dan management monitoring. Cockpit ini menampilkan impact aktual dari data SIMS—bukan angka estimasi.</p><div className="ic-tag">From Monitoring → Preventive Sustainability Management</div></div>
      <div className="ic-control"><label><span>Assessment Year</span><input type="number" min="2020" max="2100" value={year} onChange={e=>setYear(Number(e.target.value))}/></label><button onClick={load}>Refresh</button></div>
    </section>

    {error?<div className="ic-error">{error}</div>:null}

    <section className="ic-flow"><div className="ic-step"><small>01 · SINGLE SOURCE</small><strong>NDPE Assessment</strong></div><div className="ic-step"><small>02 · REUSE</small><strong>Cross-Standard Mapping</strong></div><div className="ic-step"><small>03 · CONTROL</small><strong>Gap → Action Plan</strong></div><div className="ic-step"><small>04 · ASSURANCE</small><strong>Evidence & Verification</strong></div><div className="ic-step"><small>05 · AUTO UPDATE</small><strong>Compliance Closure</strong></div></section>

    <section className="ic-kpis">
      <Kpi hero label="PT Coverage" value={loading?'…':`${portfolio.coverage}%`} sub={`${portfolio.covered}/${portfolio.totalPT} active PT assessed`}/>
      <Kpi label="Verified NDPE" value={loading?'…':`${portfolio.compliance}%`} sub={`${portfolio.verified}/${portfolio.total} verified fulfilled`}/>
      <Kpi label="Open NDPE Gap" value={loading?'…':portfolio.gaps} sub={`${portfolio.open} active corrective actions`} tone={portfolio.gaps?'warn':''}/>
      <Kpi label="Overdue Action" value={loading?'…':portfolio.overdue} sub={`${portfolio.critical} critical open`} tone={portfolio.overdue?'danger':''}/>
      <Kpi label="Evidence Readiness" value={loading?'…':`${portfolio.evidencePct}%`} sub={`${portfolio.evidenceReady}/${portfolio.assessed} assessed items`}/>
      <Kpi label="Closed Loop" value={loading?'…':portfolio.closedVerified} sub="Closed/Completed + verified"/>
    </section>

    <section className="ic-standard-grid">{standardCards.map(s=><div className="ic-standard" key={s.code}><div className="ic-standard-head"><strong>{s.label}</strong><span>{loading?'…':`${s.score}%`}</span></div><div className="ic-bar"><i style={{width:`${Math.min(100,s.score)}%`}}/></div><small>{s.verified}/{s.total} verified · {s.gaps} gaps · {s.mapped} mapped NDPE</small></div>)}</section>

    <section className="ic-grid">
      <div className="ic-panel"><div className="ic-panel-head"><div><h2>PT × Standard Compliance Heatmap</h2><p>Attention view: PT tanpa assessment, gap terbanyak, dan compliance terendah muncul lebih dulu.</p></div><Link href="/sims/compliance">Open Compliance →</Link></div><div className="ic-tablewrap"><table className="ic-table"><thead><tr><th>Company / PT</th>{CORE.map(s=><th key={s.code}>{s.code}</th>)}<th>Open Gap</th></tr></thead><tbody>{companyRows.map(r=><tr key={r.company.id}><td className="ic-pt"><strong>{r.company.company_code}</strong><span>{r.company.company_name}</span></td>{CORE.map(s=>{const v=r.cells[s.code]?.score;return <td key={s.code}><span className={`ic-cell ${v===null?'none':v>=85?'good':v>=60?'mid':'bad'}`}>{v===null?'—':`${v}%`}</span></td>})}<td className="ic-open">{r.open||0}</td></tr>)}</tbody></table></div>{!companyRows.length&&!loading?<div className="ic-empty">Belum ada company data.</div>:null}</div>

      <div className="ic-panel"><div className="ic-panel-head"><div><h2>Innovation Impact</h2><p>System-derived footprint yang dapat dibuktikan dari master dan transaksi SIMS.</p></div></div><div className="ic-impact"><Impact label="NDPE Master" value={data.indicators.length} sub="single source indicators"/><Impact label="Mapped Standards" value={impact.mappedCodes.length} sub={impact.mappedCodes.join(', ')||'no mapping yet'}/><Impact label="Crosswalk Links" value={impact.mappingLinks} sub="active mapping relationships"/><Impact label="Reusable Indicators" value={impact.mappedUnique} sub="unique NDPE linked to standards"/><Impact label="Cross-Standard Reuse" value={impact.reuseInstances} sub="mapping links beyond first reuse"/><Impact label="Evidence Reuse Potential" value={impact.evidenceReuse} sub="evidence × mapped-standard links"/></div><div className="ic-note">Impact di atas berasal dari data sistem. “Evidence reuse potential” menunjukkan berapa hubungan standard yang dapat didukung oleh item NDPE yang sudah mempunyai evidence; bukan klaim hasil audit atau penghematan jam kerja.</div></div>
    </section>

    <section className="ic-grid">
      <div className="ic-panel"><div className="ic-panel-head"><div><h2>Early Warning</h2><p>Prioritas yang perlu perhatian sebelum menjadi isu audit atau keterlambatan closure.</p></div><Link href="/sims/action-plan">Open Action Plan →</Link></div><div className="ic-warning-list">{warnings.length?warnings.map((w,i)=><Link href={w.href} key={`${w.title}-${i}`} className={`ic-warning ${w.tone}`}><span className="ic-dot"/><div><strong>{w.title}</strong><span>{w.detail}</span></div></Link>):<div className="ic-empty">Tidak ada warning pada scope tahun ini.</div>}</div></div>
      <div className="ic-panel"><div className="ic-panel-head"><div><h2>Competition Story</h2><p>Alur demo yang bisa dijelaskan dalam kurang dari satu menit.</p></div></div><div className="ic-warning-list"><Story n="1" title="Input once" text="PT mengisi satu assessment NDPE dan evidence."/><Story n="2" title="Reuse automatically" text="Crosswalk menerjemahkan data yang sama ke standard terkait."/><Story n="3" title="Gap becomes action" text="Not Fulfilled otomatis masuk corrective action workflow."/><Story n="4" title="Closure updates compliance" text="Completed/Closed + Verified mengubah NDPE menjadi Fulfilled + Verified dan compliance ikut naik."/></div></div>
    </section>
  </div>
}

function Kpi({label,value,sub,hero,tone=''}){return <div className={`ic-kpi ${hero?'hero':''} ${tone}`}><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>}
function Impact({label,value,sub}){return <div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>}
function Story({n,title,text}){return <div className="ic-warning"><span className="ic-dot"/><div><strong>{n}. {title}</strong><span>{text}</span></div></div>}
