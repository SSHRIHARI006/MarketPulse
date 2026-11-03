import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx, fmtPct, fmtPrice, fmtVolume } from '../lib/format';
import { LoadingBlock } from './StateViews';

const TABS = [
  { key: 'momentum', label: 'Momentum' },
  { key: 'relativeVolume', label: 'Rel. volume' },
  { key: 'volatility', label: 'Volatility' },
  { key: 'riskAdjusted', label: 'Risk-adj.' },
  { key: 'near52WeekHigh', label: 'Near 52W high' },
  { key: 'near52WeekLow', label: 'Near 52W low' }
];

function CellValue({ metric, row }) {
  switch (metric) {
    case 'momentum':
      return `${row.momentumScore}`;
    case 'relativeVolume':
      return `${row.relativeVolume}×`;
    case 'volatility':
      return row.volatilityPct === undefined ? `${row.intradayVolatilityPct}%` : `${row.volatilityPct}%`;
    case 'riskAdjusted':
      return `${row.riskAdjustedScore}`;
    case 'near52WeekHigh':
      return fmtPct(row.fromHigh52wPct);
    case 'near52WeekLow':
      return fmtPct(row.fromLow52wPct);
    default:
      return '';
  }
}

export default function RankingsPanel({ intelligence, loading }) {
  const [tab, setTab] = useState('momentum');
  const navigate = useNavigate();

  if (loading && !intelligence) {
    return (
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Stock intelligence rankings</h2>
        </div>
        <LoadingBlock label="Ranking tracked stocks…" rows={5} />
      </section>
    );
  }

  let rows = [];
  if (tab === 'volatility') rows = intelligence?.volatility?.highest || [];
  else rows = (intelligence?.[tab] || []).slice(0, 8);

  const metricFor = tab;
  const unitFor = {
    momentum: 'score',
    relativeVolume: 'of avg volume',
    volatility: 'annualised',
    riskAdjusted: 'return/vol',
    near52WeekHigh: 'from high',
    near52WeekLow: 'from low'
  }[tab];

  return (
    <section className="card flex flex-col" aria-label="Stock intelligence rankings">
      <div className="card-header flex-wrap">
        <div>
          <h2 className="card-title">Stock intelligence</h2>
          <p className="text-[10px] text-slate-600">Rankings cover the tracked universe only</p>
        </div>
        <span className="text-[10px] text-slate-600">{unitFor}</span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-800/70 px-2 py-1.5 scroll-thin">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={cx(
              'whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium transition',
              tab === option.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin" style={{ maxHeight: 320 }}>
        {rows.length === 0 ? (
          <p className="p-4 text-[11px] text-slate-600">
            Not enough history collected for this ranking yet.
          </p>
        ) : (
          <table className="w-full text-left text-[11px]">
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${tab}-${row.stockId}`}
                  className="cursor-pointer border-b border-slate-800/40 hover:bg-slate-800/30"
                  onClick={() => navigate(`/stock/${row.stockId}`)}
                >
                  <td className="w-6 py-1.5 pl-3 text-slate-600">{index + 1}</td>
                  <td className="py-1.5">
                    <p className="font-semibold text-slate-200">{row.symbol}</p>
                    <p className="text-[10px] text-slate-600">{row.companyName}</p>
                  </td>
                  <td className="py-1.5 text-right text-slate-400">
                    {row.price !== undefined ? `₹${fmtPrice(row.price)}` : ''}
                    {row.volume !== undefined ? <span className="block text-[10px] text-slate-600">{fmtVolume(row.volume)}</span> : null}
                  </td>
                  <td className="w-20 py-1.5 pr-3 text-right">
                    <span
                      className={cx(
                        'mono font-semibold',
                        tab === 'near52WeekLow' || tab === 'near52WeekHigh' ? 'text-slate-200' : 'text-sky-300'
                      )}
                    >
                      <CellValue metric={metricFor} row={row} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-slate-800/70 px-3 py-2 text-[10px] text-slate-600">
        Momentum blends 5- and 20-session returns. Risk-adjusted score is a simplified return/volatility ratio, not a
        formal Sharpe ratio.
      </div>
    </section>
  );
}
