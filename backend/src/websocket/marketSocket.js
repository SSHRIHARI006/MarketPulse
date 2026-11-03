import { Server } from 'socket.io';
import { config } from '../config/env.js';
import { marketStore } from '../services/marketStore.js';

let io = null;
const pendingQuotes = new Map();
let flushTimer = null;
let lastStatusBroadcast = 0;

const FLUSH_INTERVAL_MS = 250;
const STATUS_INTERVAL_MS = 30_000;

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
    io.emit('market:update', { quotes, serverTime: new Date().toISOString() });
    io.emit('heatmap:update', {
      quotes: quotes.map((quote) => ({
        stockId: quote.stockId,
        price: quote.price,
        changePct: quote.changePct,
        volume: quote.volume,
        updatedAt: quote.updatedAt,
        stale: quote.stale,
        dataStatus: quote.dataStatus
      })),
      serverTime: new Date().toISOString()
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
    // Clients always receive a snapshot before incremental updates.
    socket.emit('market:snapshot', marketStore.snapshot());
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
