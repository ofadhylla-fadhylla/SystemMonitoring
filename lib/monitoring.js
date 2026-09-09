export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0,0,0,0);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target - today) / 86400000);
}

export function expiryState(validUntil, status) {
  if (status === 'Expired') return { label: 'Expired', tone: 'danger' };
  const days = daysUntil(validUntil);
  if (days === null) return { label: 'No Expiry', tone: 'neutral' };
  if (days < 0) return { label: 'Expired', tone: 'danger' };
  if (days <= 30) return { label: `${days} days`, tone: 'danger' };
  if (days <= 90) return { label: `${days} days`, tone: 'warning' };
  return { label: `${days} days`, tone: 'success' };
}

export function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export function sanitizeFileName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '-');
}
