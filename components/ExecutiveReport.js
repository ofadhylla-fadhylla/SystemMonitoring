'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { daysUntil, formatDate } from '../lib/monitoring';
import { calculateExecutiveRisk, getRuntimeRiskWeights, normalizeRiskWeights } from '../lib/riskScore';

export default function ExecutiveReport(){
  const [data,setData]=useState({companies:[],certifications:[],audits:[],grievances:[],actions:[],simsAssessments:[],simsItems:[],suppliers:[],riskAssessments:[]});
  const [weights,setWeights]=useState(()=>getRuntimeRiskWeights());
  const [companyId,setCompanyId]=useState('');
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);
  const [message,setMessage]=useState('');

  useEffect(()=>{loadAll()},[]);

  async function loadAll(){
    if(!supabase){setLoading(false);return;}
    setLoading(true);
    const [co,c,a,g,ac,sa,si,sp,ra,setting]=await Promise.all([
      supabase.from('companies').select('*').order('company_code'),
      supabase.from('certifications').select('*').order('valid_until'),
      supabase.from('audit_events').select('*').order('start_date'),
      supabase.from('grievances').select('*').order('opened_date',{ascending:false}),
      supabase.from('grievance_actions').select('*').order('target_date'),
      supabase.from('sims_assessments').select('*').order('assessment_year',{ascending:false}),
      supabase.from('sims_assessment_items').select('*'),
      supabase.from('spatial_suppliers').select('*'),
      supabase.from('supplier_risk_assessments').select('*').order('assessed_at',{ascending:false}),
      supabase.from('risk_weight_settings').select('certification,grievance_action,sims,spatial').eq('settings_key','executive').maybeSingle(),
    ]);
    if(!setting.error&&setting.data)setWeights(normalizeRiskWeights({certification:setting.data.certification,grievanceAction:setting.data.grievance_action,sims:setting.data.sims,spatial:setting.data.spatial}));
    const next={companies:co.data||[],certifications:c.data||[],audits:a.data||[],grievances:g.data||[],actions:ac.data||[],simsAssessments:sa.data||[],simsItems:si.data||[],suppliers:sp.error?[]:(sp.data||[]),riskAssessments:ra.error?[]:(ra.data||[])};
    setData(next);
    const requested=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('company'):'';
    const fallback=next.companies.find(x=>x.status!=='Inactive')?.id||'';
    setCompanyId(next.companies.some(x=>x.id===requested)?requested:fallback);
    setLoading(false);
  }

  const latestRiskBySupplier=useMemo(()=>{const map={};for(const r of data.riskAssessments){if(!map[r.supplier_id])map[r.supplier_id]=r;}return map;},[data.riskAssessments]);
  const selected=useMemo(()=>{
    const company=data.companies.find(c=>c.id===companyId);if(!company)return null;
    return buildReportData(company,data,latestRiskBySupplier,weights);
  },[companyId,data,latestRiskBySupplier,weights]);

  async function generatePdf(){
    if(!selected)return;
    setGenerating(true);setMessage('');
    try{
      const {jsPDF}=await import('jspdf');
      const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      renderPdf(doc,selected,weights);
      const date=new Date().toISOString().slice(0,10);
      doc.save(`SMD_Executive_Report_${selected.company.company_code||'PT'}_${date}.pdf`);
      setMessage('PDF generated successfully.');
    }catch(error){setMessage(error?.message||'Failed to generate PDF.');}
    finally{setGenerating(false)}
  }

  return <div className="page-wrap report-root"><style>{styles}</style>
    <section className="report-hero"><div><span>EXECUTIVE REPORT</span><h1>Sustainability Management Report</h1><p>Management-ready summary generated from live SMD data.</p></div><Link href="/">← Back to Dashboard</Link></section>
    <section className="report-controls"><label><span>Company / PT</span><select value={companyId} onChange={e=>setCompanyId(e.target.value)}>{data.companies.filter(c=>c.status!=='Inactive').map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></label><button disabled={!selected||generating} onClick={generatePdf}>{generating?'Generating PDF…':'Generate Executive Report PDF'}</button></section>
    {message?<div className="report-message">{message}</div>:null}
    {loading?<div className="report-empty">Loading report data…</div>:selected?<ReportPreview row={selected}/>:<div className="report-empty">No company data.</div>}
  </div>
}

function ReportPreview({row}){const m=row.risk.metrics;return <>
  <section className={`report-score ${row.risk.level.toLowerCase()}`}><div><strong>{row.risk.score}</strong><span>/100</span></div><section><h2>{row.company.company_code} · {row.company.company_name}</h2><b>{row.risk.level} Executive Risk</b><p>{row.summary}</p></section></section>
  <section className="report-kpis"><K label="Expired Certificates" value={m.expired}/><K label="Expiring ≤90 Days" value={m.expiring90}/><K label="Open Grievances" value={m.openGrievances}/><K label="Overdue Actions" value={m.overdueActions}/><K label="SIMS Compliance" value={m.simsCompliance===null?'—':`${m.simsCompliance}%`}/><K label="Spatial Risk" value={m.spatialScore===null?'—':m.spatialScore}/></section>
  <section className="report-grid"><div className="report-card"><h3>Risk Components</h3>{row.risk.components.map(c=><div className="component-row" key={c.key}><span>{c.label}</span><b>{c.available?`${Math.round(c.score)}/100`:'N/A'}</b><small>{c.detail}</small></div>)}</div><div className="report-card"><h3>Management Actions</h3>{row.actions.map((a,i)=><div className="action-row" key={i}><b>{i+1}</b><span>{a}</span></div>)}</div></section>
  <section className="report-grid"><div className="report-card"><h3>Nearest Certification Issues</h3>{row.certificateIssues.length?row.certificateIssues.slice(0,6).map(c=><div className="list-row" key={c.id}><span>{c.standard||'Certificate'}</span><b>{c.valid_until?formatDate(c.valid_until):'-'}</b></div>):<p className="muted">No certificate issue.</p>}</div><div className="report-card"><h3>Open Grievances / Actions</h3><div className="list-row"><span>Open grievances</span><b>{m.openGrievances}</b></div><div className="list-row"><span>Open corrective actions</span><b>{m.openActions}</b></div><div className="list-row"><span>Overdue corrective actions</span><b>{m.overdueActions}</b></div><div className="list-row"><span>Upcoming audits ≤30d</span><b>{row.upcomingAudits}</b></div></div></section>
</>}
function K({label,value}){return <div><span>{label}</span><strong>{value}</strong></div>}

function buildReportData(company,data,latestRiskBySupplier,weights){
  const match=record=>{if(record?.company_id===company.id)return true;const hay=`${record?.company||''} ${record?.company_code||''} ${record?.entity||''}`.toLowerCase();const code=String(company.company_code||'').toLowerCase(),name=String(company.company_name||'').toLowerCase();return (!!code&&hay.includes(code))||!!name&&hay.includes(name)};
  const certifications=data.certifications.filter(match),audits=data.audits.filter(match),grievances=data.grievances.filter(match);const grievanceIds=new Set(grievances.map(g=>g.id));const actions=data.actions.filter(a=>grievanceIds.has(a.grievance_id));const suppliers=data.suppliers.filter(s=>s.company_id===company.id);
  const assessments=data.simsAssessments.filter(a=>a.company_id===company.id).sort((a,b)=>Number(b.assessment_year||0)-Number(a.assessment_year||0));const seen=new Set();const latest=assessments.filter(a=>{if(seen.has(a.standard_id))return false;seen.add(a.standard_id);return true});const assessmentIds=new Set(latest.map(a=>a.id));const simsItems=data.simsItems.filter(i=>assessmentIds.has(i.assessment_id));
  const risk=calculateExecutiveRisk({certifications,grievances,actions,simsItems,suppliers,latestRiskBySupplier,weights});
  const upcomingAudits=audits.filter(a=>{const d=daysUntil(a.start_date);return d!==null&&d>=0&&d<=30&&!['Done','Cancelled'].includes(a.status)}).length;
  const certificateIssues=certifications.filter(c=>{const d=daysUntil(c.valid_until);return c.status==='Expired'||(d!==null&&d<=90)}).sort((a,b)=>String(a.valid_until||'').localeCompare(String(b.valid_until||'')));
  const summary=buildSummary(company,risk,upcomingAudits);
  const managementActions=buildActions(risk,upcomingAudits);
  return{company,certifications,audits,grievances,actions,suppliers,simsItems,risk,upcomingAudits,certificateIssues,summary,actions:managementActions};
}
function buildSummary(company,risk,upcomingAudits){const top=risk.drivers[0];return `${company.company_code} has an Executive Risk Score of ${risk.score}/100 (${risk.level}). ${top?`The highest current driver is ${top.label} at ${Math.round(top.score)}/100.`:'No material active risk driver is visible in the available components.'} ${upcomingAudits?`${upcomingAudits} audit activity is scheduled within 30 days.`:''}`.trim()}
function buildActions(risk,upcomingAudits){const m=risk.metrics,a=[];if(m.expired>0)a.push(`Prioritize renewal or closure decision for ${m.expired} expired certificate(s).`);else if(m.expiring90>0)a.push(`Confirm renewal plan and PIC for ${m.expiring90} certificate(s) expiring within 90 days.`);if(m.overdueActions>0)a.push(`Escalate ${m.overdueActions} overdue corrective action(s) and agree recovery dates.`);if(m.openGrievances>0)a.push(`Review ${m.openGrievances} open grievance(s) and verify closure evidence.`);if(m.simsCompliance!==null&&m.simsCompliance<80)a.push(`Accelerate SIMS gap closure; verified compliance is ${m.simsCompliance}%.`);if(m.spatialScore!==null&&m.spatialScore>=50)a.push(`Apply enhanced supplier due diligence to the highest spatial-risk supplier (${m.spatialScore}/100).`);if(upcomingAudits>0)a.push(`Complete readiness review for ${upcomingAudits} audit(s) scheduled within 30 days.`);if(!a.length)a.push('Maintain current controls and continue routine monthly monitoring.');return a.slice(0,6)}

function renderPdf(doc,row,weights){
  const green=[23,78,53],light=[241,247,243],dark=[30,63,45],grey=[103,119,110],red=[176,67,57],amber=[164,116,28];
  let y=0;const pageH=297,margin=15,maxW=180;
  const ensure=h=>{if(y+h>pageH-15){doc.addPage();y=18;}};
  const text=(value,x,size=9,color=dark,style='normal',width=maxW)=>{doc.setFont('helvetica',style);doc.setFontSize(size);doc.setTextColor(...color);const lines=doc.splitTextToSize(String(value||''),width);doc.text(lines,x,y);y+=lines.length*(size*0.42)+2;};
  const section=title=>{ensure(14);y+=3;doc.setFillColor(...light);doc.roundedRect(margin,y-5,maxW,10,2,2,'F');doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(...dark);doc.text(title,margin+4,y+1);y+=10;};
  const rowLine=(l,v)=>{ensure(8);doc.setFontSize(8.5);doc.setTextColor(...grey);doc.text(l,margin,y);doc.setFont('helvetica','bold');doc.setTextColor(...dark);doc.text(String(v),195,y,{align:'right'});doc.setDrawColor(232,238,234);doc.line(margin,y+2,195,y+2);doc.setFont('helvetica','normal');y+=7;};

  doc.setFillColor(...green);doc.rect(0,0,210,40,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('SMD Executive Sustainability Report',margin,18);doc.setFontSize(11);doc.text(`${row.company.company_code} — ${row.company.company_name}`,margin,27);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.text(`Generated ${new Date().toLocaleString('en-GB')} · System Monitoring Dashboard`,margin,34);y=50;

  doc.setFont('helvetica','bold');doc.setFontSize(30);doc.setTextColor(...(row.risk.level==='Critical'?red:row.risk.level==='High'?amber:green));doc.text(String(row.risk.score),margin,y);doc.setFontSize(9);doc.text('/100',31,y);doc.setFontSize(13);doc.setTextColor(...dark);doc.text(`${row.risk.level} Executive Risk`,48,y-2);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...grey);doc.text(`Risk weights: Certification ${weights.certification}% · Grievance/Actions ${weights.grievanceAction}% · SIMS ${weights.sims}% · Spatial ${weights.spatial}%`,48,y+5);y+=15;
  text(row.summary,margin,9,dark,'normal',maxW);

  section('Executive KPI');
  const m=row.risk.metrics;rowLine('Expired certificates',m.expired);rowLine('Expiring ≤90 days',m.expiring90);rowLine('Open grievances',m.openGrievances);rowLine('Open corrective actions',m.openActions);rowLine('Overdue corrective actions',m.overdueActions);rowLine('SIMS verified compliance',m.simsCompliance===null?'N/A':`${m.simsCompliance}%`);rowLine('Highest supplier spatial risk',m.spatialScore===null?'N/A':`${m.spatialScore}/100`);rowLine('Upcoming audits ≤30 days',row.upcomingAudits);

  section('Risk Component Breakdown');
  row.risk.components.forEach(c=>rowLine(`${c.label} — ${c.detail}`,c.available?`${Math.round(c.score)}/100`:'N/A'));

  section('Recommended Management Actions');
  row.actions.forEach((a,i)=>{ensure(12);doc.setFillColor(...light);doc.circle(margin+3,y-1,3,'F');doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...green);doc.text(String(i+1),margin+3,y+1,{align:'center'});const lines=doc.splitTextToSize(a,168);doc.setFont('helvetica','normal');doc.setTextColor(...dark);doc.text(lines,margin+10,y+1);y+=Math.max(8,lines.length*4.2+2)});

  section('Certification Attention');
  if(row.certificateIssues.length)row.certificateIssues.slice(0,12).forEach(c=>rowLine(`${c.standard||'Certificate'} · ${c.certificate_number||'No certificate number'}`,c.valid_until?formatDate(c.valid_until):'-'));else text('No certificate expiry issue in the available data.',margin,8.5,grey);

  section('Open Grievance Summary');
  if(row.grievances.filter(g=>g.status!=='Closed').length)row.grievances.filter(g=>g.status!=='Closed').slice(0,10).forEach(g=>rowLine(`${g.case_id||'-'} · ${g.issue_title||g.category||'Grievance'}`,g.status||'Open'));else text('No open grievance.',margin,8.5,grey);

  section('Data Coverage & Disclaimer');
  text(`Executive Risk uses ${row.risk.coverage.available}/${row.risk.coverage.total} available components. Components without data are excluded and remaining weights are re-normalized. This report is decision support based on current SMD records; it does not replace formal certification, legal, or audit conclusions.`,margin,8,grey,'normal',maxW);

  const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(140,150,145);doc.text(`SMD · ${row.company.company_code} · Page ${p}/${pages}`,195,290,{align:'right'});}
}

const styles=`
.report-root{max-width:1180px;margin:0 auto}.report-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;background:linear-gradient(135deg,#0d4d34,#123d2d);color:#fff;border-radius:20px;padding:22px 24px;margin-bottom:14px}.report-hero span{font-size:9px;font-weight:900;letter-spacing:.12em;color:#c5d8cd}.report-hero h1{margin:5px 0;font-size:28px}.report-hero p{margin:0;color:#d0ddd5;font-size:11px}.report-hero a{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:9px 11px;font-size:10px;font-weight:800}.report-controls{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;background:#fff;border:1px solid #dce7e0;border-radius:14px;padding:14px;margin-bottom:12px}.report-controls label{display:grid;gap:5px}.report-controls label span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6d7d74;font-weight:900}.report-controls select{height:40px;border:1px solid #d7e2db;border-radius:9px;padding:0 10px;font-weight:800;color:#224934}.report-controls button{height:40px;border:0;border-radius:9px;background:#1f6b48;color:#fff;font-weight:900;padding:0 16px;cursor:pointer}.report-controls button:disabled{opacity:.6}.report-message{padding:9px 11px;border:1px solid #d6e6dc;background:#f1f8f4;color:#2c6546;border-radius:9px;font-size:10px;margin-bottom:12px}.report-empty{text-align:center;padding:35px;border:1px dashed #d3ded7;border-radius:12px;color:#7e8c84}.report-score{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;background:#fff;border:1px solid #dce7e0;border-radius:16px;padding:18px;margin-bottom:12px}.report-score>div{width:92px;height:92px;border-radius:50%;border:8px solid #55a873;background:#eef7f1;display:grid;place-items:center;align-content:center}.report-score.high>div{border-color:#df8b3f;background:#fff6eb}.report-score.critical>div{border-color:#c94f43;background:#fff0ee}.report-score.moderate>div{border-color:#d5ac3f;background:#fff9e8}.report-score strong{font-size:30px;color:#173f2d;line-height:1}.report-score>div span{font-size:9px;color:#74847b}.report-score h2{margin:0 0 4px;font-size:20px;color:#173f2d}.report-score section>b{font-size:10px;color:#347152}.report-score p{font-size:10px;color:#718178;line-height:1.5}.report-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin-bottom:12px}.report-kpis>div{background:#fff;border:1px solid #dce7e0;border-radius:12px;padding:12px}.report-kpis span{display:block;font-size:8.5px;color:#718178;text-transform:uppercase;font-weight:800}.report-kpis strong{display:block;font-size:22px;color:#183f2d;margin-top:5px}.report-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.report-card{background:#fff;border:1px solid #dce7e0;border-radius:14px;padding:15px}.report-card h3{margin:0 0 10px;color:#183f2d;font-size:14px}.component-row,.list-row{display:grid;grid-template-columns:1fr auto;gap:5px;padding:8px 0;border-top:1px solid #edf1ee}.component-row span,.list-row span{font-size:10px;color:#4f6658}.component-row b,.list-row b{font-size:10px;color:#234735}.component-row small{grid-column:1/-1;color:#7d8a83;font-size:8.5px}.action-row{display:grid;grid-template-columns:24px 1fr;gap:8px;padding:8px 0;border-top:1px solid #edf1ee}.action-row b{width:22px;height:22px;border-radius:50%;background:#eef7f1;color:#296a48;display:grid;place-items:center;font-size:9px}.action-row span{font-size:10px;color:#4f6658;line-height:1.45}.muted{color:#7d8a83;font-size:10px}@media(max-width:900px){.report-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:700px){.report-hero{flex-direction:column}.report-controls,.report-grid{grid-template-columns:1fr}.report-kpis{grid-template-columns:repeat(2,1fr)}}
`;
