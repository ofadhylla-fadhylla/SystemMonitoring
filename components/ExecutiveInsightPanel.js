'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { daysUntil } from '../lib/monitoring';
import {
  calculateExecutiveRisk,
  DEFAULT_RISK_WEIGHTS,
  getRuntimeRiskWeights,
  normalizeRiskWeights,
  setRuntimeRiskWeights,
} from '../lib/riskScore';
import { getSystemUserByEmail } from '../lib/systemUsers';

const weightLabels = [
  ['certification','Certification'],
  ['grievanceAction','Grievance & Actions'],
  ['sims','SIMS Compliance'],
  ['spatial','Supplier Spatial Risk'],
];

export default function ExecutiveInsightPanel(){
  const [data,setData]=useState({companies:[],certifications:[],audits:[],grievances:[],actions:[],simsAssessments:[],simsItems:[],suppliers:[],riskAssessments:[]});
  const [loading,setLoading]=useState(true);
  const [selectedCompanyId,setSelectedCompanyId]=useState('');
  const [weights,setWeights]=useState(()=>getRuntimeRiskWeights());
  const [draftWeights,setDraftWeights]=useState(()=>getRuntimeRiskWeights());
  const [settingsAvailable,setSettingsAvailable]=useState(false);
  const [isAdmin,setIsAdmin]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');

  useEffect(()=>{loadAll()},[]);

  async function loadAll(){
    if(!supabase){setLoading(false);return;}
    setLoading(true);
    try{
      const [co,c,a,g,ac,sa,si,sp,ra,setting,userResult]=await Promise.all([
        supabase.from('companies').select('*').order('company_code'),
        supabase.from('certifications').select('*').order('valid_until'),
        supabase.from('audit_events').select('*').order('start_date'),
        supabase.from('grievances').select('*').order('opened_date',{ascending:false}),
        supabase.from('grievance_actions').select('*').order('target_date'),
        supabase.from('sims_assessments').select('*').order('assessment_year',{ascending:false}),
        supabase.from('sims_assessment_items').select('*'),
        supabase.from('spatial_suppliers').select('*').order('supplier_name'),
        supabase.from('supplier_risk_assessments').select('*').order('assessed_at',{ascending:false}),
        supabase.from('risk_weight_settings').select('certification,grievance_action,sims,spatial').eq('settings_key','executive').maybeSingle(),
        supabase.auth.getUser(),
      ]);

      setData({
        companies:co.data||[],
        certifications:c.data||[],
        audits:a.data||[],
        grievances:g.data||[],
        actions:ac.data||[],
        simsAssessments:sa.data||[],
        simsItems:si.data||[],
        suppliers:sp.error?[]:(sp.data||[]),
        riskAssessments:ra.error?[]:(ra.data||[]),
      });

      if(!setting.error&&setting.data){
        const next=normalizeRiskWeights({
          certification:setting.data.certification,
          grievanceAction:setting.data.grievance_action,
          sims:setting.data.sims,
          spatial:setting.data.spatial,
        });
        setRuntimeRiskWeights(next);
        setWeights(next);
        setDraftWeights(next);
        setSettingsAvailable(true);
      }else{
        const current=getRuntimeRiskWeights();
        setWeights(current);
        setDraftWeights(current);
        setSettingsAvailable(false);
      }

      const email=userResult?.data?.user?.email||'';
      setIsAdmin(getSystemUserByEmail(email)?.role==='admin');
    }catch{
      // This panel is intentionally non-blocking; default weights still allow ranking.
    }finally{
      setLoading(false);
    }
  }

  const latestRiskBySupplier=useMemo(()=>{
    const map={};
    for(const r of data.riskAssessments){if(!map[r.supplier_id])map[r.supplier_id]=r;}
    return map;
  },[data.riskAssessments]);

  const ranking=useMemo(()=>{
    const activeCompanies=data.companies.filter(c=>c.status!=='Inactive');
    return activeCompanies.map(company=>buildCompanyRisk(company,data,latestRiskBySupplier,weights)).sort((a,b)=>b.risk.score-a.risk.score||String(a.company.company_code||'').localeCompare(String(b.company.company_code||'')));
  },[data,latestRiskBySupplier,weights]);

  useEffect(()=>{
    if(!selectedCompanyId&&ranking[0]?.company?.id)setSelectedCompanyId(ranking[0].company.id);
  },[ranking,selectedCompanyId]);

  const selected=useMemo(()=>ranking.find(r=>r.company.id===selectedCompanyId)||ranking[0]||null,[ranking,selectedCompanyId]);
  const insight=useMemo(()=>selected?generateManagementInsight(selected,ranking):null,[selected,ranking]);
  const portfolio=useMemo(()=>{
    const critical=ranking.filter(r=>r.risk.level==='Critical').length;
    const high=ranking.filter(r=>r.risk.level==='High').length;
    const moderate=ranking.filter(r=>r.risk.level==='Moderate').length;
    const low=ranking.filter(r=>r.risk.level==='Low').length;
    return{critical,high,moderate,low};
  },[ranking]);

  const weightTotal=Object.values(draftWeights).reduce((s,v)=>s+Number(v||0),0);

  function updateWeight(key,value){
    setDraftWeights(current=>({...current,[key]:Math.max(0,Math.min(100,Number(value||0)))}));
    setMessage('');
  }

  async function saveWeights(){
    if(!supabase||!isAdmin)return;
    if(weightTotal!==100){setMessage('Total bobot harus tepat 100%.');return;}
    setSaving(true);setMessage('');
    try{
      const normalized=normalizeRiskWeights(draftWeights);
      const {data:{user}}=await supabase.auth.getUser();
      const {error}=await supabase.from('risk_weight_settings').upsert({
        settings_key:'executive',
        certification:normalized.certification,
        grievance_action:normalized.grievanceAction,
        sims:normalized.sims,
        spatial:normalized.spatial,
        updated_by:user?.id||null,
        updated_at:new Date().toISOString(),
      },{onConflict:'settings_key'});
      if(error)throw error;
      setRuntimeRiskWeights(normalized);
      setWeights(normalized);
      setSettingsAvailable(true);
      setMessage('Bobot tersimpan. Dashboard akan direfresh agar seluruh risk score memakai bobot baru.');
      setTimeout(()=>window.location.reload(),650);
    }catch(error){
      setMessage(error?.message||'Gagal menyimpan bobot. Pastikan SQL V8.21 sudah dijalankan.');
    }finally{setSaving(false)}
  }

  function resetDraft(){setDraftWeights({...DEFAULT_RISK_WEIGHTS});setMessage('Default: Certification 25%, Grievance & Actions 25%, SIMS 30%, Spatial 20%.')}

  return <div className="page-wrap insight-root">
    <style>{styles}</style>

    <section className="insight-head">
      <div><span>PORTFOLIO DECISION SUPPORT</span><h2>AI Management Insight & PT Risk Ranking</h2><p>Insight dibuat dari data live SMD dan aturan analitik yang transparan. Tidak ada panggilan model AI eksternal, sehingga rekomendasi dapat ditelusuri ke data sumber.</p></div>
      <div className="portfolio-chips"><b className="critical">{portfolio.critical} Critical</b><b className="high">{portfolio.high} High</b><b className="moderate">{portfolio.moderate} Moderate</b><b className="low">{portfolio.low} Low</b></div>
    </section>

    <section className="insight-grid">
      <div className="insight-card">
        <div className="card-title"><div><h3>Management Insight</h3><p>Pilih PT untuk mendapatkan ringkasan prioritas dan tindakan yang disarankan.</p></div><select value={selected?.company?.id||''} onChange={e=>setSelectedCompanyId(e.target.value)}>{ranking.map(r=><option key={r.company.id} value={r.company.id}>{r.company.company_code} — {r.company.company_name}</option>)}</select></div>
        {loading?<div className="insight-empty">Loading portfolio insight…</div>:selected&&insight?<>
          <div className={`insight-score ${selected.risk.level.toLowerCase()}`}><div><strong>{selected.risk.score}</strong><span>/100</span></div><section><h4>{selected.company.company_code} · {selected.risk.level} Risk</h4><p>{insight.summary}</p><small>Data coverage {selected.risk.coverage.available}/{selected.risk.coverage.total} risk components.</small></section></div>
          <div className="insight-driver"><strong>Key Risk Drivers</strong>{selected.risk.drivers.length?selected.risk.drivers.slice(0,3).map(d=><span key={d.key}><b>{d.label}</b><em>{d.score}/100</em><small>{d.detail}</small></span>):<p>Tidak ada driver risiko aktif pada data yang tersedia.</p>}</div>
          <div className="insight-actions"><strong>Recommended Management Actions</strong>{insight.actions.map((a,i)=><div key={i}><b>{i+1}</b><span>{a}</span></div>)}</div>
          <div className="insight-links"><Link href={`/company-360?company=${selected.company.id}`}>Open PT 360°</Link><Link href="/certificates">Certification</Link><Link href="/sims/compliance">SIMS Compliance</Link><Link href="/spatial-monitoring">Spatial Risk</Link></div>
        </>:<div className="insight-empty">Belum ada data PT untuk dianalisis.</div>}
      </div>

      <div className="insight-card ranking-card">
        <div className="card-title"><div><h3>Risk Ranking · All PT</h3><p>Urutan dari risk score tertinggi ke terendah menggunakan bobot yang sedang aktif.</p></div><span className="weight-summary">{weights.certification}/{weights.grievanceAction}/{weights.sims}/{weights.spatial}</span></div>
        <div className="ranking-head"><span>#</span><span>PT</span><span>Score</span><span>Level</span><span>Top Driver</span></div>
        <div className="ranking-list">{ranking.length?ranking.map((row,index)=><button key={row.company.id} className={selected?.company?.id===row.company.id?'active':''} onClick={()=>setSelectedCompanyId(row.company.id)}><b>{index+1}</b><span><strong>{row.company.company_code}</strong><small>{row.company.company_name}</small></span><em>{row.risk.score}</em><i className={row.risk.level.toLowerCase()}>{row.risk.level}</i><small>{row.risk.drivers[0]?.label||'No active driver'}</small></button>):<div className="insight-empty">No company data.</div>}</div>
      </div>
    </section>

    <section className="weight-card">
      <div className="weight-title"><div><h3>Executive Risk Weighting</h3><p>Bobot dipakai bersama oleh Dashboard, PT 360°, ranking dan Management Insight. Komponen tanpa data tetap di-re-normalize otomatis.</p></div>{isAdmin?<button onClick={()=>setShowSettings(v=>!v)}>{showSettings?'Close Settings':'Configure Weights'}</button>:<span>Admin only</span>}</div>
      <div className="weight-bars">{weightLabels.map(([key,label])=><div key={key}><span>{label}</span><b>{weights[key]}%</b><i><em style={{width:`${weights[key]}%`}}/></i></div>)}</div>
      {!settingsAvailable?<div className="settings-note">Shared database settings belum aktif. Risk score tetap memakai default 25 / 25 / 30 / 20. Jalankan <b>SUPABASE-RISK-SETTINGS-V8-21.sql</b> agar bobot dapat disimpan untuk semua user.</div>:null}
      {showSettings&&isAdmin?<div className="weight-editor"><div className="weight-inputs">{weightLabels.map(([key,label])=><label key={key}><span>{label}</span><input type="number" min="0" max="100" value={draftWeights[key]} onChange={e=>updateWeight(key,e.target.value)}/><small>%</small></label>)}</div><div className={`weight-total ${weightTotal===100?'ok':'bad'}`}>Total {weightTotal}% {weightTotal===100?'✓':'— harus 100%'}</div><div className="weight-actions"><button onClick={resetDraft}>Reset Default</button><button className="save" disabled={saving||weightTotal!==100} onClick={saveWeights}>{saving?'Saving…':'Save Shared Weights'}</button></div>{message?<p className="weight-message">{message}</p>:null}</div>:null}
    </section>
  </div>
}

function buildCompanyRisk(company,data,latestRiskBySupplier,weights){
  const match=record=>{
    if(record?.company_id===company.id)return true;
    const hay=`${record?.company||''} ${record?.company_code||''} ${record?.entity||''}`.toLowerCase();
    const code=String(company.company_code||'').toLowerCase();
    const name=String(company.company_name||'').toLowerCase();
    return (!!code&&hay.includes(code))||!!name&&hay.includes(name);
  };

  const certifications=data.certifications.filter(match);
  const audits=data.audits.filter(match);
  const grievances=data.grievances.filter(match);
  const grievanceIds=new Set(grievances.map(g=>g.id));
  const actions=data.actions.filter(a=>grievanceIds.has(a.grievance_id));
  const suppliers=data.suppliers.filter(s=>s.company_id===company.id);

  const assessments=data.simsAssessments.filter(a=>a.company_id===company.id).sort((a,b)=>Number(b.assessment_year||0)-Number(a.assessment_year||0));
  const seenStandards=new Set();
  const latestAssessments=assessments.filter(a=>{if(seenStandards.has(a.standard_id))return false;seenStandards.add(a.standard_id);return true;});
  const assessmentIds=new Set(latestAssessments.map(a=>a.id));
  const simsItems=data.simsItems.filter(i=>assessmentIds.has(i.assessment_id));

  const risk=calculateExecutiveRisk({certifications,grievances,actions,simsItems,suppliers,latestRiskBySupplier,weights});
  const upcomingAudits=audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&d<=30&&!['Done','Cancelled'].includes(a.status)}).length;
  return{company,certifications,audits,grievances,actions,suppliers,simsItems,risk,upcomingAudits};
}

function generateManagementInsight(row,ranking){
  const {risk,company,upcomingAudits}=row;
  const top=risk.drivers[0];
  const position=ranking.findIndex(r=>r.company.id===company.id)+1;
  const summary=`${company.company_code} berada pada peringkat risiko #${position} dari ${ranking.length} PT dengan skor ${risk.score}/100 (${risk.level}). ${top?`Driver terbesar saat ini adalah ${top.label} (${top.score}/100).`:'Tidak ada driver risiko material dari komponen yang tersedia.'}`;
  const actions=[];
  const m=risk.metrics;
  if(m.expired>0)actions.push(`Prioritaskan pembaruan ${m.expired} sertifikat yang sudah expired dan tetapkan PIC serta target penyelesaian.`);
  else if(m.expiring90>0)actions.push(`Siapkan renewal plan untuk ${m.expiring90} sertifikat yang akan berakhir dalam 90 hari.`);
  if(m.overdueActions>0)actions.push(`Eskalasi ${m.overdueActions} corrective action yang overdue dan minta recovery date yang disepakati.`);
  if(m.openGrievances>0)actions.push(`Review ${m.openGrievances} grievance terbuka dan pastikan evidence closure serta komunikasi stakeholder terdokumentasi.`);
  if(m.simsCompliance!==null&&m.simsCompliance<80)actions.push(`Naikkan SIMS verified compliance dari ${m.simsCompliance}% dengan fokus pada gap indikator dan verifikasi evidence.`);
  if(m.spatialScore!==null&&m.spatialScore>=50)actions.push(`Lakukan enhanced due diligence untuk supplier dengan spatial risk tertinggi ${m.spatialScore}/100 sebelum keputusan sourcing berikutnya.`);
  if(upcomingAudits>0)actions.push(`Pastikan kesiapan evidence dan owner action untuk ${upcomingAudits} audit yang berlangsung dalam 30 hari.`);
  if(risk.coverage.available<risk.coverage.total)actions.push(`Lengkapi data pada ${risk.coverage.total-risk.coverage.available} komponen risiko yang belum tersedia agar penilaian PT lebih representatif.`);
  if(!actions.length)actions.push('Pertahankan monitoring rutin dan validasi data secara berkala; tidak ada eskalasi utama dari data yang tersedia saat ini.');
  return{summary,actions:actions.slice(0,4)};
}

const styles=`
.insight-root{padding-top:0!important}.insight-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;background:linear-gradient(135deg,#eef8f2,#f9fcfa);border:1px solid #d9e8df;border-radius:18px;padding:18px 20px;margin:2px 0 16px}.insight-head>div:first-child>span{font-size:9px;font-weight:900;letter-spacing:.12em;color:#5c7d69}.insight-head h2{margin:4px 0 5px;font-size:21px;color:#173f2c}.insight-head p{margin:0;max-width:780px;color:#73837a;font-size:10.5px;line-height:1.5}.portfolio-chips{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.portfolio-chips b{font-size:9px;padding:6px 8px;border-radius:999px;background:#edf4ef;color:#42624f}.portfolio-chips .critical{background:#fff0ee;color:#a33e36}.portfolio-chips .high{background:#fff5e9;color:#a05a22}.portfolio-chips .moderate{background:#fff9e5;color:#8b6b17}.portfolio-chips .low{background:#edf8f1;color:#267047}.insight-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.insight-card,.weight-card{background:#fff;border:1px solid #dce7e0;border-radius:16px;padding:17px;box-shadow:0 4px 15px rgba(18,62,43,.04)}.card-title,.weight-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.card-title h3,.weight-title h3{margin:0 0 4px;font-size:16px;color:#183e2d}.card-title p,.weight-title p{margin:0;color:#7a8981;font-size:9.8px;line-height:1.4}.card-title select{max-width:260px;height:36px;border:1px solid #d7e3dc;border-radius:9px;padding:0 9px;color:#244734;background:#fff;font-size:10px;font-weight:800}.insight-score{display:grid;grid-template-columns:84px 1fr;gap:14px;align-items:center;background:#f7fbf8;border:1px solid #e0eae4;border-radius:13px;padding:13px}.insight-score>div{width:70px;height:70px;border-radius:50%;display:grid;place-items:center;align-content:center;border:6px solid #5aa878;background:#edf7f0}.insight-score>div strong{font-size:24px;line-height:1;color:#163f2b}.insight-score>div span{font-size:9px;color:#73837a}.insight-score.high>div{border-color:#df8b3f;background:#fff5e9}.insight-score.critical>div{border-color:#c94f43;background:#fff0ee}.insight-score.moderate>div{border-color:#d2aa3d;background:#fff9e6}.insight-score h4{margin:0 0 5px;color:#1d4532;font-size:13px}.insight-score p{margin:0;color:#697a70;font-size:10px;line-height:1.45}.insight-score small{display:block;margin-top:6px;color:#809087;font-size:9px}.insight-driver,.insight-actions{margin-top:13px}.insight-driver>strong,.insight-actions>strong{display:block;color:#284a38;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}.insight-driver>span{display:grid;grid-template-columns:1fr auto;gap:3px 10px;padding:8px 0;border-top:1px solid #edf1ee}.insight-driver b{font-size:10px;color:#274735}.insight-driver em{font-size:10px;font-style:normal;font-weight:900;color:#315e46}.insight-driver small{grid-column:1/-1;color:#7b8981;font-size:9px}.insight-driver p{font-size:10px;color:#7a8981}.insight-actions{display:grid;gap:7px}.insight-actions>div{display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:start}.insight-actions>div b{width:20px;height:20px;border-radius:7px;background:#eaf5ee;color:#286b48;display:grid;place-items:center;font-size:9px}.insight-actions>div span{font-size:9.5px;line-height:1.45;color:#5f7167}.insight-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:13px}.insight-links a{font-size:9px;font-weight:800;text-decoration:none;color:#285f42;background:#f0f7f3;border:1px solid #dce8e0;padding:6px 8px;border-radius:8px}.ranking-card{min-height:470px}.weight-summary{font-size:9px!important;font-weight:900;background:#eff6f2;color:#326249;padding:6px 8px;border-radius:999px}.ranking-head,.ranking-list button{display:grid;grid-template-columns:28px 64px 48px 72px 1fr;gap:8px;align-items:center}.ranking-head{padding:0 8px 7px;color:#87958d;font-size:8.5px;text-transform:uppercase;font-weight:900}.ranking-list{max-height:390px;overflow:auto;border-top:1px solid #edf1ee}.ranking-list button{width:100%;border:0;border-bottom:1px solid #edf1ee;background:#fff;padding:9px 8px;text-align:left;cursor:pointer}.ranking-list button:hover,.ranking-list button.active{background:#f5faf7}.ranking-list button>b{font-size:10px;color:#708077}.ranking-list button>span strong{display:block;font-size:10px;color:#244634}.ranking-list button>span small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;color:#8a978f;font-size:8.5px}.ranking-list button>em{font-size:16px;font-style:normal;font-weight:900;color:#1c4933}.ranking-list button>i{font-size:8px;font-style:normal;font-weight:900;padding:4px 5px;border-radius:999px;background:#edf7f1;color:#267048;text-align:center}.ranking-list button>i.high{background:#fff4e7;color:#a05b22}.ranking-list button>i.critical{background:#fff0ee;color:#a33e36}.ranking-list button>i.moderate{background:#fff9e5;color:#8b6b17}.ranking-list button>small{color:#73837a;font-size:8.8px}.weight-card{margin-bottom:18px}.weight-title button{border:1px solid #d2e0d8;background:#eff7f2;color:#286244;border-radius:9px;padding:7px 10px;font-size:9px;font-weight:900;cursor:pointer}.weight-title>span{font-size:9px;color:#7b8981}.weight-bars{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.weight-bars>div{border:1px solid #e2ebe5;border-radius:11px;padding:10px;background:#fafcfb}.weight-bars span,.weight-bars b{display:block;font-size:9px;color:#687970}.weight-bars b{font-size:14px;color:#244634;margin:4px 0}.weight-bars i{display:block;height:7px;background:#e9efeb;border-radius:999px;overflow:hidden}.weight-bars em{display:block;height:100%;background:linear-gradient(90deg,#2a754e,#8bc65b);border-radius:999px}.settings-note{margin-top:11px;padding:9px 10px;border-radius:9px;background:#fff8e8;border:1px solid #efdda9;color:#866516;font-size:9.5px}.weight-editor{margin-top:13px;border-top:1px solid #edf1ee;padding-top:13px}.weight-inputs{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.weight-inputs label{display:grid;grid-template-columns:1fr 64px 16px;gap:6px;align-items:center}.weight-inputs span{font-size:9px;color:#5f7167}.weight-inputs input{height:34px;border:1px solid #d5e1da;border-radius:8px;padding:0 8px;width:100%;font-weight:900;color:#214632}.weight-inputs small{font-size:9px;color:#7d8b83}.weight-total{margin-top:10px;font-size:9.5px;font-weight:900}.weight-total.ok{color:#267047}.weight-total.bad{color:#b34b42}.weight-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}.weight-actions button{border:1px solid #d4e1da;background:#fff;border-radius:8px;padding:7px 10px;font-size:9px;font-weight:900;color:#355f49;cursor:pointer}.weight-actions .save{background:#1f6e49;color:#fff;border-color:#1f6e49}.weight-actions button:disabled{opacity:.45;cursor:not-allowed}.weight-message{font-size:9.5px;color:#5d7166;margin:8px 0 0}.insight-empty{text-align:center;padding:32px;color:#7b8981;font-size:10px;border:1px dashed #d5dfd9;border-radius:10px}@media(max-width:1150px){.insight-grid{grid-template-columns:1fr}.weight-bars,.weight-inputs{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.insight-head{align-items:flex-start;flex-direction:column}.portfolio-chips{justify-content:flex-start}.card-title,.weight-title{flex-direction:column}.card-title select{max-width:none;width:100%}.ranking-head,.ranking-list button{grid-template-columns:24px 58px 42px 64px 1fr}.weight-bars,.weight-inputs{grid-template-columns:1fr}.insight-score{grid-template-columns:1fr}.insight-score>div{margin:auto}}
`;
