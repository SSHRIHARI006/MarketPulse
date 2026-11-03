import { useMemo } from 'react';
import { useMarket } from '../context/MarketContext';
import { EVENT_LABELS, cx, fmtAgo, fmtTime } from '../lib/format';
import { LoadingBlock } from './StateViews';

const SEVERITY_STYLES = {
  CRITICAL: 'border-rose-500/50 bg-rose-500/10 text-rose-300',
  HIGH: 'border-orange-500/50 bg-orange-500/10 text-orange-300',
  MODERATE: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  LOW: 'border-slate-600/60 bg-slate-700/20 text-slate-300'
};

const CATEGORY_STYLES = {
  'Very High': 'text-rose-300',
  High: 'text-orange-300',
  Moderate: 'text-amber-300',
  Normal: 'text-slate-400'
};

export default function ActivityFeed({ activity, loading }) {
  const market = useMarket();

  const events = useMemo(() => {
    const merged = new Map();
    for (const event of [...(market.events || []), ...(activity?.events || [])]) {
      if (!event?.id) continue;
      if (!merged.has(event.id)) merged.set(event.id, event);
    }
    return [...merged.values()]
      .sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt))
      .slice(0, 12);
  }, [market.events, activity]);

  const scored = activity?.activity || [];

  return (
    <section className="card flex flex-col" aria-label="Unusual market activity">
      <div className="card-header">
        <div>
          <h2 className="card-title">Unusual activity</h2>
          <p className="text-[10px] text-slate-600">Rule-based detectors · duplicates suppressed within cooldown</p>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" /> live
        </span>
      </div>

      {loading && !activity ? (
        <LoadingBlock label="Loading detected events…" rows={4} />
      ) : events.length === 0 ? (
        <p className="p-4 text-[11px] text-slate-600">
          No unusual activity detected yet. Detectors run every few seconds as market data arrives.
        </p>
      ) : (
        <ul className="max-h-[340px] divide-y divide-slate-800/50 overflow-y-auto scroll-thin">
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-2 px-3 py-2">
              <span className="w-20 shrink-0 pt-0.5 text-[11px] font-semibold text-slate-200">{event.symbol}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-300">{EVENT_LABELS[event.eventType] || event.eventType}</p>
                <p className="truncate text-[10px] text-slate-500" title={event.description}>
                  {event.description}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={cx(
                    'rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                    SEVERITY_STYLES[event.severity] || SEVERITY_STYLES.LOW
                  )}
                >
                  {event.severity}
                </span>
                <p className="mt-0.5 text-[9px] text-slate-600" title={fmtTime(event.detectedAt)}>
                  {fmtAgo(event.detectedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-slate-800/70 px-3 py-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Combined activity score
        </p>
        <div className="space-y-1">
          {scored.slice(0, 4).map((entry) => (
            <div key={entry.stockId} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[11px] text-slate-300">{entry.symbol}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500/60 to-orange-400/80 transition-all duration-700"
                  style={{ width: `${Math.min(100, entry.activityScore)}%` }}
                />
              </div>
              <span className="mono w-14 text-right text-[10px] text-slate-400">{entry.activityScore}</span>
              <span className={cx('w-16 text-right text-[10px]', CATEGORY_STYLES[entry.activityCategory])}>
                {entry.activityCategory}
              </span>
            </div>
          ))}
          {scored.length === 0 ? (
            <p className="text-[10px] text-slate-600">Activity scores appear once enough ticks are collected.</p>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] text-slate-600">
          Score blends relative volume, short-term movement and recent volatility. It is an internal indicator, not a
          financial metric.
        </p>
      </div>
    </section>
  );
}
