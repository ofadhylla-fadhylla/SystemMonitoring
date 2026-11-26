'use client';

import { useState } from 'react';
import DashboardV2 from '../components/DashboardV2';
import ExecutiveInsightPanel from '../components/ExecutiveInsightPanel';
import PortfolioAnalyticsPanel from '../components/PortfolioAnalyticsPanel';
import DataQualityPanel from '../components/DataQualityPanel';

export default function HomePage(){
  const [expanded,setExpanded]=useState(false);
  return <><DashboardV2/>
    <section className="smd2-advanced-shell">
      <style>{`
        .smd2-advanced-shell{margin:0 24px 24px;background:#fff;border:1px solid #dce7e0;border-radius:18px;overflow:hidden}
        .smd2-advanced-toggle{font:inherit;display:flex;width:100%;align-items:center;justify-content:space-between;gap:16px;text-align:left;background:#fff;border:0;padding:20px 24px;color:#183e2d;cursor:pointer}
        .smd2-advanced-toggle strong{display:block;font-size:17px}.smd2-advanced-toggle small{display:block;font-size:12px;margin-top:5px;color:#6b7f72}.smd2-advanced-toggle>span:last-child{color:#126045;font-size:13px;font-weight:700;white-space:nowrap}
        .smd2-advanced-toggle:focus-visible{outline:3px solid #54a678;outline-offset:-3px}
        @media(max-width:750px){.smd2-advanced-shell{margin:0 12px 16px}.smd2-advanced-toggle{padding:16px}}
      `}</style>
      <button className="smd2-advanced-toggle" type="button" aria-expanded={expanded} aria-controls="smd2-advanced-content" onClick={()=>setExpanded(v=>!v)}>
        <span><strong>Advanced analytics &amp; data quality</strong><small>Existing executive insight, portfolio analytics and data quality tools.</small></span><span>{expanded?'Hide details −':'Show details +'}</span>
      </button>
      <div id="smd2-advanced-content" hidden={!expanded}>{expanded?<><ExecutiveInsightPanel/><PortfolioAnalyticsPanel/><DataQualityPanel/></>:null}</div>
    </section></>;
}
