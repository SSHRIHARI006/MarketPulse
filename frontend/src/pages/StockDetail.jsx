import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { useMarket } from '../context/MarketContext';
import Delta from '../components/Delta';
import { ErrorBlock, LoadingBlock } from '../components/StateViews';
import { cx, fmtCrore, fmtPct, fmtPrice, fmtTime, fmtVolume, shortDate } from '../lib/format';

const INTERVALS = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '1d', label: '1 day' }
];

function Stat({ label, value, tone = 'text-slate-200' }) {
  return (
    <div className="rounded-lg border border-slate-800/70 bg-ink-850/60 px-3 py-2">
      <p className="stat-label">{label}</p>
      <p className={cx('mono mt-1 text-sm font-medium', tone)}>{value}</p>
    </div>
  );
}

function IndicatorCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-800/70 bg-ink-850/60 px-3 py-2">
      <div className="flex items-baseline justify-between">
        <p className="stat-label">{label}</p>
        <p className="mono text-sm font-semibold text-sky-300">{value === null || value === undefined ? '—' : fmtPrice(value)}</p>
      </div>
      <p className="mt-1 text-[10px] text-slate-600">{hint}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label, kind = 'price' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-ink-900 px-2.5 py-2 text-[11px] shadow-xl">
      <p className="mb-1 text-[10px] text-slate-500">{label}</p>
      {payload
        .filter((entry) => entry.value !== null && entry.value !== undefined)
        .map((entry) => (
          <p key={entry.dataKey} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-400">{entry.name}</span>
            <span className="mono ml-auto text-slate-200">
              {kind === 'volume' ? fmtVolume(entry.value) : fmtPrice(entry.value)}
            </span>
          </p>
        ))}
    </div>
  );
}

export default function StockDetail() {
  const { id } = useParams();
  const market = useMarket();
  const [interval, setInterval] = useState('5m');

  const stock = useApi(() => api.stock(id), [id], { pollMs: 20000 });
  const history = useApi(() => api.history(id, { interval, limit: interval === '1d' ? 260 : 240 }), [id, interval], {
    pollMs: 30000
  });

  if (stock.loading && !stock.data) {
    return (
      <div className="card">
        <LoadingBlock label="Loading stock analytics…" rows={5} />
      </div>
    );
  }

  if (stock.error) {
    return (
      <div className="space-y-3">
        <Link to="/" className="text-xs text-sky-400 hover:underline">
          ← Back to dashboard
        </Link>
        <ErrorBlock message={stock.error} onRetry={stock.reload} />
      </div>
    );
  }

  const data = stock.data;
  if (!data) return null;

  const quote = market.quotes[data.stock.id] || data.quote || {};
  const metrics = data.metrics || {};
  const indicators = data.indicators || {};

  const candles = history.data?.candles || [];
  const series = candles.map((candle) => ({
    ...candle,
    label: interval === '1d' ? shortDate(candle.time) : fmtTime(candle.time)
  }));
  const sma20 = history.data?.indicators?.sma20 || [];
  const sma50 = history.data?.indicators?.sma50 || [];
  const ema20 = history.data?.indicators?.ema20 || [];
  const rsi14 = history.data?.indicators?.rsi14 || [];

  const chartData = series.map((point, index) => ({
    ...point,
    sma20: sma20[index],
    sma50: sma50[index],
    ema20: ema20[index],
    rsi14: rsi14[index]
  }));

  const rsiLatest = [...rsi14].reverse().find((value) => value !== null && value !== undefined);
  const rsiLabel =
    rsiLatest === undefined ? 'insufficient history' : rsiLatest >= 70 ? 'overbought zone' : rsiLatest <= 30 ? 'oversold zone' : 'neutral zone';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/" className="text-[11px] text-sky-400 hover:underline">
            ← Back to dashboard
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-white">{data.stock.companyName}</h1>
          <p className="text-xs text-slate-500">
            {data.stock.symbol} · {data.stock.sector} · {data.stock.exchange} ·{' '}
            <span className="mono">{data.stock.instrumentKey}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="mono text-2xl font-semibold text-white">₹{fmtPrice(quote.price)}</p>
          <div className="flex items-center justify-end gap-2">
            <Delta value={quote.changePct} className="text-sm" />
            <span className="text-[10px] text-slate-500">
              {quote.updatedAt ? `updated ${fmtTime(quote.updatedAt)} IST` : 'awaiting live tick'}
            </span>
          </div>
          {quote.stale ? <p className="text-[10px] text-amber-500">stale — no recent update</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Previous close" value={`₹${fmtPrice(quote.previousClose)}`} />
        <Stat label="Open" value={`₹${fmtPrice(quote.open)}`} />
        <Stat label="Day high" value={`₹${fmtPrice(quote.high)}`} />
        <Stat label="Day low" value={`₹${fmtPrice(quote.low)}`} />
        <Stat label="Volume" value={fmtVolume(quote.volume)} />
        <Stat label="Market cap" value={fmtCrore(data.stock.marketCap)} />
        <Stat
          label="52W high"
          value={`₹${fmtPrice(metrics.high52w)}`}
          tone="text-emerald-300"
        />
        <Stat label="52W low" value={`₹${fmtPrice(metrics.low52w)}`} tone="text-rose-300" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <IndicatorCard label="SMA 20" value={indicators.sma20} hint="20-session simple average (daily closes)" />
        <IndicatorCard label="SMA 50" value={indicators.sma50} hint="50-session simple average" />
        <IndicatorCard label="EMA 20" value={indicators.ema20} hint="20-session exponential average" />
        <IndicatorCard label="RSI 14" value={indicators.rsi14} hint={`Wilder's RSI · ${rsiLabel}`} />
      </div>

      <section className="card">
        <div className="card-header flex-wrap">
          <div>
            <h2 className="card-title">Price chart</h2>
            <p className="text-[10px] text-slate-600">
              Close with SMA20, SMA50 and EMA20 overlays · {series.length} candles
            </p>
          </div>
          <div className="flex gap-1.5">
            {INTERVALS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setInterval(option.value)}
                className={cx(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition',
                  interval === option.value ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {history.error ? (
          <div className="p-4">
            <ErrorBlock message={history.error} onRetry={history.reload} />
          </div>
        ) : history.loading && !history.data ? (
          <LoadingBlock label="Loading candles…" rows={4} />
        ) : series.length === 0 ? (
          <p className="p-4 text-[11px] text-slate-600">
            No candles stored for this interval yet. History is collected as data arrives.
          </p>
        ) : (
          <div className="h-[320px] px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={58}
                  tickFormatter={(value) => fmtPrice(value, 0)}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="close" name="Close" stroke="#38bdf8" dot={false} strokeWidth={1.8} />
                <Line type="monotone" dataKey="sma20" name="SMA 20" stroke="#f59e0b" dot={false} strokeWidth={1.1} />
                <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#a78bfa" dot={false} strokeWidth={1.1} />
                <Line type="monotone" dataKey="ema20" name="EMA 20" stroke="#34d399" dot={false} strokeWidth={1.1} strokeDasharray="4 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="card-header">
            <div>
              <h2 className="card-title">Volume</h2>
              <p className="text-[10px] text-slate-600">
                Highest: {fmtVolume(history.data?.volumeStats?.highest)} · Average:{' '}
                {fmtVolume(history.data?.volumeStats?.average)}
              </p>
            </div>
          </div>
          <div className="h-[190px] px-2 py-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={50} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(value) => fmtVolume(value)}
                />
                <Tooltip content={<ChartTooltip kind="volume" />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
                <Bar dataKey="volume" name="Volume" fill="#0ea5e9" opacity={0.7} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">RSI 14</h2>
              <p className="text-[10px] text-slate-600">30 / 70 reference levels</p>
            </div>
            <span className="mono text-xs text-sky-300">{fmtPrice(indicators.rsi14, 1)}</span>
          </div>
          <div className="h-[190px] px-2 py-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={60} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={70} stroke="#f87171" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={30} stroke="#4ade80" strokeDasharray="3 3" strokeOpacity={0.5} />
                <Line type="monotone" dataKey="rsi14" name="RSI 14" stroke="#c084fc" dot={false} strokeWidth={1.4} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-slate-800/70 px-3 py-2 text-[10px] text-slate-600">
            RSI is computed from daily closes for the headline value; the chart uses the selected interval.
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="5-session return" value={fmtPct(metrics.return5)} />
        <Stat label="20-session return" value={fmtPct(metrics.return20)} />
        <Stat label="Momentum score" value={metrics.momentumScore ?? '—'} />
        <Stat label="Volatility (annualised)" value={metrics.volatilityPct === null ? '—' : `${metrics.volatilityPct}%`} />
        <Stat label="Relative volume" value={metrics.relativeVolume === null ? '—' : `${metrics.relativeVolume}×`} />
        <Stat label="Activity score" value={metrics.activityScore === null ? '—' : `${metrics.activityScore} (${metrics.activityCategory})`} />
      </div>
    </div>
  );
}
