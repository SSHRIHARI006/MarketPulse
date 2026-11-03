import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cx, fmtPct } from '../lib/format';
import { LoadingBlock } from './StateViews';

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const sector = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-ink-900 px-2.5 py-2 text-[11px] shadow-xl">
      <p className="font-semibold text-slate-100">{sector.sector}</p>
      <p className="mono text-slate-300">{fmtPct(sector.averageChangePct)}</p>
      <p className="text-[10px] text-slate-500">
        {sector.advancing} advancing · {sector.declining} declining · {sector.stocks} stocks
      </p>
    </div>
  );
}

export default function SectorPerformance({ data, loading, onSelectSector, activeSector }) {
  if (loading && !data) {
    return (
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Sector performance</h2>
        </div>
        <LoadingBlock label="Aggregating sectors…" rows={3} />
      </section>
    );
  }

  const sectors = data?.sectors || [];
  const chartData = sectors.map((sector) => ({ ...sector, name: sector.sector }));

  return (
    <section className="card flex flex-col" aria-label="Sector performance">
      <div className="card-header">
        <div>
          <h2 className="card-title">Sector performance</h2>
          <p className="text-[10px] text-slate-600">Equal-weighted average daily change per tracked sector</p>
        </div>
        {data?.best ? (
          <span className="text-[10px] text-emerald-400">
            Best: {data.best.sector} {fmtPct(data.best.averageChangePct)}
          </span>
        ) : null}
      </div>

      <div className="h-[190px] px-1 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 2, right: 16, bottom: 2, left: 4 }}>
            <XAxis
              type="number"
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={92}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => (value.length > 14 ? `${value.slice(0, 13)}…` : value)}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
            <Bar dataKey="averageChangePct" radius={[0, 3, 3, 0]} onClick={(entry) => onSelectSector?.(entry.sector)}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.sector}
                  cursor="pointer"
                  fill={entry.averageChangePct >= 0 ? '#1fbf75' : '#d92d43'}
                  opacity={activeSector && activeSector !== 'all' && activeSector !== entry.sector ? 0.35 : 0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="border-t border-slate-800/70">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.1em] text-slate-600">
              <th className="px-3 py-1.5 font-medium">Sector</th>
              <th className="px-2 py-1.5 text-right font-medium">Avg</th>
              <th className="px-2 py-1.5 text-right font-medium">Adv</th>
              <th className="px-2 py-1.5 text-right font-medium">Dec</th>
              <th className="px-3 py-1.5 text-right font-medium">Volatility</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((sector) => (
              <tr
                key={sector.sector}
                className={cx(
                  'cursor-pointer border-t border-slate-800/40 transition hover:bg-slate-800/30',
                  activeSector === sector.sector && 'bg-slate-800/40'
                )}
                onClick={() => onSelectSector?.(sector.sector)}
                title={`Show ${sector.sector} on the heatmap`}
              >
                <td className="px-3 py-1.5 text-slate-300">{sector.sector}</td>
                <td
                  className={cx(
                    'mono px-2 py-1.5 text-right',
                    (sector.averageChangePct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}
                >
                  {fmtPct(sector.averageChangePct)}
                </td>
                <td className="mono px-2 py-1.5 text-right text-slate-400">{sector.advancing}</td>
                <td className="mono px-2 py-1.5 text-right text-slate-400">{sector.declining}</td>
                <td className="mono px-3 py-1.5 text-right text-slate-400">
                  {sector.averageVolatilityPct === null ? '—' : `${sector.averageVolatilityPct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[10px] text-slate-600">Click a sector to filter the heatmap.</p>
    </section>
  );
}
