'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { grievances as seedGrievances } from '../../../data/grievances';

const STORAGE_KEY = 'sm_custom_grievances';

export default function GrievanceDetail() {
  const params = useParams();
  const id = params?.id;
  const [g, setGrievance] = useState(() => seedGrievances.find(x => x.id === id) || null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const custom = Array.isArray(saved) ? saved : [];
      setGrievance([...custom, ...seedGrievances].find(x => x.id === id) || null);
    } catch {
      setGrievance(seedGrievances.find(x => x.id === id) || null);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  if (!loaded && !g) return <div className="page-wrap"><p>Loading case...</p></div>;

  if (!g) {
    return <div className="page-wrap"><h1>Case not found</h1><Link className="text-link" href="/grievances">← Back to tracker</Link></div>;
  }

  const timeline = Array.isArray(g.timeline) ? g.timeline : [];

  return (
    <div className="page-wrap">
      <div className="breadcrumb"><Link href="/grievances">Grievance Tracker</Link> / {g.id}</div>
      <div className="page-heading">
        <div><h1>{g.id} — {g.title}</h1><p>{g.company} · {g.location}</p></div>
        <div className="detail-actions"><span className={`badge ${String(g.risk).toLowerCase()}`}>{g.risk} Risk</span><span className="status-pill">{g.status}</span></div>
      </div>

      <section className="detail-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>Case Overview</h2><p>Core grievance information</p></div></div>
          <div className="info-grid">
            <Info label="Category" value={g.category} />
            <Info label="Source" value={g.source || '-'} />
            <Info label="Opened" value={g.opened || '-'} />
            <Info label="PIC" value={g.pic || '-'} />
            <Info label="Next Action" value={g.nextAction || '-'} />
            <Info label="Due Date" value={g.dueDate || '-'} />
          </div>
          <div className="summary-box"><span>Case Summary</span><p>{g.summary || 'No summary entered yet.'}</p></div>
        </div>

        <div className="panel progress-panel">
          <div className="panel-head"><div><h2>Resolution Progress</h2><p>Current completion</p></div></div>
          <div className="big-progress">{g.progress || 0}%</div>
          <div className="progress large"><div style={{width:`${g.progress || 0}%`}}></div></div>
          <div className="stage-list">
            {['Complaint Received','Assessment / Investigation','Stakeholder Engagement','Corrective Action','Verification','Closed'].map((s,i)=><div key={s}><span>{i+1}</span>{s}</div>)}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Case Timeline</h2><p>Chronological activity log</p></div><button className="secondary-btn" onClick={() => alert('Add Update will be activated in the next step.')}>+ Add Update</button></div>
        <div className="timeline">
          {timeline.length ? timeline.map(([date,title,desc],i)=>(
            <div className="timeline-item" key={i}>
              <div className="timeline-dot"></div>
              <div className="timeline-date">{date}</div>
              <div className="timeline-card"><strong>{title}</strong><p>{desc}</p></div>
            </div>
          )) : <div className="empty-state">No timeline update yet.</div>}
        </div>
      </section>

      <section className="two-col">
        <div className="panel"><div className="panel-head"><div><h2>Action Plan</h2><p>Placeholder for follow-up actions</p></div></div><div className="empty-state">Action records will be stored here when Supabase is connected.</div></div>
        <div className="panel"><div className="panel-head"><div><h2>Evidence & Documents</h2><p>Photos, letters, maps, minutes</p></div></div><div className="empty-state">Evidence upload will be connected to Supabase Storage.</div></div>
      </section>
    </div>
  );
}

function Info({label,value}) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}
