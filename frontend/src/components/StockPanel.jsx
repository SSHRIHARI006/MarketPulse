import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';
import { cx, fmtPct, fmtPrice, fmtTime, fmtVolume } from '../lib/format';
import Delta from './Delta';

function Row({ label, value, tone = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-800/60 py-1.5 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className={cx('mono text-xs text-slate-200', tone)}>{value}</span>
    </div>
  );
}

/** Side panel shown when a heatmap tile (or a row elsewhere) is selected. */
export default function StockPanel({ stock, onClose }) {
  const market = useMarket();
  const live = stock ? market.quotes[stock.stockId] : null;

  const [flash, setFlash] = useState(null);
  const previousPrice = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Brief direction cue when this instrument's price changes while the panel is open.
  useEffect(() => {
    const price = live?.price;
    const previous = previousPrice.current;
    if (!Number.isFinite(price)) return undefined;
    previousPrice.current = price;
    if (!Number.isFinite(previous) || price === previous) return undefined;
    setFlash(price > previous ? 'up' : 'down');
    const timer = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(timer);
  }, [live?.price]);

  if (!stock) return null;

  const price = live?.price ?? stock.price;
  const changePct = live?.changePct ?? stock.changePct;
  const high = live?.high ?? stock.dayHigh;
  const low = live?.low ?? stock.dayLow;
  const volume = live?.volume ?? stock.volume;
  const updatedAt = live?.updatedAt ?? stock.updatedAt;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[1px]" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-sm flex-col border-l border-slate-800 bg-ink-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${stock.companyName} details`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">{stock.companyName}</p>
            <p className="text-[11px] text-slate-500">
              {stock.symbol} · {stock.sector}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-2 py-1" aria-label="Close panel">
            ✕
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="mono text-2xl font-semibold text-white">
              ₹{fmtPrice(price)}
              {flash ? (
                <span className={cx('ml-1 text-sm', flash === 'up' ? 'text-emerald-400' : 'text-rose-400')}>
                  {flash === 'up' ? '▲' : '▼'}
                </span>
              ) : null}
            </span>
            <Delta value={changePct} className="text-base" />
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {updatedAt ? `Last updated ${fmtTime(updatedAt)} IST` : 'No live tick received yet'}
            {live?.dataStatus === 'STALE' ? ' · stale: no recent update' : ''}
            {live?.dataStatus === 'UNAVAILABLE' ? ' · price unavailable' : ''}
            {live?.dataStatus === 'CLOSED' ? ' · market closed, last valid price' : ''}
          </p>

          <div className="mt-4">
            <Row label="Daily change" value={fmtPct(changePct)} />
            <Row label="Previous close" value={`₹${fmtPrice(live?.previousClose ?? stock.previousClose)}`} />
            <Row label="Open" value={`₹${fmtPrice(live?.open ?? stock.open)}`} />
            <Row label="Day high" value={`₹${fmtPrice(high)}`} />
            <Row label="Day low" value={`₹${fmtPrice(low)}`} />
            <Row label="Volume" value={fmtVolume(volume)} />
            <Row label="Sector" value={stock.sector} />
            <Row
              label="Range change"
              value={stock.available ? fmtPct(stock.changePct) : 'unavailable'}
              tone={stock.available ? '' : 'text-slate-500'}
            />
          </div>
        </div>

        <div className="mt-auto border-t border-slate-800 p-4">
          <Link to={`/stock/${stock.stockId}`} className="btn-primary w-full" onClick={onClose}>
            View stock analytics
          </Link>
        </div>
      </aside>
    </div>
  );
}
