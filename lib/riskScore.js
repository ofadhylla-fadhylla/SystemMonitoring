import { daysUntil } from './monitoring';

export const RISK_WEIGHTS = {
  certification: 25,
  grievanceAction: 25,
  sims: 30,
  spatial: 20,
};

export function riskLevel(score){
  const n=Number(score||0);
  if(n>=75)return 'Critical';
  if(n>=50)return 'High';
  if(n>=25)return 'Moderate';
  return 'Low';
}

export function calculateExecutiveRisk({certifications=[],grievances=[],actions=[],simsItems=[],suppliers=[],latestRiskBySupplier={}}){
  const expired=certifications.filter(c=>{const d=daysUntil(c.valid_until);return c.status==='Expired'||(d!==null&&d<0)}).length;
  const expiring90=certifications.filter(c=>{const d=daysUntil(c.valid_until);return d!==null&&d>=0&&d<=90}).length;
  const certScore=Math.min(100,expired*30+expiring90*10);

  const openGrievances=grievances.filter(g=>g.status!=='Closed').length;
  const openActions=actions.filter(a=>a.status!=='Completed').length;
  const overdueActions=actions.filter(a=>a.status!=='Completed'&&daysUntil(a.target_date)!==null&&daysUntil(a.target_date)<0).length;
  const grievanceScore=Math.min(100,openGrievances*18+overdueActions*25+Math.max(0,openActions-overdueActions)*4);

  const verified=simsItems.filter(i=>i.self_status==='Fulfilled'&&i.verifier_status==='Verified').length;
  const simsCompliance=simsItems.length?Math.round(verified/simsItems.length*100):null;
  const simsScore=simsCompliance===null?null:Math.max(0,100-simsCompliance);

  const latestRisks=suppliers.map(s=>latestRiskBySupplier[s.id]).filter(Boolean);
  const spatialScore=latestRisks.length?Math.max(...latestRisks.map(r=>Number(r.risk_score||0))):null;

  const components=[
    {key:'certification',label:'Certification',weight:RISK_WEIGHTS.certification,score:certifications.length?certScore:null,available:certifications.length>0,detail:`${expired} expired · ${expiring90} expiring ≤90 days`},
    {key:'grievanceAction',label:'Grievance & Actions',weight:RISK_WEIGHTS.grievanceAction,score:grievanceScore,available:true,detail:`${openGrievances} open grievance · ${overdueActions} overdue action`},
    {key:'sims',label:'SIMS Compliance',weight:RISK_WEIGHTS.sims,score:simsScore,available:simsScore!==null,detail:simsCompliance===null?'No SIMS assessment':`${simsCompliance}% verified fulfilled`},
    {key:'spatial',label:'Supplier Spatial Risk',weight:RISK_WEIGHTS.spatial,score:spatialScore,available:spatialScore!==null,detail:spatialScore===null?'No saved supplier risk':`Highest saved supplier score ${spatialScore}/100`},
  ];

  const available=components.filter(c=>c.available);
  const totalWeight=available.reduce((s,c)=>s+c.weight,0);
  const score=totalWeight?Math.round(available.reduce((s,c)=>s+c.score*c.weight,0)/totalWeight):0;
  const level=riskLevel(score);
  const drivers=available.filter(c=>Number(c.score||0)>0).sort((a,b)=>b.score-a.score);

  return {
    score,
    level,
    components,
    drivers,
    coverage:{available:available.length,total:components.length},
    metrics:{expired,expiring90,openGrievances,openActions,overdueActions,simsCompliance,spatialScore},
  };
}
