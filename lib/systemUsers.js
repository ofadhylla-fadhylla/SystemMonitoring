export const SYSTEM_USERS = [
  {
    name: 'Ochtoryano Fadhylla',
    username: 'ochtoryano.fadhylla',
    email: 'ochtoryano.fadhylla@systemmonitoring.local',
  },
  {
    name: 'Winengku Pamartajati',
    username: 'winengku.pamartajati',
    email: 'winengku.pamartajati@systemmonitoring.local',
  },
  {
    name: 'Shafiyah Mutiara',
    username: 'shafiyah.mutiara',
    email: 'shafiyah.mutiara@systemmonitoring.local',
  },
  {
    name: 'Nicky Sudarmantoro',
    username: 'nicky.sudarmantoro',
    email: 'nicky.sudarmantoro@systemmonitoring.local',
  },
];

export function getSystemUserByEmail(email = '') {
  const normalized = String(email || '').trim().toLowerCase();
  return SYSTEM_USERS.find(user => user.email.toLowerCase() === normalized) || null;
}
