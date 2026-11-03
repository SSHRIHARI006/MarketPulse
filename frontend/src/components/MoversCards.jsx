import { Link } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';
import { fmtPct, fmtPrice, fmtVolume } from '../lib/format';
import Delta from './Delta';
import { LoadingBlock } from './StateViews';

function MoverCard({ title, accent, metricLabel, metricValue, stock, metricTone = 'text-slate-200' }) {
  return (
    <div className="card flex flex-col p-3">
      <div className="flex items-center justify-between">
        <span className="stat-label">{title}</span>
        <span className={`mono text-[11px] font-semibold ${metricTone}`}>{metricValue}</span>
      </div>
      {stock ? (
        <>
          <Link
            to={`/stock/${stock.stockId}`}
            className="mt-2 truncate text-sm font-semibold text-white hover:text-sky-300"
            title={stock.companyName}
          >
            {stock.symbol}
          </Link>
          <p className="truncate text-[11px] text-slate-500">{stock.companyName}</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="mono text-sm text-slate-200">₹{fmtPrice(stock.price)}</span>
            <Delta value={stock.changePct} className="text-xs" />
          </div>
          <p className="mt-1 text-[10px] text-slate-600">
            {metricLabel}: {stock.metric}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[11px] text-slate-600">No qualifying stock yet.</p>
      )}
    </div>
  );
}

export default function MoversCards({ movers, loading }) {
  const market = useMarket();

  if (loading && !movers) {
    return (
      <div className="card">
        <LoadingBlock label="Computing market leaders…" rows={2} />
      </div>
    );
  }

  const decorate = (stock) => {
    if (!stock) return null;
    const live = market.quotes[stock.stockId];
    return {
      ...stock,
      price: live?.price ?? stock.price,
      changePct: live?.changePct ?? stock.changePct
    };
  };

  const top = decorate(movers?.topPerformer);
  const bottom = decorate(movers?.biggestDecliner);
  const relativeVolume = movers?.highestRelativeVolume;
  const volatile = movers?.mostVolatile;

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Market leaders and laggards">
      <MoverCard
        title="Top performer"
        metricValue={top ? fmtPct(top.changePct) : '—'}
        metricTone="text-emerald-400"
        metricLabel="Volume"
        stock={top ? { ...top, metric: fmtVolume(top.volume) } : null}
      />
      <MoverCard
        title="Biggest decliner"
        metricValue={bottom ? fmtPct(bottom.changePct) : '—'}
        metricTone="text-rose-400"
        metricLabel="Volume"
        stock={bottom ? { ...bottom, metric: fmtVolume(bottom.volume) } : null}
      />
      <MoverCard
        title="Highest relative volume"
        metricValue={relativeVolume ? `${relativeVolume.relativeVolume}×` : '—'}
        metricLabel="Volume"
        stock={relativeVolume ? { ...relativeVolume, metric: fmtVolume(relativeVolume.volume) } : null}
      />
      <MoverCard
        title="Most volatile (intraday)"
        metricValue={volatile ? `${volatile.intradayVolatilityPct}%` : '—'}
        metricLabel="1-min return std-dev"
        stock={volatile ? { ...volatile, metric: `${volatile.intradayVolatilityPct}%` } : null}
      />
      <p className="col-span-full -mt-1 text-[10px] text-slate-600">
        Relative volume compares the current session's traded quantity with the expected share of the 20-session average
        volume. Volatility uses the standard deviation of 1-minute returns.
      </p>
    </section>
  );
}
