import { daysUntil } from './monitoring';

export const DEFAULT_RISK_WEIGHTS = {
  certification: 25,
  grievanceAction: 25,
  sims: 30,
  spatial: 20,
};

// Backward-compatible export used by older UI code.
export const RISK_WEIGHTS = DEFAULT_RISK_WEIGHTS;

let runtimeRiskWeights = { ...DEFAULT_RISK_WEIGHTS };

export function normalizeRiskWeights(input = {}) {
  const next = {
    certification: Number(input.certification ?? DEFAULT_RISK_WEIGHTS.certification),
    grievanceAction: Number(input.grievanceAction ?? input.grievance_action ?? DEFAULT_RISK_WEIGHTS.grievanceAction),
    sims: Number(input.sims ?? DEFAULT_RISK_WEIGHTS.sims),
    spatial: Number(input.spatial ?? DEFAULT_RISK_WEIGHTS.spatial),
  };
  const values = Object.values(next);
  const valid = values.every(v => Number.isFinite(v) && v >= 0 && v <= 100);
  const total = values.reduce((sum, value) => sum + value, 0);
  return valid && total === 100 ? next : { ...DEFAULT_RISK_WEIGHTS };
}

export function setRuntimeRiskWeights(weights = DEFAULT_RISK_WEIGHTS) {
  runtimeRiskWeights = normalizeRiskWeights(weights);
  return { ...runtimeRiskWeights };
}

export function getRuntimeRiskWeights() {
  return { ...runtimeRiskWeights };
}

export function riskLevel(score){
  const n=Number(score||0);
  if(n>=75)return 'Critical';
  if(n>=50)return 'High';
  if(n>=25)return 'Moderate';
  return 'Low';
}

export function calculateExecutiveRisk({certifications=[],grievances=[],actions=[],simsItems=[],suppliers=[],latestRiskBySupplier={},weights=null}){
  const activeWeights = normalizeRiskWeights(weights || runtimeRiskWeights);

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
    {key:'certification',label:'Certification',weight:activeWeights.certification,score:certifications.length?certScore:null,available:certifications.length>0,detail:`${expired} expired · ${expiring90} expiring ≤90 days`},
    {key:'grievanceAction',label:'Grievance & Actions',weight:activeWeights.grievanceAction,score:grievanceScore,available:true,detail:`${openGrievances} open grievance · ${overdueActions} overdue action`},
    {key:'sims',label:'SIMS Compliance',weight:activeWeights.sims,score:simsScore,available:simsScore!==null,detail:simsCompliance===null?'No SIMS assessment':`${simsCompliance}% verified fulfilled`},
    {key:'spatial',label:'Supplier Spatial Risk',weight:activeWeights.spatial,score:spatialScore,available:spatialScore!==null,detail:spatialScore===null?'No saved supplier risk':`Highest saved supplier score ${spatialScore}/100`},
  ];

  const available=components.filter(c=>c.available && c.weight>0);
  const totalWeight=available.reduce((s,c)=>s+c.weight,0);
  const score=totalWeight?Math.round(available.reduce((s,c)=>s+c.score*c.weight,0)/totalWeight):0;
  const level=riskLevel(score);
  const drivers=available.filter(c=>Number(c.score||0)>0).sort((a,b)=>b.score-a.score);

  return {
    score,
    level,
    components,
    drivers,
    weights: activeWeights,
    coverage:{available:available.length,total:components.filter(c=>c.weight>0).length},
    metrics:{expired,expiring90,openGrievances,openActions,overdueActions,simsCompliance,spatialScore},
  };
}
