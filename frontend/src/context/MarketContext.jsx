import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../lib/api';

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
  socketConnected: false,
  lastUpdate: null,
  lastSnapshotAt: null,
  snapshotRefreshMs: DEFAULT_SNAPSHOT_REFRESH_MS
};

const newer = (incoming, existing) => {
  const a = incoming ? new Date(incoming).getTime() : 0;
  const b = existing ? new Date(existing).getTime() : 0;
  return a >= b;
};

/**
 * Single Socket.IO connection for the whole app, plus a periodic REST snapshot.
 *
 * The socket is the primary source of updates. Every ~5 seconds the client also
 * re-requests `/api/market/snapshot`, which is served from the backend's cache, and
 * merges it per stock (newest message wins). That repairs events missed while the
 * socket was down without inventing movement: an unchanged stock keeps its price.
 */
export function MarketProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const snapshotRefreshRef = useRef(DEFAULT_SNAPSHOT_REFRESH_MS);

  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

    socket.on('connect', () => setState((prev) => ({ ...prev, socketConnected: true })));
    socket.on('disconnect', () => setState((prev) => ({ ...prev, socketConnected: false })));

    socket.on('market:snapshot', (payload) => {
      const quotes = {};
      for (const quote of payload.quotes || []) quotes[quote.stockId] = quote;
      setState((prev) => ({
        ...prev,
        mode: payload.mode || prev.mode,
        quotes,
        indices: payload.indices || prev.indices,
        marketStatus: payload.marketStatus || prev.marketStatus,
        freshness: payload.freshness || prev.freshness,
        subscription: payload.subscription || prev.subscription,
        lastUpdate: new Date().toISOString()
      }));
    });

    socket.on('market:update', ({ quotes = [] }) => {
      if (!quotes.length) return;
      setState((prev) => {
        const next = { ...prev.quotes };
        for (const quote of quotes) next[quote.stockId] = quote;
        return { ...prev, quotes: next, lastUpdate: new Date().toISOString() };
      });
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

    return () => socket.disconnect();
  }, []);

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
          const quotes = { ...prev.quotes };
          for (const stock of snapshot.stocks || []) {
            const existing = quotes[stock.id];
            // Keep whichever observation is newer so a snapshot response cannot
            // overwrite a tick that arrived while the request was in flight.
            if (existing && !newer(stock.receivedAt, existing.updatedAt)) continue;
            quotes[stock.id] = {
              ...(existing || {}),
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
              stale: stock.dataStatus === 'STALE',
              dataStatus: stock.dataStatus
            };
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

  const value = useMemo(() => state, [state]);
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error('useMarket must be used inside MarketProvider');
  return context;
}
