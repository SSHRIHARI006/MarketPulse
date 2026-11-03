import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { useMarket } from '../context/MarketContext';
import { cx, fmtPrice, fmtTime } from '../lib/format';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'error', label: 'Errors' }
];

const STATUS_TONE = {
  ACTIVE: 'text-emerald-300',
  COMPLETED: 'text-sky-300',
  REPLAY_PENDING: 'text-slate-400',
  UNAVAILABLE: 'text-slate-500',
  REJECTED: 'text-amber-300',
  ERROR: 'text-rose-300'
};

function matchesFilter(instrument, filter) {
  switch (filter) {
    case 'available':
      return instrument.dataAvailability === 'AVAILABLE';
    case 'unavailable':
      return instrument.dataAvailability === 'UNAVAILABLE';
    case 'pending':
      return instrument.status === 'REPLAY_PENDING';
    case 'active':
      return instrument.status === 'ACTIVE';
    case 'completed':
      return instrument.status === 'COMPLETED';
    case 'rejected':
      return instrument.rejectedEvents > 0 || instrument.status === 'REJECTED';
    case 'error':
      return instrument.status === 'ERROR';
    default:
      return true;
  }
}

function Figure({ label, value, tone = 'text-slate-200', hint }) {
  return (
    <div>
      <p className="stat-label">{label}</p>
      <p className={cx('mono text-xs', tone)}>{value}</p>
      {hint ? <p className="text-[10px] text-slate-600">{hint}</p> : null}
    </div>
  );
}

/**
 * Developer diagnostics.
 *
 * The point of this page is to make it obvious *where* an event would be lost:
 * dataset → scheduled → emitted → accepted → stored → broadcast → received.
 */
export default function Diagnostics() {
  const market = useMarket();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  const { data, error, loading } = useApi(() => api.replayDiagnostics(), [], { pollMs: 3000 });
  const feed = useApi(() => api.diagnostics(), [], { pollMs: 5000 });

  const instruments = useMemo(() => {
    const list = data?.instruments || [];
    const needle = query.trim().toUpperCase();
    return list.filter(
      (instrument) =>
        matchesFilter(instrument, filter) &&
        (!needle || instrument.symbol.includes(needle) || String(instrument.stockId) === needle)
    );
  }, [data, filter, query]);

  const replay = data?.replay || market.replay || {};
  const dataset = data?.dataset;
  const processing = data?.processing;
  const progress = replay.progress || { processedEvents: 0, totalEvents: 0, percentage: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-base font-semibold text-white">Pipeline diagnostics</h1>
          <p className="text-[11px] text-slate-500">
            Where each historical observation is after it enters the backend. Counters update live.
          </p>
        </div>
        <span className="ml-auto rounded-full border border-slate-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">
          mode: {market.mode}
        </span>
      </div>

      {error ? <p className="card p-4 text-xs text-rose-300">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="card-title">Replay</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Figure label="State" value={replay.state || '—'} />
            <Figure label="Speed" value={replay.speed ? `${replay.speed}×` : '—'} />
            <Figure label="Session" value={replay.sessionId || '—'} />
            <Figure label="Trading date" value={replay.tradingDate || '—'} />
            <Figure label="Simulated time" value={replay.clock ? fmtTime(replay.clock) : '—'} />
            <Figure label="Progress" value={`${progress.percentage.toFixed(2)}%`} />
            <Figure
              label="Processed"
              value={`${progress.processedEvents.toLocaleString('en-IN')} / ${progress.totalEvents.toLocaleString('en-IN')}`}
            />
            <Figure label="Granularity" value={replay.granularity || '—'} />
          </div>
          {replay.error ? <p className="mt-3 text-[11px] text-rose-300">{replay.error}</p> : null}
        </section>

        <section className="card p-4">
          <h2 className="card-title">Dataset</h2>
          {dataset ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Figure label="Configured" value={dataset.configuredInstruments} />
              <Figure label="Available" value={dataset.availableInstruments} />
              <Figure
                label="Unavailable"
                value={dataset.unavailableInstruments}
                hint={dataset.unavailableSymbols?.join(', ') || undefined}
              />
              <Figure label="Records loaded" value={dataset.recordsLoaded.toLocaleString('en-IN')} />
              <Figure label="Accepted" value={dataset.acceptedEvents.toLocaleString('en-IN')} />
              <Figure
                label="Invalid records"
                value={dataset.invalidRecords.toLocaleString('en-IN')}
                tone={dataset.invalidRecords ? 'text-amber-300' : 'text-slate-200'}
              />
              <Figure
                label="Outside session"
                value={dataset.outsideSessionRecords}
                hint="excluded: stored outside 09:15–15:30 IST"
              />
              <Figure label="Truncated" value={dataset.truncatedRecords} />
              <Figure label="Source" value={dataset.source} />
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">No replay dataset is loaded.</p>
          )}
          {dataset?.rejectionSamples?.length ? (
            <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">Invalid record samples</p>
              <ul className="mt-1 space-y-0.5 text-[10px] text-amber-200/80">
                {dataset.rejectionSamples.slice(0, 5).map((sample) => (
                  <li key={`${sample.stockId}-${sample.candleStart}-${sample.reason}`}>
                    stock {sample.stockId} · {sample.candleStart} · {sample.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="card p-4">
          <h2 className="card-title">Pipeline stages</h2>
          <div className="mt-3 space-y-1.5 text-[11px]">
            {[
              ['Events scheduled', processing?.eventsScheduled],
              ['Events emitted', processing?.eventsEmitted],
              ['Events accepted', processing?.eventsAccepted],
              ['Events rejected', processing?.eventsRejected],
              ['Market-store updates', processing?.marketStoreUpdates],
              ['Candle updates', processing?.candleUpdates],
              ['Broadcast batches', data?.broadcast?.batchesEmitted],
              ['Quotes broadcast', data?.broadcast?.quotesEmitted],
              ['Socket clients', data?.broadcast?.socketClients],
              ['Clients reporting receipt', data?.frontend?.clientsReporting]
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <span className="text-slate-500">{label}</span>
                <span className="mono text-slate-200">{(value ?? 0).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
          {feed.data ? (
            <div className="mt-3 border-t border-slate-800/70 pt-2 text-[10px] text-slate-500">
              {/* In REPLAY there is no provider connection; report the store, not a feed. */}
              {feed.data.mode === 'replay' ? 'Store' : `Feed ${feed.data.connection}`}:{' '}
              {feed.data.acceptedTicks?.toLocaleString('en-IN') ?? 0} ticks accepted ·{' '}
              {feed.data.rejectedTicks?.toLocaleString('en-IN') ?? 0} rejected
            </div>
          ) : null}
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Instruments ({instruments.length})</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              className="select w-32"
              placeholder="Filter symbol"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Filter by symbol"
            />
            <select className="select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter instruments">
              {FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="max-h-[520px] overflow-auto scroll-thin">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-ink-900/95 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Symbol</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 text-right font-medium">Available</th>
                <th className="px-3 py-2 text-right font-medium">Processed</th>
                <th className="px-3 py-2 text-right font-medium">Rejected</th>
                <th className="px-3 py-2 text-right font-medium">Last price</th>
                <th className="px-3 py-2 font-medium">Last processed (historical)</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((instrument) => (
                <tr
                  key={instrument.stockId}
                  className={cx(
                    'cursor-pointer border-t border-slate-800/60 hover:bg-slate-800/30',
                    selected === instrument.stockId && 'bg-slate-800/40'
                  )}
                  onClick={() => setSelected(selected === instrument.stockId ? null : instrument.stockId)}
                >
                  <td className="px-3 py-1.5 font-semibold text-slate-200">{instrument.symbol}</td>
                  <td className="px-3 py-1.5 text-slate-400">{instrument.dataAvailability === 'AVAILABLE' ? 'Yes' : 'No'}</td>
                  <td className="mono px-3 py-1.5 text-right text-slate-300">{instrument.eventsAvailable.toLocaleString('en-IN')}</td>
                  <td className="mono px-3 py-1.5 text-right text-slate-300">{instrument.eventsProcessed.toLocaleString('en-IN')}</td>
                  <td
                    className={cx(
                      'mono px-3 py-1.5 text-right',
                      instrument.rejectedEvents ? 'text-amber-300' : 'text-slate-500'
                    )}
                  >
                    {instrument.rejectedEvents}
                  </td>
                  <td className="mono px-3 py-1.5 text-right text-slate-300">
                    {instrument.lastPrice === null ? '—' : `₹${fmtPrice(instrument.lastPrice)}`}
                  </td>
                  <td className="mono px-3 py-1.5 text-slate-400">
                    {instrument.lastProcessedHistoricalTime ? fmtTime(instrument.lastProcessedHistoricalTime) : '—'}
                  </td>
                  <td className={cx('px-3 py-1.5 font-medium', STATUS_TONE[instrument.status] || 'text-slate-300')}>
                    {instrument.status}
                    {instrument.lastRejectionReason ? (
                      <span className="ml-1 text-[10px] text-slate-500">({instrument.lastRejectionReason})</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!instruments.length && !loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No instruments match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
