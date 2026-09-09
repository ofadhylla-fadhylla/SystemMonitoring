'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { grievances } from '../../data/grievances';

export default function GrievanceTracker() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [risk, setRisk] = useState('All');

  const filtered = useMemo(() => grievances.filter(g => {
    const text = `${g.id} ${g.company} ${g.location} ${g.category} ${g.title}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (status === 'All' || g.status === status) && (risk === 'All' || g.risk === risk);
  }), [search, status, risk]);

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div><h1>Grievance Tracker</h1><p>Register, monitor, verify and close stakeholder grievance cases.</p></div>
        <button className="primary-btn" onClick={() => alert('Starter mode: form input will be connected to Supabase in the next stage.')}>+ Add Grievance</button>
      </div>

      <section className="kpi-grid compact">
        <KPI label="Total Cases" value={grievances.length} />
        <KPI label="Open / Active" value={grievances.filter(g=>g.status!=='Closed').length} />
        <KPI label="High Risk" value={grievances.filter(g=>g.risk==='High' && g.status!=='Closed').length} />
        <KPI label="Closed" value={grievances.filter(g=>g.status==='Closed').length} />
      </section>

      <section className="panel">
        <div className="filters">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search case, company, category..." />
          <select value={status} onChange={e=>setStatus(e.target.value)}>
            {['All','Open','In Progress','Verification','Closed'].map(v=><option key={v}>{v}</option>)}
          </select>
          <select value={risk} onChange={e=>setRisk(e.target.value)}>
            {['All','High','Medium','Low'].map(v=><option key={v}>{v}</option>)}
          </select>
          <div className="result-count">{filtered.length} case(s)</div>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Case ID</th><th>Company / Site</th><th>Issue</th><th>Risk</th><th>Status</th><th>Progress</th><th>Due Date</th><th></th></tr></thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id}>
                  <td><strong>{g.id}</strong><div className="muted">{g.opened}</div></td>
                  <td>{g.company}<div className="muted">{g.location}</div></td>
                  <td>{g.title}<div className="muted">{g.category}</div></td>
                  <td><span className={`badge ${g.risk.toLowerCase()}`}>{g.risk}</span></td>
                  <td><span className="status-pill">{g.status}</span></td>
                  <td><div className="progress"><div style={{width:`${g.progress}%`}}></div></div><div className="muted">{g.progress}%</div></td>
                  <td>{g.dueDate}</td>
                  <td><Link href={`/grievances/${g.id}`} className="view-btn">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KPI({label, value}) { return <div className="kpi-card"><span>{label}</span><strong>{value}</strong></div>; }
