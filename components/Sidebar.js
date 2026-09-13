'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const groups = [
  {
    key: 'grievance',
    label: 'Grievance',
    icon: '⚑',
    items: [
      ['/grievances', 'Grievance Tracker'],
      ['/actions', 'Action Monitoring'],
    ],
  },
  {
    key: 'certification',
    label: 'Certification',
    icon: '◈',
    items: [
      ['/audits', 'Audit Monitoring'],
      ['/certificates', 'Certification Monitoring'],
      ['/quotations', 'Penawaran Harga'],
    ],
  },
  {
    key: 'sims',
    label: 'SIMS',
    icon: '◫',
    items: [
      ['/sims/assessment', 'Sustainability Assessment'],
      ['/sims/action-plan', 'Sustainability Action Plan'],
      ['/sims/compliance', 'Sustainability Compliance Level'],
    ],
  },
  {
    key: 'risk',
    label: 'Risk Assessment',
    icon: '◎',
    items: [
      ['/spatial-monitoring', 'Monitoring Spasial'],
      ['/non-spatial-monitoring', 'Monitoring Non Spasial'],
    ],
  },
];

const standalone = [
  ['/', 'Dashboard', '⌂'],
  ['/master-data', 'Master Company & Site', '▦'],
  ['/weekly-report', 'Weekly Report', '▧'],
];

function isPathActive(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const initialOpen = Object.fromEntries(
    groups.map(group => [
      group.key,
      group.items.some(([href]) => isPathActive(pathname, href)),
    ])
  );
  const [openGroups, setOpenGroups] = useState(initialOpen);

  useEffect(() => {
    setOpenGroups(current => {
      const next = { ...current };
      groups.forEach(group => {
        if (group.items.some(([href]) => isPathActive(pathname, href))) next[group.key] = true;
      });
      return next;
    });
  }, [pathname]);

  const toggleGroup = key => {
    setOpenGroups(current => ({ ...current, [key]: !current[key] }));
  };

  return (
    <aside className="sidebar">
      <style>{`
        .sidebar-nav{display:flex;flex-direction:column;gap:3px}
        .sidebar-group{margin:2px 0}
        .sidebar-group-button{width:100%;border:0;background:transparent;color:#d8e2dc;display:flex;align-items:center;gap:12px;padding:12px 13px;border-radius:10px;font:inherit;font-size:14px;cursor:pointer;text-align:left;transition:.16s ease}
        .sidebar-group-button:hover,.sidebar-group-button.active{background:#1b3728;color:#fff}
        .sidebar-group-button.open{background:#173426;color:#fff}
        .sidebar-group-label{flex:1;font-weight:700}
        .sidebar-chevron{font-size:15px;color:#9fb0a6;transition:transform .18s ease;line-height:1}
        .sidebar-chevron.open{transform:rotate(90deg);color:#d7f36a}
        .sidebar-submenu{margin:2px 0 7px 24px;padding:3px 0 3px 13px;border-left:1px solid #335244;display:flex;flex-direction:column;gap:2px}
        .sidebar-subitem{position:relative;color:#bfcfc5;padding:9px 10px;border-radius:8px;font-size:12.5px;line-height:1.25;transition:.16s ease}
        .sidebar-subitem:hover{background:#183126;color:#fff}
        .sidebar-subitem.active{background:#214331;color:#fff;font-weight:700}
        .sidebar-subitem.active:before{content:'';position:absolute;left:-14px;top:50%;transform:translateY(-50%);width:3px;height:18px;border-radius:99px;background:#d7f36a}
        .nav-item.active{background:#1b3728;color:#fff;font-weight:700}
        .sidebar-section-separator{height:1px;background:#213b2d;margin:7px 8px}
        .dash-hero .eyebrow,.dash-hero p{display:none!important}
        .dash-hero h1{margin-bottom:0!important}
        @media(max-width:1000px){
          .sidebar-group-label,.sidebar-chevron,.sidebar-submenu{display:none}
          .sidebar-group-button{justify-content:center;padding:12px 13px}
          .sidebar-group-button .nav-icon{width:22px}
        }
      `}</style>

      <div className="brand">
        <div className="brand-mark">SM</div>
        <div><div className="brand-title">SYSTEM</div><div className="brand-subtitle">MONITORING</div></div>
      </div>

      <nav className="sidebar-nav">
        <Link href="/" className={`nav-item ${isPathActive(pathname, '/') ? 'active' : ''}`}>
          <span className="nav-icon">⌂</span><span>Dashboard</span>
        </Link>

        {groups.slice(0, 2).map(group => {
          const groupActive = group.items.some(([href]) => isPathActive(pathname, href));
          const open = !!openGroups[group.key];
          return (
            <div className="sidebar-group" key={group.key}>
              <button
                type="button"
                className={`sidebar-group-button ${groupActive ? 'active' : ''} ${open ? 'open' : ''}`}
                onClick={() => toggleGroup(group.key)}
                aria-expanded={open}
              >
                <span className="nav-icon">{group.icon}</span>
                <span className="sidebar-group-label">{group.label}</span>
                <span className={`sidebar-chevron ${open ? 'open' : ''}`}>›</span>
              </button>
              {open ? (
                <div className="sidebar-submenu">
                  {group.items.map(([href, label]) => (
                    <Link key={href} href={href} className={`sidebar-subitem ${isPathActive(pathname, href) ? 'active' : ''}`}>
                      {label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="sidebar-section-separator" />
        <Link href="/master-data" className={`nav-item ${isPathActive(pathname, '/master-data') ? 'active' : ''}`}>
          <span className="nav-icon">▦</span><span>Master Company & Site</span>
        </Link>
        <div className="sidebar-section-separator" />

        {groups.slice(2).map(group => {
          const groupActive = group.items.some(([href]) => isPathActive(pathname, href));
          const open = !!openGroups[group.key];
          return (
            <div className="sidebar-group" key={group.key}>
              <button
                type="button"
                className={`sidebar-group-button ${groupActive ? 'active' : ''} ${open ? 'open' : ''}`}
                onClick={() => toggleGroup(group.key)}
                aria-expanded={open}
              >
                <span className="nav-icon">{group.icon}</span>
                <span className="sidebar-group-label">{group.label}</span>
                <span className={`sidebar-chevron ${open ? 'open' : ''}`}>›</span>
              </button>
              {open ? (
                <div className="sidebar-submenu">
                  {group.items.map(([href, label]) => (
                    <Link key={href} href={href} className={`sidebar-subitem ${isPathActive(pathname, href) ? 'active' : ''}`}>
                      {label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="sidebar-section-separator" />
        <Link href="/weekly-report" className={`nav-item ${isPathActive(pathname, '/weekly-report') ? 'active' : ''}`}>
          <span className="nav-icon">▧</span><span>Weekly Report</span>
        </Link>
      </nav>

      <div className="sidebar-note">
        <strong>Supabase Mode</strong>
        <span>Grievance, certification, SIMS, risk assessment, master company & weekly reporting.</span>
      </div>
    </aside>
  );
}
