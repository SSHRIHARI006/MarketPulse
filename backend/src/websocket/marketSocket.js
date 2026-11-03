import { Server } from 'socket.io';
import { config } from '../config/env.js';
import { marketStore } from '../services/marketStore.js';

let io = null;
const pendingQuotes = new Map();
let flushTimer = null;
let lastStatusBroadcast = 0;
let pendingReplayStatus = null;
let lastReplayState = null;
const reportTimestamps = new Map();

const FLUSH_INTERVAL_MS = 250;
const STATUS_INTERVAL_MS = 30_000;

// Lifecycle events are emitted on transition only, never on every progress update.
const REPLAY_LIFECYCLE = {
  READY: 'replay:loaded',
  PLAYING: 'replay:started',
  PAUSED: 'replay:paused',
  COMPLETED: 'replay:completed',
  ERROR: 'replay:error',
  LOADING: 'replay:loading'
};

function replayMeta() {
  const replay = marketStore.replay;
  if (!replay) return null;
  return {
    sessionId: replay.sessionId,
    tradingDate: replay.tradingDate,
    state: replay.state,
    clock: replay.clock,
    speed: replay.speed
  };
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!io || pendingQuotes.size === 0) return;

    const quotes = [...pendingQuotes.values()].map((quote) => ({
      ...quote,
      dataStatus: marketStore.getDataStatus(quote)
    }));
    pendingQuotes.clear();
    // One batched frame per 250ms keeps the event loop free under a busy feed.
    const replay = replayMeta();
    io.emit('market:update', { quotes, serverTime: new Date().toISOString(), replay });
    marketStore.recordBroadcast(quotes.length);

    if (pendingReplayStatus) {
      io.emit('replay:status', pendingReplayStatus);
      pendingReplayStatus = null;
    }
    io.emit('heatmap:update', {
      quotes: quotes.map((quote) => ({
        stockId: quote.stockId,
        price: quote.price,
        changePct: quote.changePct,
        volume: quote.volume,
        updatedAt: quote.updatedAt,
        candleAt: quote.candleAt,
        sessionId: quote.sessionId,
        stale: quote.stale,
        dataStatus: quote.dataStatus
      })),
      serverTime: new Date().toISOString(),
      replay
    });

    const now = Date.now();
    if (now - lastStatusBroadcast > STATUS_INTERVAL_MS) {
      lastStatusBroadcast = now;
      io.emit('market:status', {
        status: marketStore.getMarketStatus(),
        freshness: marketStore.getFreshness(),
        subscription: marketStore.getSubscriptionSummary(),
        mode: marketStore.connection.mode
      });
    }
  }, FLUSH_INTERVAL_MS);
}

export function createSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
    path: '/socket.io'
  });

  marketStore.on('tick', (quote) => {
    pendingQuotes.set(quote.stockId, quote);
    scheduleFlush();
  });

  marketStore.on('event', (event) => {
    io?.emit('market:event', event);
  });

  // Replay state changes drive both the throttled status stream and the lifecycle
  // events. The backend is the only authority on replay state.
  marketStore.on('replay:state', (status) => {
    pendingReplayStatus = status;
    const next = status?.state;
    if (next && next !== lastReplayState) {
      const previous = lastReplayState;
      lastReplayState = next;
      const event = next === 'PLAYING' && previous === 'PAUSED' ? 'replay:resumed' : REPLAY_LIFECYCLE[next];
      if (event) io?.emit(event, status);
      if (next === 'COMPLETED') io?.emit('replay:status', status);
    }
    scheduleFlush();
  });

  marketStore.on('replay:reset', (payload) => {
    // A reset replaces market state, so clients need a fresh snapshot, not just an
    // incremental update.
    io?.emit('replay:reset', payload);
    io?.emit('market:snapshot', marketStore.snapshot());
  });

  marketStore.on('connection', (connection) => {
    io?.emit('market:connection', {
      mode: connection.mode,
      state: connection.state,
      connected: connection.connected,
      error: connection.error || null,
      subscription: marketStore.getSubscriptionSummary(),
      serverTime: new Date().toISOString()
    });
  });

  io.on('connection', (socket) => {
    marketStore.recordSocketClients(io.engine.clientsCount);
    // Clients always receive a snapshot before incremental updates.
    socket.emit('market:snapshot', marketStore.snapshot());
    if (marketStore.replay) socket.emit('replay:status', marketStore.replay);

    // Receipt confirmation: emitting is not proof a browser applied an update.
    socket.on('replay:client-report', (payload = {}) => {
      reportTimestamps.set(socket.id, Date.now());
      marketStore.recordFrontendReport(reportTimestamps.size);
      socket.data.lastReplayEventId = payload.lastEventId ?? null;
    });

    socket.on('disconnect', () => {
      reportTimestamps.delete(socket.id);
      marketStore.recordSocketClients(io.engine.clientsCount);
      marketStore.recordFrontendReport(reportTimestamps.size);
    });
    socket.emit('market:status', {
      status: marketStore.getMarketStatus(),
      freshness: marketStore.getFreshness(),
      subscription: marketStore.getSubscriptionSummary(),
      mode: marketStore.connection.mode
    });
    socket.emit('market:connection', {
      mode: marketStore.connection.mode,
      state: marketStore.connection.state,
      connected: marketStore.connection.connected,
      error: marketStore.connection.error || null,
      subscription: marketStore.getSubscriptionSummary(),
      serverTime: new Date().toISOString()
    });

    socket.on('heatmap:subscribe', (payload = {}, ack) => {
      const sector = typeof payload.sector === 'string' ? payload.sector : 'all';
      socket.data.heatmapSector = sector;
      if (ack) ack({ ok: true, sector });
    });

    socket.on('heatmap:unsubscribe', (payload = {}, ack) => {
      socket.data.heatmapSector = null;
      if (ack) ack({ ok: true });
    });
  });

  console.log('[socket] Socket.IO server ready');
  return io;
}

export function getIo() {
  return io;
}

export async function closeSocketServer() {
  clearTimeout(flushTimer);
  flushTimer = null;
  pendingQuotes.clear();
  if (io) {
    await new Promise((resolve) => io.close(resolve));
    io = null;
  }
}
