'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../lib/supabaseClient';
import {fetchAllRows} from '../lib/fetchAllRows';
import {moduleMetrics} from '../lib/moduleMetrics';
const localMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).formatToParts(new Date()).filter(p=>p.type==='year'||p.type==='month').reduce((s,p)=>({...s,[p.type]:p.value}),{});
const currentMonth=()=>{const {year,month}=localMonth();return year+'-'+month;};
const sources={findings:['smd2_audit_findings','id,audit_id,category,description,due_date'],updates:['smd2_finding_updates','id,finding_id,status,created_at'],kpis:['smd2_kpi_observations','id,company_id,period_month,metric_code,actual,target,created_at'],decisions:['smd2_no_buy_decisions','id,supplier_id,decision,decided_at'],links:['smd2_supplier_links','id,upstream_supplier_id,downstream_supplier_id,status,created_at'],legal:['smd2_company_legal_register','id,company_id,document_type,document_number,valid_until'],layers:['spatial_layers','id,company_id,layer_type,monitoring_date'],documents:['smd2_knowledge_documents','id']};
export default function IntegratedModules({companyId,companies,audits,suppliers,risks,refreshKey}){
 const [period,setPeriod]=useState(currentMonth),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[access,setAccess]=useState(null);
 useEffect(()=>{let active=true;async function load(){setLoading(true);setError('');setData(null);try{const role=await supabase.rpc('smd_is_admin');if(role.error)throw role.error;if(!active)return;setAccess(role.data===true);if(role.data!==true)return;const entries=await Promise.all(Object.entries(sources).map(async ([key,[table,fields]])=>[key,await fetchAllRows(()=>{let q=supabase.from(table).select(fields);if(key==='kpis')q=q.eq('period_month',period+'-01');return q;})]));if(!active)return;const bad=entries.filter(([,r])=>r.error).map(([k])=>k);if(bad.length)throw Error('Unavailable: '+bad.join(', '));setData(Object.fromEntries(entries.map(([k,r])=>[k,r.data])));}catch(e){if(active)setError(e.message||'Unable to verify module data.');}finally{if(active)setLoading(false);}}load();return()=>{active=false};},[period,refreshKey]);
 const m=useMemo(()=>data?moduleMetrics({...data,companies,audits,suppliers,risks},companyId,period):null,[data,companies,audits,suppliers,risks,companyId,period]);
 if(access===false&&!loading)return null;
 return <section className="v2-panel" style={{marginBottom:16}}><div className="panel-head2"><h2>Integrated module overview</h2><label style={{fontSize:12}}>KPI reporting month <input type="month" value={period} required onChange={e=>{if(e.target.value)setPeriod(e.target.value)}}/></label></div>
 {loading?<p role="status">Loading connected modules…</p>:error?<div role="alert" className="smd2-state smd2-state-error">Module data unavailable: {error}. Values are not presented as zero.</div>:m?<><p style={{fontSize:12,color:'#62766a'}}>Follows the company filter, except the document library (group-wide). KPI counts are latest observations for the selected month, not a measure of regulatory compliance.</p><div className="v2-kpis">{[
 ['Operational KPIs',m.kpis.length,m.kpis.length?m.off.length+' off target · '+m.on.length+' on target':'No monthly figures uploaded','/sustainability-kpi'],
 ['Open audit findings',m.open.length,m.overdue.length+' overdue · '+m.findings.length+' recorded','/audit-findings'],
 ['No Buy suppliers',m.blocked.length,m.unverified.length+' supplier risks unverified','/supplier-monitoring'],
 ['Traceability links',m.links.length,'Active declared / verified links touching this scope','/supplier-traceability'],
 ['Company boundary layers',m.boundaries.length,m.alerts.length+' imported alert layers; live feed pending','/spatial-monitoring'],
 ['Legal records',m.legal.length,m.legalExpired.length+' past validity date','/company-legal'],
 ['Knowledge documents',m.documents,'Group-wide indexed documents','/search']
 ].map(([label,count,detail,href])=><Link className="v2-kpi" style={{textDecoration:'none'}} key={label} href={href}><span>{label}</span><strong>{count}</strong><small>{detail}</small><em>Open module →</em></Link>)}</div>{m.notices.length>0?<div className="v2-list"><h3>New module attention items</h3>{m.notices.slice(0,8).map((n,i)=><Link key={i} href={n.href} className="v2-row row-link"><div><strong>{n.title}</strong><span>{n.detail}</span></div><strong className={n.priority==='critical'?'red':'amber'}>{n.priority}</strong></Link>)}</div>:<p style={{fontSize:12,color:'#62766a'}}>No attention items from the records available in these new modules. Empty registers are not proof of compliance.</p>}</>:null}</section>
}
