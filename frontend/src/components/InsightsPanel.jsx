import { cx } from '../lib/format';
import { LoadingBlock } from './StateViews';

const TONE = {
  positive: 'border-l-emerald-500/70 text-emerald-100/90',
  negative: 'border-l-rose-500/70 text-rose-100/90',
  warning: 'border-l-amber-500/70 text-amber-100/90',
  neutral: 'border-l-slate-500/70 text-slate-200'
};

export default function InsightsPanel({ data, loading }) {
  return (
    <section className="card" aria-label="Market insights">
      <div className="card-header">
        <div>
          <h2 className="card-title">Market insights</h2>
          <p className="text-[10px] text-slate-600">Rule-based observations from current analytical data</p>
        </div>
      </div>
      {loading && !data ? (
        <LoadingBlock label="Generating insights…" rows={3} />
      ) : !data?.insights?.length ? (
        <p className="p-4 text-[11px] text-slate-600">
          Insights appear once enough quotes and history have been collected.
        </p>
      ) : (
        <ul className="space-y-1.5 p-3">
          {data.insights.map((insight) => (
            <li
              key={insight.type}
              className={cx('rounded-r-md border-l-2 bg-slate-800/30 px-3 py-2 text-[11px]', TONE[insight.tone] || TONE.neutral)}
            >
              {insight.message}
              {insight.stocks?.length ? (
                <span className="mt-0.5 block text-[10px] text-slate-500">{insight.stocks.join(', ')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
