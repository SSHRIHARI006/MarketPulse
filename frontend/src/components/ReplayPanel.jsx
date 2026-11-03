import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMarket } from '../context/MarketContext';
import { cx, fmtTime } from '../lib/format';

const STATE_TONE = {
  IDLE: 'border-slate-700 text-slate-300',
  LOADING: 'border-sky-700 text-sky-300',
  READY: 'border-sky-700 text-sky-300',
  PLAYING: 'border-emerald-600 text-emerald-300',
  PAUSED: 'border-amber-600 text-amber-300',
  COMPLETED: 'border-violet-600 text-violet-300',
  ERROR: 'border-rose-600 text-rose-300'
};

const STATE_LABEL = {
  IDLE: 'Idle',
  LOADING: 'Loading',
  READY: 'Ready',
  PLAYING: 'Playing',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ERROR: 'Error'
};

function tradingDateLabel(value) {
  if (!value) return 'No session';
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Replay controls and disclosure.
 *
 * Everything shown here is reported by the backend replay engine; the browser never
 * runs its own scheduler. The indicator is deliberately explicit: replayed data is
 * historical, never a live exchange feed.
 */
export default function ReplayPanel() {
  const market = useMarket();
  const replay = market.replay || {};
  const actions = market.replayActions;

  const [sessions, setSessions] = useState([]);
  const [sessionError, setSessionError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [commandError, setCommandError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .replaySessions()
      .then((payload) => {
        if (!cancelled) setSessions(payload.sessions || []);
      })
      .catch((error) => {
        if (!cancelled) setSessionError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const state = replay.state || 'IDLE';
  const speeds = replay.allowedSpeeds || [1, 2, 5, 10];
  const progress = replay.progress || { processedEvents: 0, totalEvents: 0, percentage: 0 };
  const coverage = replay.coverage;

  const run = async (name, command) => {
    setBusy(name);
    setCommandError(null);
    try {
      await command();
    } catch (error) {
      setCommandError(error.message);
    } finally {
      setBusy(null);
    }
  };

  const canPlay = ['READY', 'PAUSED'].includes(state);
  const canPause = state === 'PLAYING';
  const canReset = ['PLAYING', 'PAUSED', 'COMPLETED', 'READY'].includes(state);

  return (
    <section className="card overflow-hidden" aria-label="Historical data replay controls">
      <div className="flex flex-wrap items-start gap-3 border-b border-slate-800/70 px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/50 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Simulated live
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Historical data replay
            </span>
            <span
              className={cx(
                'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]',
                STATE_TONE[state] || STATE_TONE.IDLE
              )}
            >
              {STATE_LABEL[state] || state}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Not a live market feed. This is {replay.datasetSource === 'demo' ? 'synthetic DEMO history' : 'historical data'}
            replayed at {replay.granularity === 'ONE_MINUTE_CANDLE' ? 'ONE_MINUTE_CANDLE' : 'the reported source granularity'};
            timestamps remain the original historical ones.
          </p>
        </div>

        <div className="ml-auto grid grid-cols-2 gap-x-5 gap-y-1 text-right sm:grid-cols-4">
          <div>
            <p className="stat-label">Trading date</p>
            <p className="mono text-xs text-slate-200">{tradingDateLabel(replay.tradingDate)}</p>
          </div>
          <div>
            <p className="stat-label">Simulated time</p>
            <p className="mono text-xs text-slate-200">
              {replay.clock ? `${fmtTime(replay.clock)} IST` : '—'}
            </p>
          </div>
          <div>
            <p className="stat-label">Speed</p>
            <p className="mono text-xs text-slate-200">{replay.speed ? `${replay.speed}×` : '—'}</p>
          </div>
          <div>
            <p className="stat-label">Events</p>
            <p className="mono text-xs text-slate-200">
              {progress.processedEvents.toLocaleString('en-IN')} / {progress.totalEvents.toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          className="btn-primary"
          disabled={!canPlay || busy !== null}
          onClick={() => run('play', () => actions.play(replay.speed))}
        >
          {state === 'PAUSED' ? 'Resume' : 'Play'}
        </button>
        <button type="button" className="btn-ghost" disabled={!canPause || busy !== null} onClick={() => run('pause', actions.pause)}>
          Pause
        </button>
        <button type="button" className="btn-ghost" disabled={!canReset || busy !== null} onClick={() => run('reset', actions.reset)}>
          Reset
        </button>

        <div className="ml-2 flex items-center gap-1" role="group" aria-label="Playback speed">
          {speeds.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => run(`speed-${speed}`, () => actions.setSpeed(speed))}
              disabled={busy !== null}
              className={cx(
                'rounded-md border px-2 py-1 text-[11px] font-semibold transition',
                replay.speed === speed
                  ? 'border-sky-500/70 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              )}
              aria-pressed={replay.speed === speed}
            >
              {speed}×
            </button>
          ))}
        </div>

        {sessions.length > 1 ? (
          <select
            className="select ml-auto"
            aria-label="Historical session"
            value={replay.tradingDate || ''}
            disabled={busy !== null}
            onChange={(event) => run('load', () => actions.load(event.target.value))}
          >
            {sessions.map((session) => (
              <option key={session.sessionId} value={session.tradingDate}>
                {session.tradingDate} · {session.instrumentCount}/{session.configuredInstruments} stocks ·{' '}
                {session.eventCount.toLocaleString('en-IN')} events
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-500"
            style={{ width: `${Math.min(100, progress.percentage)}%` }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
          <span className="mono">{progress.percentage.toFixed(2)}% processed</span>
          {coverage ? (
            <span>
              Dataset coverage {coverage.availableInstruments}/{coverage.configuredInstruments} instruments
              {coverage.unavailableInstruments
                ? ` · ${coverage.unavailableInstruments} unavailable (${coverage.unavailableSymbols?.join(', ')})`
                : ''}
            </span>
          ) : null}
          <span>{replay.granularity === 'ONE_MINUTE_CANDLE' ? 'Source granularity: one-minute candles' : 'Granularity unknown'}</span>
          <span>{replay.datasetSource === 'demo' ? 'Dataset: synthetic DEMO history' : `Dataset: ${replay.datasetSource || 'unknown'}`}</span>
          {replay.error ? <span className="text-rose-400">{replay.error}</span> : null}
        </div>
      </div>

      {sessionError || commandError ? (
        <p className="border-t border-rose-900/50 bg-rose-950/30 px-4 py-2 text-[11px] text-rose-300">
          {commandError || sessionError}
        </p>
      ) : null}
    </section>
  );
}
