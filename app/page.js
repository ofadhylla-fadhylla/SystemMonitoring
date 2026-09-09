'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, getSupabaseConfigError } from '../lib/supabaseClient';

export default function Dashboard() {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      const configError = getSupabaseConfigError();
      if (configError || !supabase) {
        if (active) {
          setError(configError || 'Supabase is not configured.');
          setLoading(false);
        }
        return;
      }

      const { data, error: queryError } = await supabase
        .from('grievances')
        .select('*')
        .order('created_at', { ascending: false });

      if (!active) return;
      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }

      setGrievances((data || []).map(mapDbCase));
      setLoading(false);
    }

    loadDashboard();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const open = grievances.filter(g => g.status !== 'Closed').length;
    const high = grievances.filter(g => ['High', 'Critical'].includes(g.risk) && g.status !== 'Closed').length;
    const closed = grievances.filter(g => g.status === 'Closed').length;
    const avg = grievances.length
      ? Math.round(grievances.reduce((sum, g) => sum + Number(g.progress || 0), 0) / grievances.length)
      : 0;
    return { open, high, closed, avg };
  }, [grievances]);

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div>
          <h1>Executive Dashboard</h1>
          <p>Supabase-backed monitoring workspace — shared across devices.</p>
        </div>
      </div>

      {error ? <div className="sync-error"><strong>Supabase connection issue</strong><span>{error}</span></div> : null}
      {!error && !loading ? <div className="sync-success">● Supabase connected — live shared data</div> : null}

      <section className="kpi-grid">
        <KPI label="Open Grievances" value={loading ? '…' : stats.open} hint="Need follow-up" />
        <KPI label="High / Critical Risk" value={loading ? '…' : stats.high} hint="Priority cases" />
        <KPI label="Closed" value={loading ? '…' : stats.closed} hint="Verified closure" />
        <KPI label="Average Progress" value={loading ? '…' : `${stats.avg}%`} hint="Across all cases" />
      </section>

      <section className="two-col">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent Grievances</h2>
              <p>Latest cases from Supabase</p>
            </div>
            <Link href="/grievances" className="text-link">View tracker →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Case</th><th>Company</th><th>Risk</th><th>Status</th><th>Progress</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="empty-cell">Loading Supabase data…</td></tr>
                ) : grievances.length ? (
                  grievances.slice(0, 5).map(g => (
                    <tr key={g.id}>
                      <td><Link className="case-link" href={`/grievances/${g.id}`}>{g.id}</Link></td>
                      <td>{g.company}</td>
                      <td><span className={`badge ${String(g.risk).toLowerCase()}`}>{g.risk}</span></td>
                      <td>{g.status}</td>
                      <td>{g.progress}%</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="5" className="empty-cell">No Supabase grievance yet. Add a dummy case from Grievance Tracker.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h2>Workspace Modules</h2><p>Foundation for the full system</p></div></div>
          <div className="module-list">
            {['Grievance Tracker','Action Monitoring','Audit Monitoring','Certificate Expiry','Document Monitoring','EUDR / NDPE','Buyer Requirement','Training Monitoring'].map((m,i)=>(
              <div className="module-row" key={m}><span>{String(i+1).padStart(2,'0')}</span><strong>{m}</strong><em>{i === 0 ? 'SUPABASE' : 'READY'}</em></div>
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

function mapDbCase(row) {
  return {
    rowId: row.id,
    id: row.case_id,
    company: row.company || '',
    location: row.site || '',
    category: row.category || '',
    title: row.issue_title || '',
    source: row.complaint_source || '',
    opened: row.opened_date || '',
    risk: row.risk_level || 'Medium',
    status: row.status || 'Open',
    progress: Number(row.progress || 0),
    pic: row.pic || '',
    nextAction: row.next_action || '',
    dueDate: row.due_date || '',
    summary: row.case_summary || '',
  };
}
