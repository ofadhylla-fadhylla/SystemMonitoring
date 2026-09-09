import Link from 'next/link';
import { grievances } from '../data/grievances';

export default function Dashboard() {
  const open = grievances.filter(g => g.status !== 'Closed').length;
  const high = grievances.filter(g => g.risk === 'High' && g.status !== 'Closed').length;
  const closed = grievances.filter(g => g.status === 'Closed').length;
  const avg = Math.round(grievances.reduce((s, g) => s + g.progress, 0) / grievances.length);

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <h1>Executive Dashboard</h1>
          <p>Dummy monitoring workspace — replace with validated data later.</p>
        </div>
      </div>

      <section className="kpi-grid">
        <KPI label="Open Grievances" value={open} hint="Need follow-up" />
        <KPI label="High Risk" value={high} hint="Priority cases" />
        <KPI label="Closed" value={closed} hint="Verified closure" />
        <KPI label="Average Progress" value={`${avg}%`} hint="Across all cases" />
      </section>

      <section className="two-col">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent Grievances</h2>
              <p>Latest dummy cases</p>
            </div>
            <Link href="/grievances" className="text-link">View tracker →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Case</th><th>Company</th><th>Risk</th><th>Status</th><th>Progress</th></tr></thead>
              <tbody>
                {grievances.slice(0, 4).map(g => (
                  <tr key={g.id}>
                    <td><Link className="case-link" href={`/grievances/${g.id}`}>{g.id}</Link></td>
                    <td>{g.company}</td>
                    <td><span className={`badge ${g.risk.toLowerCase()}`}>{g.risk}</span></td>
                    <td>{g.status}</td>
                    <td>{g.progress}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h2>Workspace Modules</h2><p>Foundation for the full system</p></div></div>
          <div className="module-list">
            {['Grievance Tracker','Action Monitoring','Audit Monitoring','Certificate Expiry','Document Monitoring','EUDR / NDPE','Buyer Requirement','Training Monitoring'].map((m,i)=>(
              <div className="module-row" key={m}><span>{String(i+1).padStart(2,'0')}</span><strong>{m}</strong><em>{i === 0 ? 'ACTIVE' : 'READY'}</em></div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function KPI({label, value, hint}) {
  return <div className="kpi-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}
