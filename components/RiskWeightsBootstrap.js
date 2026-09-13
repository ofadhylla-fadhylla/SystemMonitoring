'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_RISK_WEIGHTS, setRuntimeRiskWeights } from '../lib/riskScore';

export default function RiskWeightsBootstrap({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!supabase) {
        setRuntimeRiskWeights(DEFAULT_RISK_WEIGHTS);
        if (active) setReady(true);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('risk_weight_settings')
          .select('certification,grievance_action,sims,spatial')
          .eq('settings_key', 'executive')
          .maybeSingle();

        if (error || !data) {
          setRuntimeRiskWeights(DEFAULT_RISK_WEIGHTS);
        } else {
          setRuntimeRiskWeights({
            certification: data.certification,
            grievanceAction: data.grievance_action,
            sims: data.sims,
            spatial: data.spatial,
          });
        }
      } catch {
        setRuntimeRiskWeights(DEFAULT_RISK_WEIGHTS);
      } finally {
        if (active) setReady(true);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  if (!ready) {
    return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f3f7f5',color:'#355747',fontSize:12,fontWeight:700}}>Loading risk configuration…</div>;
  }

  return children;
}
