import Link from 'next/link';

const menu = [
  ['/', 'Dashboard', '⌂'],
  ['/grievances', 'Grievance Tracker', '⚑'],
  ['/actions', 'Action Monitoring', '✓'],
  ['/audits', 'Audit Monitoring', '▣'],
  ['/certificates', 'Certificates', '◈'],
  ['/documents', 'Documents', '▤'],
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SM</div>
        <div>
          <div className="brand-title">SYSTEM</div>
          <div className="brand-subtitle">MONITORING</div>
        </div>
      </div>
      <nav>
        {menu.map(([href, label, icon]) => (
          <Link key={href} href={href} className="nav-item">
            <span className="nav-icon">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-note">
        <strong>Supabase Mode</strong>
        <span>Shared database & private evidence storage.</span>
      </div>
    </aside>
  );
}
