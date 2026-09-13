export const ROLE_CONFIG = {
  admin: {
    label: 'Administrator',
    description: 'Full access to all modules and configuration.',
    paths: ['*'],
  },
  assessor: {
    label: 'Assessor',
    description: 'Operational assessment, evidence, grievance, audit and risk monitoring access.',
    paths: ['/', '/company-360', '/grievances', '/actions', '/audits', '/certificates', '/sims/assessment', '/sims/action-plan', '/sims/compliance', '/spatial-monitoring', '/non-spatial-monitoring', '/weekly-report', '/executive-report'],
  },
  verifier: {
    label: 'Verifier',
    description: 'Verification and review access across SIMS, audit, grievance and risk monitoring.',
    paths: ['/', '/company-360', '/grievances', '/actions', '/audits', '/certificates', '/sims/assessment', '/sims/action-plan', '/sims/compliance', '/spatial-monitoring', '/non-spatial-monitoring', '/weekly-report', '/executive-report'],
  },
  viewer: {
    label: 'Management Viewer',
    description: 'Read-focused access to dashboard, company profile, compliance and reports.',
    paths: ['/', '/company-360', '/sims/compliance', '/weekly-report', '/executive-report'],
  },
};

// Existing users intentionally remain Admin so no one loses access during the role-framework rollout.
// Roles can be changed later after the operational responsibility matrix is agreed.
export const SYSTEM_USERS = [
  {
    name: 'Ochtoryano Fadhylla',
    username: 'ochtoryano.fadhylla',
    email: 'ochtoryano.fadhylla@systemmonitoring.local',
    role: 'admin',
  },
  {
    name: 'Winengku Pamartajati',
    username: 'winengku.pamartajati',
    email: 'winengku.pamartajati@systemmonitoring.local',
    role: 'admin',
  },
  {
    name: 'Shafiyah Mutiara',
    username: 'shafiyah.mutiara',
    email: 'shafiyah.mutiara@systemmonitoring.local',
    role: 'admin',
  },
  {
    name: 'Nicky Sudarmantoro',
    username: 'nicky.sudarmantoro',
    email: 'nicky.sudarmantoro@systemmonitoring.local',
    role: 'admin',
  },
];

export function getSystemUserByEmail(email = '') {
  const normalized = String(email || '').trim().toLowerCase();
  return SYSTEM_USERS.find(user => user.email.toLowerCase() === normalized) || null;
}

export function getRoleLabel(role = 'viewer') {
  return ROLE_CONFIG[role]?.label || ROLE_CONFIG.viewer.label;
}

export function canAccessPath(role = 'viewer', pathname = '/') {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.viewer;
  if (config.paths.includes('*')) return true;
  return config.paths.some(path => path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`));
}
