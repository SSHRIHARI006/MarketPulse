export const cx = (...classes) => classes.filter(Boolean).join(' ');

export function fmtPrice(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function fmtPct(value, { signed = true, digits = 2 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  const sign = signed ? (number > 0 ? '+' : '') : '';
  return `${sign}${number.toFixed(digits)}%`;
}

export function fmtSigned(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(digits)}`;
}

/** Indian market conventions: lakh / crore. */
export function fmtVolume(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (number >= 1e7) return `${(number / 1e7).toFixed(2)} Cr`;
  if (number >= 1e5) return `${(number / 1e5).toFixed(2)} L`;
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)} K`;
  return number.toLocaleString('en-IN');
}

export function fmtCrore(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `₹${(Number(value) / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

export function fmtTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })} · ${fmtTime(iso)}`;
}

export function fmtAgo(iso) {
  if (!iso) return '—';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

/** Keeps the timestamp string of a marker legible on the chart axis. */
export function shortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
}

export function changeTone(value) {
  if (value === null || value === undefined) return 'text-slate-400';
  if (Number(value) > 0) return 'text-emerald-400';
  if (Number(value) < 0) return 'text-rose-400';
  return 'text-slate-300';
}

export const EVENT_LABELS = {
  VOLUME_SPIKE: 'Volume spike',
  PRICE_SURGE: 'Sudden price rise',
  PRICE_DROP: 'Sudden price decline',
  VOLATILITY_SPIKE: 'Volatility increase',
  UNUSUAL_ACTIVITY: 'Unusual activity'
};
