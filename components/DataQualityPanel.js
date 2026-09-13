'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { daysUntil } from '../lib/monitoring';

export default function DataQualityPanel(){
  const [data,setData]=useState({companies:[],certifications:[],audits:[],grievances:[],actions:[],assessments:[],items:[],suppliers:[],risks:[]});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{load()},[]);
  async function load(){
    if(!supabase){setLoading(false);return;}
    setLoading(true);setError('');
    const [co,ce,au,gr,ac,sa,si,sp,ra]=await Promise.all([
      supabase.from('companies').select('id,company_code,company_name,status'),
      supabase.from('certifications').select('id,company_id,standard,certificate_number,status,valid_until'),
      supabase.from('audit_events').select('id,company_id,title,start_date,status'),
      supabase.from('grievances').select('id,company_id,case_id,issue_title,category,status'),
      supabase.from('grievance_actions').select('id,grievance_id,pic,target_date,status'),
      supabase.from('sims_assessments').select('id,company_id,standard_id,assessment_year,status'),
      supabase.from('sims_assessment_items').select('id,assessment_id,self_status,verifier_status'),
      supabase.from('spatial_suppliers').select('id,company_id,supplier_name'),
      supabase.from('supplier_risk_assessments').select('id,supplier_id,assessed_at,risk_score')
    ]);
    const hard=[co,ce,au,gr,ac].find(x=>x.error)?.error;
    if(hard)setError(hard.message);
    setData({companies:co.data||[],certifications:ce.data||[],audits:au.data||[],grievances:gr.data||[],actions:ac.data||[],assessments:sa.error?[]:(sa.data||[]),items:si.error?[]:(si.data||[]),suppliers:sp.error?[]:(sp.data||[]),risks:ra.error?[]:(ra.data||[])});
    setLoading(false);
  }

  const checks=useMemo(()=>buildChecks(data),[data]);
  const total=checks.reduce((s,x)=>s+x.count,0);
  const critical=checks.filter(x=>x.severity==='critical').reduce((s,x)=>s+x.count,0);
  const warning=checks.filter(x=>x.severity==='warning').reduce((s,x)=>s+x.count,0);
  const completeness=checks.length?Math.max(0,100-Math.min(100,critical*8+warning*3)):100;

  return <section className="dq-root">
    <style>{styles}</style>
    <div className="dq-head"><div><span>DATA GOVERNANCE</span><h2>Data Quality Center</h2><p>Automatic validation of missing, inconsistent and overdue records across SMD.</p></div><button onClick={load} disabled={loading}>{loading?'Checking…':'Recheck'}</button></div>
    {error?<div className="dq-error">{error}</div>:null}
    <div className="dq-summary"><div><span>Data Quality Score</span><strong>{loading?'…':`${completeness}%`}</strong></div><div><span>Issues Found</span><strong>{loading?'…':total}</strong></div><div><span>Critical</span><strong>{loading?'…':critical}</strong></div><div><span>Warning</span><strong>{loading?'…':warning}</strong></div></div>
    <div className="dq-grid">{checks.map(c=><Link href={c.href} key={c.key} className={`dq-card ${c.severity}`}><div><b>{c.title}</b><span>{c.detail}</span></div><strong>{c.count}</strong></Link>)}</div>
    {!loading&&total===0?<div className="dq-clean">✓ No material data-quality issue detected in the current records.</div>:null}
  </section>
}

function buildChecks(d){
  const companyIds=new Set(d.companies.map(x=>x.id));
  const grievanceIds=new Set(d.grievances.map(x=>x.id));
  const assessmentIds=new Set(d.assessments.map(x=>x.id));
  const riskSupplierIds=new Set(d.risks.map(x=>x.supplier_id));
  const certMissing=d.certifications.filter(x=>!x.company_id||!companyIds.has(x.company_id)||!x.standard||!x.certificate_number||!x.valid_until).length;
  const certMismatch=d.certifications.filter(x=>{const du=daysUntil(x.valid_until);return du!==null&&du<0&&x.status!=='Expired'}).length;
  const auditMissing=d.audits.filter(x=>!x.company_id||!companyIds.has(x.company_id)||!x.start_date||!x.title).length;
  const grievanceMissing=d.grievances.filter(x=>!x.company_id||!companyIds.has(x.company_id)||!(x.issue_title||x.category)).length;
  const actionMissing=d.actions.filter(x=>!grievanceIds.has(x.grievance_id)||!x.pic||(!x.target_date&&x.status!=='Completed')).length;
  const overdue=d.actions.filter(x=>x.status!=='Completed'&&daysUntil(x.target_date)!==null&&daysUntil(x.target_date)<0).length;
  const simsPending=d.items.filter(x=>assessmentIds.has(x.assessment_id)&&x.self_status==='Fulfilled'&&x.verifier_status!=='Verified').length;
  const simsNotStarted=d.items.filter(x=>assessmentIds.has(x.assessment_id)&&['Not Started','Pending',''].includes(x.self_status||'')).length;
  const supplierNoRisk=d.suppliers.filter(x=>!riskSupplierIds.has(x.id)).length;
  return [
    {key:'cert-missing',title:'Certification master incomplete',detail:'Company, standard, certificate number or validity is missing.',count:certMissing,severity:certMissing?'critical':'ok',href:'/certificates'},
    {key:'cert-mismatch',title:'Certificate status mismatch',detail:'Validity has ended but record is not marked Expired.',count:certMismatch,severity:certMismatch?'warning':'ok',href:'/certificates'},
    {key:'audit-missing',title:'Audit schedule incomplete',detail:'Company, audit title or start date is missing.',count:auditMissing,severity:auditMissing?'warning':'ok',href:'/audits'},
    {key:'grievance-missing',title:'Grievance master incomplete',detail:'Company or issue description is missing.',count:grievanceMissing,severity:grievanceMissing?'critical':'ok',href:'/grievances'},
    {key:'action-missing',title:'Action plan incomplete',detail:'PIC, deadline or grievance linkage needs completion.',count:actionMissing,severity:actionMissing?'warning':'ok',href:'/actions'},
    {key:'action-overdue',title:'Corrective actions overdue',detail:'Target date has passed and action is not Completed.',count:overdue,severity:overdue?'critical':'ok',href:'/actions'},
    {key:'sims-review',title:'SIMS awaiting verification',detail:'Fulfilled indicators have not yet been Verified.',count:simsPending,severity:simsPending?'warning':'ok',href:'/sims/assessment'},
    {key:'sims-not-started',title:'SIMS indicators not assessed',detail:'Indicators in active assessment remain Not Started.',count:simsNotStarted,severity:simsNotStarted?'warning':'ok',href:'/sims/assessment'},
    {key:'supplier-risk',title:'Supplier without saved risk result',detail:'Supplier exists but has no saved spatial risk assessment.',count:supplierNoRisk,severity:supplierNoRisk?'warning':'ok',href:'/spatial-monitoring'},
  ];
}

const styles=`
.dq-root{margin:14px 0 24px;background:#fff;border:1px solid #dce7e0;border-radius:18px;padding:18px}.dq-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.dq-head span{font-size:9px;letter-spacing:.12em;font-weight:900;color:#728078}.dq-head h2{margin:4px 0 3px;color:#183f2d;font-size:20px}.dq-head p{margin:0;color:#718178;font-size:10px}.dq-head button{border:1px solid #d7e2db;background:#f7faf8;color:#24533b;border-radius:9px;padding:8px 11px;font-weight:800;cursor:pointer}.dq-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}.dq-summary>div{background:#f7faf8;border:1px solid #e1e9e4;border-radius:11px;padding:10px}.dq-summary span{display:block;font-size:8px;text-transform:uppercase;color:#74837b;font-weight:800}.dq-summary strong{display:block;color:#183f2d;font-size:21px;margin-top:3px}.dq-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.dq-card{text-decoration:none;border:1px solid #e1e9e4;border-left:4px solid #95ac9f;border-radius:11px;padding:10px 11px;display:flex;justify-content:space-between;gap:10px;background:#fff;color:inherit}.dq-card.warning{border-left-color:#d5a22e;background:#fffdf6}.dq-card.critical{border-left-color:#c9574d;background:#fff9f8}.dq-card.ok{opacity:.58}.dq-card b{display:block;color:#244837;font-size:10px}.dq-card span{display:block;color:#78857e;font-size:8.5px;line-height:1.35;margin-top:3px}.dq-card>strong{font-size:20px;color:#1e4934}.dq-clean{margin-top:10px;padding:10px;border-radius:9px;background:#eff8f2;color:#2d6b48;font-size:10px;font-weight:800}.dq-error{margin-bottom:10px;padding:9px;background:#fff3f1;color:#a24940;border-radius:8px;font-size:9px}@media(max-width:900px){.dq-grid{grid-template-columns:1fr 1fr}}@media(max-width:650px){.dq-summary,.dq-grid{grid-template-columns:1fr 1fr}.dq-head{flex-direction:column}}
`;
