import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../lib/api';
import { mergeQuote } from '../lib/quoteMerge';

export { mergeQuote };

const MarketContext = createContext(null);

const DEFAULT_SNAPSHOT_REFRESH_MS = 5000;

const EMPTY = {
  mode: 'demo',
  connection: { state: 'DISCONNECTED', connected: false, error: null },
  subscription: { totalInstruments: 0, subscribedInstruments: 0, instrumentsReceivingUpdates: 0 },
  marketStatus: null,
  freshness: null,
  quotes: {},
  indices: [],
  events: [],
  replay: null,
  socketConnected: false,
  lastUpdate: null,
  lastSnapshotAt: null,
  snapshotRefreshMs: DEFAULT_SNAPSHOT_REFRESH_MS
};

/**
 * Single Socket.IO connection for the whole app, plus a periodic REST snapshot.
 *
 * The socket is the primary source of updates. Every ~5 seconds the client also
 * re-requests `/api/market/snapshot`, which is served from the backend's cache, and
 * merges it per stock through the same merge function used for socket frames, so a
 * delayed snapshot can never overwrite a newer observation.
 *
 * Replay state is owned by the backend. This provider only forwards commands and
 * stores the state it is told.
 */
export function MarketProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const snapshotRefreshRef = useRef(DEFAULT_SNAPSHOT_REFRESH_MS);
  const replaySessionRef = useRef(null);
  const lastReportRef = useRef(0);
  const socketRef = useRef(null);

  const applyReplay = useCallback((status) => {
    if (!status) return;
    replaySessionRef.current = status.sessionId ?? replaySessionRef.current;
    setState((prev) => ({ ...prev, replay: { ...(prev.replay || {}), ...status }, mode: 'replay' }));
  }, []);

  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setState((prev) => ({ ...prev, socketConnected: true })));
    socket.on('disconnect', () => setState((prev) => ({ ...prev, socketConnected: false })));

    socket.on('market:snapshot', (payload) => {
      setState((prev) => {
        const activeSession = payload.replay?.sessionId ?? replaySessionRef.current;
        // A snapshot for a different replay session replaces the quote cache instead
        // of being merged into it.
        const sessionChanged = Boolean(
          payload.replay?.sessionId && prev.replay?.sessionId && payload.replay.sessionId !== prev.replay.sessionId
        );
        const quotes = sessionChanged ? {} : { ...prev.quotes };
        for (const quote of payload.quotes || []) {
          quotes[quote.stockId] = mergeQuote(sessionChanged ? null : quotes[quote.stockId], quote, activeSession);
        }
        return {
          ...prev,
          mode: payload.mode || prev.mode,
          quotes,
          indices: payload.indices || prev.indices,
          marketStatus: payload.marketStatus || prev.marketStatus,
          freshness: payload.freshness || prev.freshness,
          subscription: payload.subscription || prev.subscription,
          replay: payload.replay ?? prev.replay,
          lastUpdate: new Date().toISOString()
        };
      });
    });

    socket.on('market:update', ({ quotes = [], replay }) => {
      if (!quotes.length) return;
      const activeSession = replay?.sessionId ?? replaySessionRef.current;
      setState((prev) => {
        const next = { ...prev.quotes };
        for (const quote of quotes) {
          const merged = mergeQuote(next[quote.stockId], quote, activeSession);
          if (merged) next[quote.stockId] = merged;
        }
        return {
          ...prev,
          quotes: next,
          replay: replay ? { ...(prev.replay || {}), ...replay } : prev.replay,
          lastUpdate: new Date().toISOString()
        };
      });

      // Receipt acknowledgement: the backend cannot assume a browser applied a
      // broadcast, so clients report the last event they actually received.
      if (replay?.sessionId) {
        const now = Date.now();
        if (now - lastReportRef.current > 1000) {
          lastReportRef.current = now;
          socket.emit('replay:client-report', { lastEventId: replay.lastEventId ?? null });
        }
      }
    });

    socket.on('market:status', ({ status, freshness, mode, subscription }) =>
      setState((prev) => ({
        ...prev,
        marketStatus: status || prev.marketStatus,
        freshness: freshness || prev.freshness,
        subscription: subscription || prev.subscription,
        mode: mode || prev.mode
      }))
    );

    socket.on('market:connection', ({ connected, mode, error, state: feedState, subscription }) =>
      setState((prev) => ({
        ...prev,
        mode: mode || prev.mode,
        connection: {
          state: feedState || (connected ? 'CONNECTED' : 'DISCONNECTED'),
          connected: Boolean(connected),
          error: error || null
        },
        subscription: subscription || prev.subscription
      }))
    );

    socket.on('market:event', (event) =>
      setState((prev) => ({ ...prev, events: [event, ...prev.events].slice(0, 40) }))
    );

    socket.on('replay:status', applyReplay);
    socket.on('replay:loaded', applyReplay);
    socket.on('replay:started', applyReplay);
    socket.on('replay:paused', applyReplay);
    socket.on('replay:resumed', applyReplay);
    socket.on('replay:completed', applyReplay);
    socket.on('replay:error', applyReplay);

    socket.on('replay:reset', (payload) => {
      // A reset invalidates the cached quotes: they belong to a playback position
      // that no longer exists.
      replaySessionRef.current = payload?.sessionId ?? replaySessionRef.current;
      setState((prev) => ({ ...prev, quotes: {}, replay: payload ? { ...prev.replay, ...payload } : prev.replay }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyReplay]);

  // Reconciliation poll. Served from the backend cache; never one request per stock.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const schedule = (delay) => {
      if (cancelled) return;
      timer = setTimeout(poll, delay);
    };

    const poll = async () => {
      // A hidden tab still reconciles, but less often.
      if (typeof document !== 'undefined' && document.hidden) {
        schedule(Math.max(10000, snapshotRefreshRef.current));
        return;
      }

      let delay = snapshotRefreshRef.current;
      try {
        const snapshot = await api.snapshot();
        if (cancelled) return;
        if (Number.isFinite(snapshot.snapshotRefreshMs) && snapshot.snapshotRefreshMs > 0) {
          snapshotRefreshRef.current = snapshot.snapshotRefreshMs;
          delay = snapshot.snapshotRefreshMs;
        }

        setState((prev) => {
          const activeSession = snapshot.replay?.sessionId ?? replaySessionRef.current;
          const sessionChanged = Boolean(
            snapshot.replay?.sessionId && prev.replay?.sessionId && snapshot.replay.sessionId !== prev.replay.sessionId
          );
          const quotes = sessionChanged ? {} : { ...prev.quotes };
          for (const stock of snapshot.stocks || []) {
            const incoming = {
              stockId: stock.id,
              symbol: stock.symbol,
              companyName: stock.companyName,
              sector: stock.sector,
              price: stock.ltp,
              previousClose: stock.previousClose,
              changePct: stock.changePct,
              changeAbs: stock.changeAbs,
              volume: stock.volume,
              open: stock.open,
              high: stock.high,
              low: stock.low,
              tradedAt: stock.lastTradeTime,
              receivedAt: stock.receivedAt,
              updatedAt: stock.receivedAt,
              candleAt: stock.candleAt ?? null,
              sessionId: stock.sessionId ?? null,
              stale: stock.dataStatus === 'STALE',
              dataStatus: stock.dataStatus
            };
            quotes[stock.id] = mergeQuote(sessionChanged ? null : quotes[stock.id], incoming, activeSession);
          }

          return {
            ...prev,
            mode: snapshot.mode || prev.mode,
            connection: {
              ...prev.connection,
              state: snapshot.connectionStatus || prev.connection.state,
              connected: Boolean(snapshot.connected)
            },
            subscription: snapshot.subscription || prev.subscription,
            marketStatus: snapshot.marketStatus || prev.marketStatus,
            freshness: { ...(prev.freshness || {}), lastMessageAt: snapshot.lastFeedMessageAt },
            indices: snapshot.indices || prev.indices,
            replay: snapshot.replay ?? prev.replay,
            quotes,
            lastSnapshotAt: new Date().toISOString(),
            snapshotRefreshMs: delay
          };
        });
      } catch {
        // Keep the socket path working; the next poll retries.
        delay = Math.min(15000, Math.max(5000, snapshotRefreshRef.current));
      }
      schedule(delay);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const runReplayCommand = useCallback(
    async (command) => {
      const status = await command();
      applyReplay(status);
      return status;
    },
    [applyReplay]
  );

  const replayActions = useMemo(
    () => ({
      load: (sessionId) => runReplayCommand(() => api.replayLoad(sessionId)),
      play: (speed) => runReplayCommand(() => api.replayPlay(speed)),
      pause: () => runReplayCommand(() => api.replayPause()),
      reset: () => runReplayCommand(() => api.replayReset()),
      setSpeed: (speed) => runReplayCommand(() => api.replaySpeed(speed)),
      refresh: async () => {
        const status = await api.replayStatus();
        applyReplay(status);
        return status;
      }
    }),
    [runReplayCommand, applyReplay]
  );

  const value = useMemo(() => ({ ...state, replayActions }), [state, replayActions]);
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error('useMarket must be used inside MarketProvider');
  return context;
}
