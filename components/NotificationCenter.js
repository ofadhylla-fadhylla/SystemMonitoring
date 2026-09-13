'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { daysUntil, formatDate } from '../lib/monitoring';

const PRIORITY_RANK = { critical: 0, high: 1, warning: 2, info: 3 };

export default function NotificationCenter(){
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [alerts,setAlerts]=useState([]);
  const rootRef=useRef(null);

  useEffect(()=>{
    loadAlerts();
    const id=setInterval(loadAlerts,5*60*1000);
    return()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    function onDoc(e){ if(rootRef.current&&!rootRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown',onDoc);
    return()=>document.removeEventListener('mousedown',onDoc);
  },[]);

  async function loadAlerts(){
    if(!supabase)return;
    setLoading(true);
    try{
      const [certs,audits,grievances,actions,simsItems,companies,suppliers,risk]=await Promise.all([
        supabase.from('certifications').select('id,company_id,standard,certificate_number,status,valid_until'),
        supabase.from('audit_events').select('id,company_id,title,audit_type,start_date,status'),
        supabase.from('grievances').select('id,case_id,company_id,company,issue_title,status,opened_date'),
        supabase.from('grievance_actions').select('id,grievance_id,action_id,action_description,target_date,status'),
        supabase.from('sims_assessment_items').select('id,self_status,verifier_status'),
        supabase.from('companies').select('id,company_code,company_name'),
        supabase.from('spatial_suppliers').select('id,supplier_name,company_id'),
        supabase.from('supplier_risk_assessments').select('id,supplier_id,risk_level,risk_score,assessed_at').order('assessed_at',{ascending:false}),
      ]);
      const companyMap=Object.fromEntries((companies.data||[]).map(c=>[c.id,c]));
      const grievanceMap=Object.fromEntries((grievances.data||[]).map(g=>[g.id,g]));
      const supplierMap=Object.fromEntries((suppliers.data||[]).map(s=>[s.id,s]));
      const next=[];
      const companyLabel=id=>companyMap[id]?.company_code||companyMap[id]?.company_name||'Company';

      for(const c of certs.data||[]){
        const d=daysUntil(c.valid_until); if(d===null)continue;
        if(c.status==='Expired'||d<0) next.push({priority:'critical',title:`${c.standard} certificate expired`,detail:`${companyLabel(c.company_id)} · ${c.valid_until?formatDate(c.valid_until):'No validity date'}`,href:'/certificates'});
        else if(d<=30) next.push({priority:'high',title:`${c.standard} expires in ${d} day${d===1?'':'s'}`,detail:`${companyLabel(c.company_id)} · renewal attention`,href:'/certificates'});
        else if(d<=90) next.push({priority:'warning',title:`${c.standard} expires in ${d} days`,detail:`${companyLabel(c.company_id)} · upcoming renewal`,href:'/certificates'});
      }

      for(const a of audits.data||[]){
        if(['Done','Cancelled'].includes(a.status))continue;
        const d=daysUntil(a.start_date); if(d===null||d<0||d>30)continue;
        next.push({priority:d<=14?'high':'warning',title:d===0?'Audit scheduled today':`Audit in ${d} day${d===1?'':'s'}`,detail:`${companyLabel(a.company_id)} · ${a.title||a.audit_type||'Audit'}`,href:'/audits'});
      }

      for(const g of grievances.data||[]){
        if(g.status==='Closed')continue;
        next.push({priority:'warning',title:`Open grievance ${g.case_id||''}`.trim(),detail:`${g.company||companyLabel(g.company_id)} · ${g.issue_title||'Needs follow-up'}`,href:`/grievances/${g.case_id||g.id}`});
      }

      for(const a of actions.data||[]){
        if(a.status==='Completed')continue;
        const d=daysUntil(a.target_date); if(d===null||d>=0)continue;
        const g=grievanceMap[a.grievance_id];
        next.push({priority:'critical',title:`Corrective action overdue ${Math.abs(d)} day${Math.abs(d)===1?'':'s'}`,detail:`${a.action_id||'Action'} · ${g?.case_id||'Grievance'} · ${a.action_description||''}`,href:'/actions'});
      }

      const pending=(simsItems.data||[]).filter(i=>i.self_status==='Fulfilled'&&i.verifier_status!=='Verified').length;
      const revision=(simsItems.data||[]).filter(i=>i.verifier_status==='Need Revision').length;
      if(revision)next.push({priority:'high',title:`${revision} SIMS item${revision===1?'':'s'} need revision`,detail:'Verifier requested correction or additional evidence.',href:'/sims/assessment'});
      if(pending)next.push({priority:'warning',title:`${pending} SIMS item${pending===1?'':'s'} pending verification`,detail:'Fulfilled assessments are waiting for verifier review.',href:'/sims/assessment'});

      const seen=new Set();
      for(const r of risk.data||[]){
        if(seen.has(r.supplier_id))continue; seen.add(r.supplier_id);
        if(!['High','Critical'].includes(r.risk_level))continue;
        const s=supplierMap[r.supplier_id];
        next.push({priority:r.risk_level==='Critical'?'critical':'high',title:`${r.risk_level} supplier spatial risk`,detail:`${s?.supplier_name||'Supplier'} · ${r.risk_score}/100${s?.company_id?` · ${companyLabel(s.company_id)}`:''}`,href:'/spatial-monitoring'});
      }

      next.sort((x,y)=>(PRIORITY_RANK[x.priority]??9)-(PRIORITY_RANK[y.priority]??9));
      setAlerts(next.slice(0,40));
    }catch{
      // The notification center is intentionally non-blocking. Optional modules may not exist on older deployments.
    }finally{setLoading(false)}
  }

  const urgent=useMemo(()=>alerts.filter(a=>a.priority==='critical'||a.priority==='high').length,[alerts]);

  return <div className="notify-root" ref={rootRef}>
    <style>{`
      .notify-root{position:relative}.notify-button{width:38px;height:38px;border:1px solid #d6e2dc;background:#fff;border-radius:11px;display:grid;place-items:center;cursor:pointer;color:#17402f;position:relative}.notify-button:hover{background:#f3f8f5}.notify-button svg{width:18px;height:18px}.notify-badge{position:absolute;right:-5px;top:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#c94f43;color:#fff;font-size:9px;font-weight:900;display:grid;place-items:center;border:2px solid #fff}.notify-panel{position:absolute;right:0;top:47px;width:min(390px,calc(100vw - 24px));max-height:520px;background:#fff;border:1px solid #d8e4dd;border-radius:16px;box-shadow:0 22px 55px rgba(16,49,34,.18);z-index:1000;overflow:hidden}.notify-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:15px 16px;border-bottom:1px solid #edf2ef}.notify-head strong{font-size:14px;color:#173b2b}.notify-head span{font-size:10px;color:#7a8981}.notify-refresh{border:0;background:#eff6f2;color:#266044;padding:6px 9px;border-radius:8px;font-size:10px;font-weight:800;cursor:pointer}.notify-list{max-height:430px;overflow:auto}.notify-empty{padding:28px 18px;text-align:center;color:#77887f;font-size:12px}.notify-item{display:grid;grid-template-columns:9px 1fr;gap:11px;padding:13px 16px;border-bottom:1px solid #f0f3f1;color:inherit;text-decoration:none}.notify-item:hover{background:#f8fbf9}.notify-dot{width:9px;height:9px;border-radius:50%;margin-top:4px;background:#7b9386}.notify-dot.critical{background:#c94f43}.notify-dot.high{background:#e47a36}.notify-dot.warning{background:#d7a430}.notify-copy strong{display:block;color:#214332;font-size:11.5px;margin-bottom:4px}.notify-copy span{display:block;color:#75857c;font-size:10.5px;line-height:1.4}.notify-foot{padding:10px 16px;background:#f8fbf9;color:#7b8b82;font-size:9.5px;border-top:1px solid #edf2ef}@media(max-width:700px){.notify-panel{right:-90px}}
    `}</style>
    <button className="notify-button" type="button" aria-label="Notifications" onClick={()=>{setOpen(v=>!v);if(!open)loadAlerts()}}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      {alerts.length?<span className="notify-badge">{alerts.length>99?'99+':alerts.length}</span>:null}
    </button>
    {open?<div className="notify-panel">
      <div className="notify-head"><div><strong>Attention Center</strong><span>{urgent} urgent · {alerts.length} total</span></div><button className="notify-refresh" onClick={loadAlerts}>{loading?'Refreshing…':'Refresh'}</button></div>
      <div className="notify-list">{alerts.length?alerts.map((a,i)=><Link key={`${a.title}-${i}`} href={a.href} className="notify-item" onClick={()=>setOpen(false)}><span className={`notify-dot ${a.priority}`}/><span className="notify-copy"><strong>{a.title}</strong><span>{a.detail}</span></span></Link>):<div className="notify-empty">No active attention items.</div>}</div>
      <div className="notify-foot">Built from live Certification, Audit, Grievance, SIMS and Spatial Risk data.</div>
    </div>:null}
  </div>
}
