'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { daysUntil } from '../lib/monitoring';
import { calculateExecutiveRisk, getRuntimeRiskWeights, normalizeRiskWeights } from '../lib/riskScore';
import { getSystemUserByEmail } from '../lib/systemUsers';

export default function PortfolioAnalyticsPanel(){
  const [data,setData]=useState({companies:[],certifications:[],grievances:[],actions:[],simsAssessments:[],simsItems:[],suppliers:[],riskAssessments:[]});
  const [weights,setWeights]=useState(()=>getRuntimeRiskWeights());
  const [snapshots,setSnapshots]=useState([]);
  const [historyAvailable,setHistoryAvailable]=useState(false);
  const [loading,setLoading]=useState(true);
  const [selectedCompanyId,setSelectedCompanyId]=useState('');
  const [isAdmin,setIsAdmin]=useState(false);
  const snapshotWriteRef=useRef(false);

  useEffect(()=>{loadAll()},[]);

  async function loadAll(){
    if(!supabase){setLoading(false);return;}
    setLoading(true);
    const [co,c,g,a,sa,si,sp,ra,setting,snap,userResult]=await Promise.all([
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('certifications').select('*'),
      supabase.from('grievances').select('*'),
      supabase.from('grievance_actions').select('*'),
      supabase.from('sims_assessments').select('*').order('assessment_year',{ascending:false}),
      supabase.from('sims_assessment_items').select('*'),
      supabase.from('spatial_suppliers').select('*'),
      supabase.from('supplier_risk_assessments').select('*').order('assessed_at',{ascending:false}),
      supabase.from('risk_weight_settings').select('certification,grievance_action,sims,spatial').eq('settings_key','executive').maybeSingle(),
      supabase.from('executive_risk_snapshots').select('*').order('snapshot_month',{ascending:true}),
      supabase.auth.getUser(),
    ]);

    const nextWeights=!setting.error&&setting.data?normalizeRiskWeights({
      certification:setting.data.certification,
      grievanceAction:setting.data.grievance_action,
      sims:setting.data.sims,
      spatial:setting.data.spatial,
    }):getRuntimeRiskWeights();

    setWeights(nextWeights);
    setData({
      companies:co.data||[],certifications:c.data||[],grievances:g.data||[],actions:a.data||[],
      simsAssessments:sa.data||[],simsItems:si.data||[],suppliers:sp.error?[]:(sp.data||[]),riskAssessments:ra.error?[]:(ra.data||[]),
    });
    setHistoryAvailable(!snap.error);
    setSnapshots(snap.error?[]:(snap.data||[]));
    const email=userResult?.data?.user?.email||'';
    setIsAdmin(getSystemUserByEmail(email)?.role==='admin');
    setLoading(false);
  }

  const latestRiskBySupplier=useMemo(()=>{
    const map={};
    for(const r of data.riskAssessments){if(!map[r.supplier_id])map[r.supplier_id]=r;}
    return map;
  },[data.riskAssessments]);

  const ranking=useMemo(()=>data.companies.filter(c=>c.status!=='Inactive').map(company=>buildCompanyRisk(company,data,latestRiskBySupplier,weights)).sort((a,b)=>b.risk.score-a.risk.score||String(a.company.company_code||'').localeCompare(String(b.company.company_code||''))),[data,latestRiskBySupplier,weights]);

  useEffect(()=>{
    if(!selectedCompanyId&&ranking[0]?.company?.id)setSelectedCompanyId(ranking[0].company.id);
  },[ranking,selectedCompanyId]);

  useEffect(()=>{
    if(!historyAvailable||!isAdmin||!ranking.length||snapshotWriteRef.current||!supabase)return;
    snapshotWriteRef.current=true;
    saveCurrentMonthSnapshots(ranking,weights).catch(()=>{});
  },[historyAvailable,isAdmin,ranking,weights]);

  async function saveCurrentMonthSnapshots(rows,activeWeights){
    const {data:{user}}=await supabase.auth.getUser();
    const month=currentMonthISO();
    const payload=rows.map(row=>{
      const byKey=Object.fromEntries(row.risk.components.map(c=>[c.key,c]));
      return {
        company_id:row.company.id,
        snapshot_month:month,
        score:row.risk.score,
        risk_level:row.risk.level,
        certification_score:byKey.certification?.available?byKey.certification.score:null,
        grievance_action_score:byKey.grievanceAction?.available?byKey.grievanceAction.score:null,
        sims_score:byKey.sims?.available?byKey.sims.score:null,
        spatial_score:byKey.spatial?.available?byKey.spatial.score:null,
        weight_certification:activeWeights.certification,
        weight_grievance_action:activeWeights.grievanceAction,
        weight_sims:activeWeights.sims,
        weight_spatial:activeWeights.spatial,
        coverage_available:row.risk.coverage.available,
        coverage_total:row.risk.coverage.total,
        top_driver:row.risk.drivers[0]?.label||null,
        metrics:row.risk.metrics,
        created_by:user?.id||null,
        updated_at:new Date().toISOString(),
      };
    });
    const {error}=await supabase.from('executive_risk_snapshots').upsert(payload,{onConflict:'company_id,snapshot_month'});
    if(error)throw error;
    const refreshed=await supabase.from('executive_risk_snapshots').select('*').order('snapshot_month',{ascending:true});
    if(!refreshed.error)setSnapshots(refreshed.data||[]);
  }

  const selected=ranking.find(r=>r.company.id===selectedCompanyId)||ranking[0]||null;
  const trend=useMemo(()=>snapshots.filter(s=>s.company_id===selectedCompanyId).sort((a,b)=>String(a.snapshot_month).localeCompare(String(b.snapshot_month))).slice(-12),[snapshots,selectedCompanyId]);
  const heatmapRows=ranking;

  return <div className="page-wrap analytics-root">
    <style>{styles}</style>
    <section className="analytics-head">
      <div><span>PORTFOLIO ANALYTICS</span><h2>Management Heatmap & Risk Trend</h2><p>Portfolio view untuk membandingkan risk driver antar PT dan melihat perubahan Executive Risk Score dari bulan ke bulan.</p></div>
      <div className="analytics-actions">{selected?<Link href={`/executive-report?company=${selected.company.id}`}>Executive Report PDF</Link>:null}<Link href="/company-360">PT 360° Profile</Link></div>
    </section>

    <section className="analytics-grid">
      <div className="analytics-card trend-card">
        <div className="analytics-title"><div><h3>Risk Score Trend</h3><p>Snapshot bulanan untuk PT terpilih.</p></div><select value={selected?.company?.id||''} onChange={e=>setSelectedCompanyId(e.target.value)}>{ranking.map(r=><option key={r.company.id} value={r.company.id}>{r.company.company_code} — {r.company.company_name}</option>)}</select></div>
        {!historyAvailable?<div className="analytics-note"><strong>Risk history belum aktif.</strong><span>Jalankan SUPABASE-RISK-HISTORY-V8-22.sql. Setelah aktif, sistem menyimpan 1 snapshot per PT per bulan.</span></div>:loading?<div className="analytics-empty">Loading trend…</div>:trend.length?<TrendChart rows={trend}/>:<div className="analytics-empty">Belum ada snapshot bulanan untuk PT ini. Snapshot pertama akan dibuat saat admin membuka dashboard setelah SQL V8.22 aktif.</div>}
        {historyAvailable?<div className="trend-foot"><span>History starts from feature activation; historical months before activation are not reconstructed.</span>{trend.length>1?<b>{trendDelta(trend)}</b>:null}</div>:null}
      </div>

      <div className="analytics-card overview-card">
        <div className="analytics-title"><div><h3>Selected PT Overview</h3><p>Current risk position and component contribution.</p></div>{selected?<span className={`level-pill ${selected.risk.level.toLowerCase()}`}>{selected.risk.level}</span>:null}</div>
        {selected?<><div className="selected-score"><strong>{selected.risk.score}</strong><span>/100</span><div><b>{selected.company.company_code}</b><small>{selected.company.company_name}</small></div></div><div className="component-list">{selected.risk.components.map(c=><div key={c.key}><span>{c.label}</span><b>{c.available?`${Math.round(c.score)}/100`:'N/A'}</b><i><em className={cellTone(c.score,c.available)} style={{width:`${c.available?Math.max(2,c.score):0}%`}}/></i></div>)}</div></>:<div className="analytics-empty">No company data.</div>}
      </div>
    </section>

    <section className="analytics-card heatmap-card">
      <div className="analytics-title"><div><h3>Management Heatmap · All PT</h3><p>Score lebih tinggi berarti risiko lebih tinggi. N/A berarti komponen belum memiliki data yang dapat dihitung.</p></div><div className="heat-legend"><span className="low">Low</span><span className="moderate">Moderate</span><span className="high">High</span><span className="critical">Critical</span></div></div>
      <div className="heat-wrap"><div className="heat-table"><div className="heat-row head"><span>Rank</span><span>PT</span><span>Overall</span><span>Certification</span><span>Grievance & Actions</span><span>SIMS</span><span>Spatial</span><span>Coverage</span></div>{heatmapRows.map((row,index)=>{const c=Object.fromEntries(row.risk.components.map(x=>[x.key,x]));return <Link href={`/company-360?company=${row.company.id}`} className="heat-row" key={row.company.id}><span>#{index+1}</span><span><b>{row.company.company_code}</b><small>{row.company.company_name}</small></span><HeatCell score={row.risk.score} available/><HeatCell score={c.certification?.score} available={c.certification?.available}/><HeatCell score={c.grievanceAction?.score} available={c.grievanceAction?.available}/><HeatCell score={c.sims?.score} available={c.sims?.available}/><HeatCell score={c.spatial?.score} available={c.spatial?.available}/><span className="coverage-cell">{row.risk.coverage.available}/{row.risk.coverage.total}</span></Link>})}</div></div>
    </section>
  </div>
}

function HeatCell({score,available}){return <span className={`heat-cell ${cellTone(score,available)}`}>{available?Math.round(Number(score||0)):'N/A'}</span>}
function cellTone(score,available=true){if(!available)return'na';const n=Number(score||0);if(n>=75)return'critical';if(n>=50)return'high';if(n>=25)return'moderate';return'low'}
function currentMonthISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`}
function trendDelta(rows){const last=Number(rows[rows.length-1]?.score||0),prev=Number(rows[rows.length-2]?.score||0),d=last-prev;if(d===0)return'No change vs previous month';return `${d>0?'▲':'▼'} ${Math.abs(d)} point${Math.abs(d)===1?'':'s'} vs previous month`}

function TrendChart({rows}){
  const width=760,height=220,left=45,right=18,top=18,bottom=42,chartW=width-left-right,chartH=height-top-bottom;
  const x=i=>rows.length===1?left+chartW/2:left+(i/(rows.length-1))*chartW;
  const y=score=>top+chartH-(Math.max(0,Math.min(100,Number(score||0)))/100)*chartH;
  const points=rows.map((r,i)=>`${x(i)},${y(r.score)}`).join(' ');
  return <div className="trend-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Executive risk score monthly trend">{[0,25,50,75,100].map(v=><g key={v}><line x1={left} y1={y(v)} x2={width-right} y2={y(v)} className="gridline"/><text x={left-10} y={y(v)+4} textAnchor="end" className="axistext">{v}</text></g>)}{rows.length>1?<polyline points={points} fill="none" className="trendline"/>:null}{rows.map((r,i)=><g key={`${r.company_id}-${r.snapshot_month}`}><circle cx={x(i)} cy={y(r.score)} r="5" className={`dot ${cellTone(r.score,true)}`}/><text x={x(i)} y={y(r.score)-10} textAnchor="middle" className="scoretext">{r.score}</text><text x={x(i)} y={height-15} textAnchor="middle" className="axistext">{monthLabel(r.snapshot_month)}</text></g>)}</svg></div>
}
function monthLabel(value){const d=new Date(`${value}T00:00:00`);return Number.isNaN(d.getTime())?String(value||''):d.toLocaleDateString('en-US',{month:'short',year:'2-digit'})}

function buildCompanyRisk(company,data,latestRiskBySupplier,weights){
  const match=record=>{
    if(record?.company_id===company.id)return true;
    const hay=`${record?.company||''} ${record?.company_code||''} ${record?.entity||''}`.toLowerCase();
    const code=String(company.company_code||'').toLowerCase();
    const name=String(company.company_name||'').toLowerCase();
    return (!!code&&hay.includes(code))||!!name&&hay.includes(name);
  };
  const certifications=data.certifications.filter(match);
  const grievances=data.grievances.filter(match);
  const grievanceIds=new Set(grievances.map(g=>g.id));
  const actions=data.actions.filter(a=>grievanceIds.has(a.grievance_id));
  const suppliers=data.suppliers.filter(s=>s.company_id===company.id);
  const assessments=data.simsAssessments.filter(a=>a.company_id===company.id).sort((a,b)=>Number(b.assessment_year||0)-Number(a.assessment_year||0));
  const seen=new Set();const latest=assessments.filter(a=>{if(seen.has(a.standard_id))return false;seen.add(a.standard_id);return true});
  const ids=new Set(latest.map(a=>a.id));
  const simsItems=data.simsItems.filter(i=>ids.has(i.assessment_id));
  const risk=calculateExecutiveRisk({certifications,grievances,actions,simsItems,suppliers,latestRiskBySupplier,weights});
  return{company,risk};
}

const styles=`
.analytics-root{margin-top:18px}.analytics-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;background:linear-gradient(135deg,#f3f8f5,#ffffff);border:1px solid #dce7e0;border-radius:18px;padding:18px 20px;margin-bottom:14px}.analytics-head>div:first-child>span{font-size:9px;letter-spacing:.12em;font-weight:900;color:#43805f}.analytics-head h2{margin:5px 0 5px;color:#173f2d;font-size:21px}.analytics-head p{margin:0;color:#75847c;font-size:11px}.analytics-actions{display:flex;gap:8px;flex-wrap:wrap}.analytics-actions a{padding:9px 11px;border-radius:9px;background:#1e6544;color:#fff;text-decoration:none;font-size:10px;font-weight:900}.analytics-actions a:last-child{background:#edf5f0;color:#285f42;border:1px solid #d7e6dd}.analytics-grid{display:grid;grid-template-columns:1.35fr .65fr;gap:14px;margin-bottom:14px}.analytics-card{background:#fff;border:1px solid #dce7e0;border-radius:16px;padding:17px;box-shadow:0 4px 15px rgba(18,62,43,.04)}.analytics-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.analytics-title h3{margin:0 0 4px;color:#193f2e;font-size:16px}.analytics-title p{margin:0;color:#78877f;font-size:10px}.analytics-title select{min-width:260px;height:36px;border:1px solid #d8e3dc;border-radius:8px;padding:0 9px;color:#214734;background:#fff;font-size:10px;font-weight:800}.analytics-note{border:1px solid #e8d49c;background:#fff9e9;border-radius:10px;padding:12px}.analytics-note strong,.analytics-note span{display:block}.analytics-note strong{font-size:11px;color:#785d18}.analytics-note span{font-size:10px;color:#88743e;margin-top:4px}.analytics-empty{padding:32px;text-align:center;border:1px dashed #d5dfd9;border-radius:10px;color:#7d8b83;font-size:10px}.trend-chart{overflow-x:auto}.trend-chart svg{width:100%;min-width:620px;height:auto}.gridline{stroke:#e8eeea;stroke-width:1}.axistext{font-size:10px;fill:#849189}.scoretext{font-size:10px;font-weight:800;fill:#315740}.trendline{stroke:#2b7651;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.dot{stroke:#fff;stroke-width:2}.dot.low{fill:#54a873}.dot.moderate{fill:#d2aa3e}.dot.high{fill:#df8b3f}.dot.critical{fill:#c94f43}.trend-foot{display:flex;justify-content:space-between;gap:12px;margin-top:7px;color:#7c8982;font-size:9px}.trend-foot b{color:#315f45}.level-pill{font-size:9px;font-weight:900;padding:5px 8px;border-radius:999px;background:#edf6f0;color:#266743}.level-pill.moderate{background:#fff8df;color:#8b6a1e}.level-pill.high{background:#fff2e5;color:#9a5b1f}.level-pill.critical{background:#fff0ed;color:#a34339}.selected-score{display:grid;grid-template-columns:auto auto 1fr;gap:4px 8px;align-items:end;border-bottom:1px solid #edf1ee;padding-bottom:13px}.selected-score>strong{font-size:38px;color:#173f2d;line-height:1}.selected-score>span{font-size:10px;color:#77867e;padding-bottom:4px}.selected-score>div{padding-left:9px}.selected-score b,.selected-score small{display:block}.selected-score b{font-size:12px;color:#294c39}.selected-score small{font-size:9px;color:#7e8c84;margin-top:2px}.component-list{display:grid;gap:10px;margin-top:13px}.component-list>div{display:grid;grid-template-columns:1fr auto;gap:5px}.component-list span{font-size:10px;color:#62736a}.component-list b{font-size:10px;color:#244b36}.component-list i{grid-column:1/-1;height:8px;background:#eef2ef;border-radius:999px;overflow:hidden}.component-list em{display:block;height:100%;border-radius:999px}.component-list em.low{background:#54a873}.component-list em.moderate{background:#d2aa3e}.component-list em.high{background:#df8b3f}.component-list em.critical{background:#c94f43}.heatmap-card{margin-bottom:18px}.heat-legend{display:flex;gap:5px}.heat-legend span{font-size:8.5px;font-weight:900;padding:5px 7px;border-radius:999px}.heat-legend .low{background:#e9f6ed;color:#287043}.heat-legend .moderate{background:#fff8df;color:#8c6b1d}.heat-legend .high{background:#fff1e3;color:#9c5b20}.heat-legend .critical{background:#fff0ed;color:#a64439}.heat-wrap{overflow-x:auto}.heat-table{min-width:930px}.heat-row{display:grid;grid-template-columns:48px minmax(180px,1.4fr) repeat(5,minmax(105px,.75fr)) 72px;gap:7px;align-items:center;padding:7px 0;border-top:1px solid #edf1ee;text-decoration:none;color:inherit}.heat-row.head{border-top:0;background:#f7faf8;border-radius:8px;padding:9px 7px;font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:900;color:#708078}.heat-row:not(.head):hover{background:#fafcfb}.heat-row>span{font-size:9.5px}.heat-row>span:nth-child(2) b,.heat-row>span:nth-child(2) small{display:block}.heat-row>span:nth-child(2) b{font-size:10.5px;color:#274735}.heat-row>span:nth-child(2) small{font-size:8.5px;color:#7d8b84;margin-top:2px}.heat-cell{text-align:center;padding:8px 5px;border-radius:8px;font-weight:900}.heat-cell.low{background:#e9f6ed;color:#287043}.heat-cell.moderate{background:#fff8df;color:#8c6b1d}.heat-cell.high{background:#fff1e3;color:#9c5b20}.heat-cell.critical{background:#fff0ed;color:#a64439}.heat-cell.na{background:#f0f3f1;color:#9aa49e}.coverage-cell{text-align:center;font-weight:800;color:#52695c}@media(max-width:1050px){.analytics-grid{grid-template-columns:1fr}}@media(max-width:700px){.analytics-head{flex-direction:column}.analytics-title{flex-direction:column}.analytics-title select{width:100%;min-width:0}.trend-foot{flex-direction:column}}
`;
