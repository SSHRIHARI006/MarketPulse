import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { ErrorBlock, LoadingBlock } from '../components/StateViews';
import { cx, fmtPct, fmtPrice, shortDate } from '../lib/format';

const COLORS = ['#38bdf8', '#f59e0b', '#a78bfa'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-ink-900 px-2.5 py-2 text-[11px] shadow-xl">
      <p className="mb-1 text-[10px] text-slate-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}</span>
          <span className="mono ml-auto text-slate-200">{fmtPrice(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function Compare() {
  const stocks = useApi(() => api.stocks(), []);
  const [selected, setSelected] = useState([]);

  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (initialised || !stocks.data?.length) return;
    setSelected(stocks.data.slice(0, 3).map((stock) => stock.id));
    setInitialised(true);
  }, [stocks.data, initialised]);

  const comparison = useApi(() => api.compare(selected, 60), [selected.join(',')], {
    enabled: selected.length >= 2,
    pollMs: 30000
  });

  const toggle = (id) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  const chartData = useMemo(() => {
    const series = comparison.data?.series || [];
    if (!series.length) return [];
    const points = series[0].points.length;
    const rows = [];
    for (let index = 0; index < points; index += 1) {
      const row = { label: shortDate(series[0].points[index]?.time) };
      for (const entry of series) {
        row[`s${entry.stockId}`] = entry.points[index]?.normalised ?? null;
      }
      rows.push(row);
    }
    return rows;
  }, [comparison.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Stock comparison</h1>
        <p className="text-[11px] text-slate-500">
          Select two or three tracked stocks. Prices are normalised to 100 at the start of the window for comparability.
        </p>
      </div>

      {stocks.error ? <ErrorBlock message={stocks.error} onRetry={stocks.reload} /> : null}

      <section className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="card-title">Select stocks ({selected.length}/3)</h2>
          <button
            type="button"
            className="text-[11px] text-slate-500 hover:text-slate-300"
            onClick={() => setSelected([])}
          >
            Clear
          </button>
        </div>
        {stocks.loading && !stocks.data ? (
          <LoadingBlock rows={2} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(stocks.data || []).map((stock) => {
              const active = selected.includes(stock.id);
              return (
                <button
                  key={stock.id}
                  type="button"
                  onClick={() => toggle(stock.id)}
                  className={cx(
                    'rounded-full border px-2.5 py-1 text-[11px] transition',
                    active
                      ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  )}
                >
                  {stock.symbol}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-600">
          Tips: selecting a fourth stock is ignored until you deselect one.
        </p>
      </section>

      {selected.length < 2 ? (
        <div className="card p-4 text-xs text-slate-500">Select at least two stocks to compare.</div>
      ) : comparison.error ? (
        <ErrorBlock message={comparison.error} onRetry={comparison.reload} />
      ) : comparison.loading && !comparison.data ? (
        <div className="card">
          <LoadingBlock label="Building comparison…" rows={4} />
        </div>
      ) : (
        <>
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Normalised price movement</h2>
                <p className="text-[10px] text-slate-600">Last 60 sessions · base 100</p>
              </div>
            </div>
            <div className="h-[320px] px-2 py-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 14, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={40} />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  {(comparison.data?.series || []).map((entry, index) => (
                    <Line
                      key={entry.stockId}
                      type="monotone"
                      dataKey={`s${entry.stockId}`}
                      name={entry.symbol}
                      stroke={COLORS[index % COLORS.length]}
                      dot={false}
                      strokeWidth={1.7}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card overflow-x-auto">
            <div className="card-header">
              <h2 className="card-title">Comparison metrics</h2>
            </div>
            <table className="w-full min-w-[640px] text-left text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-[0.1em] text-slate-600">
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-2 py-2 text-right font-medium">Window return</th>
                  <th className="px-2 py-2 text-right font-medium">5-session</th>
                  <th className="px-2 py-2 text-right font-medium">20-session</th>
                  <th className="px-2 py-2 text-right font-medium">Volatility</th>
                  <th className="px-2 py-2 text-right font-medium">Rel. volume</th>
                  <th className="px-3 py-2 text-right font-medium">Momentum</th>
                </tr>
              </thead>
              <tbody>
                {(comparison.data?.series || []).map((entry) => (
                  <tr key={entry.stockId} className="border-t border-slate-800/50">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-200">{entry.symbol}</p>
                      <p className="text-[10px] text-slate-600">{entry.companyName}</p>
                    </td>
                    <td
                      className={cx(
                        'mono px-2 py-2 text-right',
                        (entry.stats.totalReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}
                    >
                      {fmtPct(entry.stats.totalReturnPct)}
                    </td>
                    <td className="mono px-2 py-2 text-right text-slate-300">{fmtPct(entry.stats.return5)}</td>
                    <td className="mono px-2 py-2 text-right text-slate-300">{fmtPct(entry.stats.return20)}</td>
                    <td className="mono px-2 py-2 text-right text-slate-300">
                      {entry.stats.volatilityPct === null ? '—' : `${entry.stats.volatilityPct}%`}
                    </td>
                    <td className="mono px-2 py-2 text-right text-slate-300">
                      {entry.stats.relativeVolume === null ? '—' : `${entry.stats.relativeVolume}×`}
                    </td>
                    <td className="mono px-3 py-2 text-right text-sky-300">{entry.stats.momentumScore ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="text-[10px] text-slate-600">
            Returns and volatility use stored daily candles. Relative volume and momentum depend on the collected
            history window and cover only the tracked universe.
          </p>
        </>
      )}
    </div>
  );
}
