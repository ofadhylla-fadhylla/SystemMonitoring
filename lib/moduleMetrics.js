import {latest as latestKpi,status as kpiStatus,metric} from './sustainabilityKpi';
import {restriction,activeLinks} from './supplierTraceability';
import {daysUntil} from './monitoring';
export function latestBy(rows,key,date='created_at'){const map=new Map();for(const r of [...rows].sort((a,b)=>Date.parse(b[date])-Date.parse(a[date])||String(b.id).localeCompare(String(a.id))))if(!map.has(r[key]))map.set(r[key],r);return map;}
export function supplierRisk(r){const raw=r?.risk_score;return !r||r.assessment_json?.risk?.assessment_status==='INCOMPLETE'||['INCOMPLETE','PRELIMINARY'].includes(r.assessment_json?.assessment_status)||raw===null||raw===undefined||raw===''||!Number.isFinite(Number(raw))||Number(raw)<0||Number(raw)>100||!['Low','Medium','High','Critical'].includes(r.risk_level)?'Unverified':r.risk_level;}
export function moduleMetrics(data,companyId='',period){
 const match=r=>!companyId||r.company_id===companyId;
 const audits=new Map(data.audits.filter(match).map(a=>[a.id,a]));
 const companies=data.companies.filter(match),suppliers=data.suppliers.filter(match),supplierIds=new Set(suppliers.map(s=>s.id));
 const updates=latestBy(data.updates,'finding_id'),findings=data.findings.filter(f=>audits.has(f.audit_id)).map(f=>({...f,status:updates.get(f.id)?.status||'Open',company_id:audits.get(f.audit_id)?.company_id}));
 const open=findings.filter(f=>f.status!=='Closed'),overdue=open.filter(f=>daysUntil(f.due_date)!==null&&daysUntil(f.due_date)<0);
 const kpis=latestKpi(data.kpis.filter(r=>match(r)&&r.period_month.slice(0,7)===period));
 const off=kpis.filter(r=>kpiStatus(r)==='Off target'),on=kpis.filter(r=>kpiStatus(r)==='On target');
 const risks=latestBy(data.risks,'supplier_id','assessed_at'),blocked=suppliers.filter(s=>restriction(data.decisions,s.id)==='Blocked'),unverified=suppliers.filter(s=>supplierRisk(risks.get(s.id))==='Unverified');
 const links=activeLinks(data.links).filter(l=>supplierIds.has(l.upstream_supplier_id)||supplierIds.has(l.downstream_supplier_id));
 const legal=data.legal.filter(match),legalExpired=legal.filter(l=>daysUntil(l.valid_until)!==null&&daysUntil(l.valid_until)<0);
 const layers=data.layers.filter(match),boundaries=layers.filter(l=>l.layer_type==='company_boundary'&&l.company_id),alerts=layers.filter(l=>['hotspot','deforestation_alert'].includes(l.layer_type));
 const notices=[...overdue.map(f=>({priority:'critical',title:'Audit finding overdue',detail:f.category+' · '+f.description,href:'/audit-findings'})),...blocked.map(s=>({priority:'critical',title:'Supplier on No Buy List',detail:s.supplier_name,href:'/supplier-monitoring'})),...legalExpired.map(l=>({priority:'high',title:'Legal document validity ended',detail:l.document_type+' · '+l.document_number,href:'/company-legal'})),...off.map(k=>({priority:'warning',title:'Sustainability KPI off target',detail:metric(k.metric_code)?.label+' · '+k.period_month.slice(0,7),href:'/sustainability-kpi'}))];
 return {companies,findings,open,overdue,kpis,on,off,blocked,unverified,links,legal,legalExpired,layers,boundaries,alerts,notices,documents:data.documents.length};
}
