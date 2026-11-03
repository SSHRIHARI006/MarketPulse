import { Link, NavLink, Outlet } from 'react-router-dom';
import { useMarket } from '../context/MarketContext';
import { cx, fmtTime } from '../lib/format';

function ModeBadge({ mode }) {
  const live = mode === 'live';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
        live
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      )}
      title={
        live
          ? 'Live mode: prices are streamed from the market data provider.'
          : 'Demo mode: values are simulated and must not be read as actual market activity.'
      }
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', live ? 'bg-emerald-400 live-dot' : 'bg-amber-400')} />
      {live ? 'Live' : 'Demo'}
    </span>
  );
}

const CONNECTION_VIEW = {
  RECEIVING: { label: 'Connected', tone: 'ok' },
  CONNECTED: { label: 'Connected · waiting for ticks', tone: 'warn' },
  SUBSCRIBING: { label: 'Subscribing', tone: 'warn' },
  AUTHORIZING: { label: 'Authorizing', tone: 'warn' },
  CONNECTING: { label: 'Connecting', tone: 'warn' },
  RECONNECTING: { label: 'Reconnecting', tone: 'warn' },
  AUTH_ERROR: { label: 'Authentication error', tone: 'error' },
  DISCONNECTED: { label: 'Disconnected', tone: 'muted' }
};

function ConnectionPill({ market, socketConnected }) {
  const feedState = market.connection?.state || 'DISCONNECTED';
  const view = !socketConnected
    ? { label: 'Reconnecting to server', tone: 'error' }
    : CONNECTION_VIEW[feedState] || { label: feedState, tone: 'muted' };
  const { totalInstruments = 0, subscribedInstruments = 0 } = market.subscription || {};

  const toneClass =
    view.tone === 'ok'
      ? 'border-emerald-700/60 text-emerald-300'
      : view.tone === 'warn'
        ? 'border-amber-700/60 text-amber-400'
        : view.tone === 'error'
          ? 'border-rose-700/60 text-rose-300'
          : 'border-slate-700/70 text-slate-400';

  const dotClass =
    view.tone === 'ok'
      ? 'bg-emerald-400'
      : view.tone === 'warn'
        ? 'bg-amber-400'
        : view.tone === 'error'
          ? 'bg-rose-400'
          : 'bg-slate-500';

  return (
    <span
      className={cx(
        'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium sm:inline-flex',
        toneClass
      )}
      title={market.connection?.error || (totalInstruments ? `${subscribedInstruments} of ${totalInstruments} instruments subscribed` : undefined)}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', dotClass)} />
      {view.label}
      {totalInstruments ? (
        <span className="text-slate-500">
          {subscribedInstruments}/{totalInstruments}
        </span>
      ) : null}
    </span>
  );
}

const navLink = ({ isActive }) =>
  cx(
    'rounded-lg px-3 py-1.5 text-xs font-medium transition',
    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
  );

export default function Layout() {
  const { mode, socketConnected, marketStatus, freshness, ...market } = useMarket();
  const lastMessage = freshness?.lastMessageAt;
  const stale = marketStatus?.isOpen && (freshness?.stale ?? true);

  return (
    <div className="flex min-h-screen flex-col bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 17l5-6 4 3 5-7 4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">
              Market<span className="text-sky-400">Pulse</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/" className={navLink} end>
              Dashboard
            </NavLink>
            <NavLink to="/compare" className={navLink}>
              Compare
            </NavLink>
            <NavLink to="/watchlist" className={navLink}>
              Watchlist
            </NavLink>
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <ModeBadge mode={mode} />
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-700/70 px-2.5 py-1 text-[10px] font-medium text-slate-400 sm:inline-flex">
              <span
                className={cx('h-1.5 w-1.5 rounded-full', marketStatus?.isOpen ? 'bg-emerald-400' : 'bg-slate-500')}
              />
              {marketStatus?.label || 'Market status unavailable'}
            </span>
            <ConnectionPill market={market} socketConnected={socketConnected} />
            <span
              className={cx('hidden text-[10px] lg:inline', stale ? 'text-amber-400' : 'text-slate-500')}
              title="Timestamp of the last valid feed message"
            >
              {lastMessage ? `Last feed message ${fmtTime(lastMessage)} IST` : 'No feed message yet'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] flex-1 px-4 py-5 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-800/70 px-4 py-4 text-[11px] text-slate-600 sm:px-6">
        <div className="mx-auto flex max-w-[1920px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p>
            MarketPulse · educational market analytics. Not investment advice. Rankings and metrics cover only the
            tracked NIFTY 50 universe.
          </p>
          <p>
            {mode === 'demo'
              ? 'Demo mode: all values are simulated and clearly labelled.'
              : 'Live mode: data from the market data provider.'}
          </p>
        </div>
      </footer>
    </div>
  );
}
