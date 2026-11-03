import { cx, fmtPct, fmtPrice } from '../lib/format';

/** Percentage movement with an arrow; renders a dash when the value is unavailable. */
export default function Delta({ value, className = 'text-sm', digits = 2, showZeroSign = false }) {
  if (value === null || value === undefined) {
    return <span className={cx('mono text-slate-500', className)}>—</span>;
  }
  const number = Number(value);
  const tone = number > 0 ? 'text-emerald-400' : number < 0 ? 'text-rose-400' : 'text-slate-300';
  const arrow = number > 0 ? '▲' : number < 0 ? '▼' : showZeroSign ? '•' : '';
  return (
    <span className={cx('mono inline-flex items-baseline gap-1 font-medium', tone, className)}>
      <span className="text-[0.7em] leading-none">{arrow}</span>
      {fmtPct(number)}
    </span>
  );
}

export function Price({ value, digits = 2, className = '' }) {
  return <span className={cx('mono', className)}>{fmtPrice(value, digits)}</span>;
}
