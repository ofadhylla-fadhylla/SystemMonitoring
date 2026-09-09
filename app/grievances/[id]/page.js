import Link from 'next/link';
import { grievances } from '../../../data/grievances';

export default async function GrievanceDetail({ params }) {
  const { id } = await params;
  const g = grievances.find(x => x.id === id);

  if (!g) return <div className="page-wrap"><h1>Case not found</h1><Link href="/grievances">Back to tracker</Link></div>;

  return (
    <div className="page-wrap">
      <div className="breadcrumb"><Link href="/grievances">Grievance Tracker</Link> / {g.id}</div>
      <div className="page-heading">
        <div><h1>{g.id} — {g.title}</h1><p>{g.company} · {g.location}</p></div>
        <div className="detail-actions"><span className={`badge ${g.risk.toLowerCase()}`}>{g.risk} Risk</span><span className="status-pill">{g.status}</span></div>
      </div>

      <section className="detail-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>Case Overview</h2><p>Core grievance information</p></div></div>
          <div className="info-grid">
            <Info label="Category" value={g.category} />
            <Info label="Source" value={g.source} />
            <Info label="Opened" value={g.opened} />
            <Info label="PIC" value={g.pic} />
            <Info label="Next Action" value={g.nextAction} />
            <Info label="Due Date" value={g.dueDate} />
          </div>
          <div className="summary-box"><span>Case Summary</span><p>{g.summary}</p></div>
        </div>

        <div className="panel progress-panel">
          <div className="panel-head"><div><h2>Resolution Progress</h2><p>Current completion</p></div></div>
          <div className="big-progress">{g.progress}%</div>
          <div className="progress large"><div style={{width:`${g.progress}%`}}></div></div>
          <div className="stage-list">
            {['Complaint Received','Assessment / Investigation','Stakeholder Engagement','Corrective Action','Verification','Closed'].map((s,i)=><div key={s}><span>{i+1}</span>{s}</div>)}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Case Timeline</h2><p>Chronological activity log</p></div><button className="secondary-btn">+ Add Update</button></div>
        <div className="timeline">
          {g.timeline.map(([date,title,desc],i)=>(
            <div className="timeline-item" key={i}>
              <div className="timeline-dot"></div>
              <div className="timeline-date">{date}</div>
              <div className="timeline-card"><strong>{title}</strong><p>{desc}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="two-col">
        <div className="panel"><div className="panel-head"><div><h2>Action Plan</h2><p>Placeholder for follow-up actions</p></div></div><div className="empty-state">Action records will be stored here when Supabase is connected.</div></div>
        <div className="panel"><div className="panel-head"><div><h2>Evidence & Documents</h2><p>Photos, letters, maps, minutes</p></div></div><div className="empty-state">Evidence upload will be connected to Supabase Storage.</div></div>
      </section>
    </div>
  );
}

function Info({label,value}) { return <div className="info"><span>{label}</span><strong>{value}</strong></div>; }
