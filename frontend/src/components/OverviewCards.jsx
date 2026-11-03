import { useMarket } from '../context/MarketContext';
import { cx, fmtPrice, fmtTime } from '../lib/format';
import Delta from './Delta';
import { LoadingBlock } from './StateViews';

function CardShell({ label, children, hint, span = '' }) {
  return (
    <div className={cx('card px-4 py-3', span)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="stat-label">{label}</span>
        {hint ? <span className="text-[10px] text-slate-600">{hint}</span> : null}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function IndexCard({ index }) {
  const market = useMarket();
  const live = market.indices.find((entry) => entry.symbol === index.symbol) || index;
  return (
    <CardShell label={index.symbol} hint={live?.note}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="mono text-xl font-semibold text-white">
          {live?.price === null || live?.price === undefined ? '—' : fmtPrice(live.price)}
        </span>
        <Delta value={live?.changePct} />
      </div>
      <p className="mt-1 text-[10px] text-slate-600">
        {live?.updatedAt ? `Updated ${fmtTime(live.updatedAt)} IST` : 'Awaiting index data'}
      </p>
    </CardShell>
  );
}

export default function OverviewCards({ overview, loading, error }) {
  if (loading && !overview) {
    return (
      <div className="card">
        <LoadingBlock label="Loading market overview…" rows={2} />
      </div>
    );
  }

  if (error && !overview) {
    return <div className="card px-4 py-3 text-xs text-rose-300">{error}</div>;
  }

  const breadth = overview?.breadth || { advancing: null, declining: null, tracked: 0 };
  const total = (breadth.advancing || 0) + (breadth.declining || 0);
  const advanceRatio = total ? (breadth.advancing / total) * 100 : 0;

  return (
    <section aria-label="Market overview">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {(overview?.indices || [{ symbol: 'NIFTY 50' }, { symbol: 'SENSEX' }]).map((index) => (
          <IndexCard key={index.symbol} index={index} />
        ))}

        <CardShell label="Advancing" hint="tracked">
          <span className="mono text-xl font-semibold text-emerald-400">{breadth.advancing ?? '—'}</span>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${advanceRatio}%` }} />
          </div>
        </CardShell>

        <CardShell label="Declining" hint="tracked">
          <span className="mono text-xl font-semibold text-rose-400">{breadth.declining ?? '—'}</span>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-rose-500/70" style={{ width: `${100 - advanceRatio}%` }} />
          </div>
        </CardShell>

        <CardShell label="Avg change" hint={`${breadth.tracked} stocks`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Delta value={overview?.averageChangePct} className="text-xl" />
          </div>
          <p className="mt-1 text-[10px] text-slate-600">Equally weighted across the tracked universe</p>
        </CardShell>

        <CardShell label="Market volatility" hint="annualised">
          <span className="mono text-xl font-semibold text-slate-200">
            {overview?.volatilityPct === null || overview?.volatilityPct === undefined
              ? '—'
              : `${fmtPrice(overview.volatilityPct, 1)}%`}
          </span>
          <p className="mt-1 text-[10px] text-slate-600">
            Mean of tracked stocks' 20-session realised volatility
          </p>
        </CardShell>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">
        Indices and breadth are labelled metrics of the tracked universe unless a broader dataset is configured.
      </p>
    </section>
  );
}
