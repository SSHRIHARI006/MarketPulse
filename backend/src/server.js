import http from 'node:http';
import { createApp } from './app.js';
import { config, isDemoMode, isReplayMode } from './config/env.js';
import { closePool, ensureSchema, waitForDatabase } from './config/database.js';
import { seedHistoryIfEmpty, rollupCandles } from './db/seedHistory.js';
import { startMarketData, stopMarketData } from './services/marketData.service.js';
import { startEventDetection, stopEventDetection } from './services/eventDetection.service.js';
import { startMarketCollector, stopMarketCollector } from './jobs/marketCollector.js';
import { startCandleAggregator, stopCandleAggregator } from './jobs/candleAggregator.js';
import { createSocketServer, closeSocketServer } from './websocket/marketSocket.js';
import { marketStore } from './services/marketStore.js';

async function bootstrap() {
  console.log('[boot] MarketPulse backend starting');

  await waitForDatabase();
  await ensureSchema();

  // Synthetic history belongs to the DEMO dataset. REPLAY reads that dataset, so a
  // fresh install needs it present; LIVE must never inherit it, otherwise rankings
  // and 52-week metrics would mix simulated and real observations.
  if (isDemoMode() || isReplayMode()) {
    await seedHistoryIfEmpty();
  } else {
    console.log('[boot] LIVE mode: demo history is not seeded; history starts from live observations');
  }
  await rollupCandles();

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);

  await new Promise((resolve) => server.listen(config.port, resolve));
  console.log(`[boot] API listening on http://localhost:${config.port}`);

  // The collector persists a wall-clock sample of the feed. Replayed events carry
  // historical timestamps, so sampling them would insert misleading tick rows.
  if (!isReplayMode()) startMarketCollector();
  startCandleAggregator();
  startEventDetection();

  const { mode, stocks } = await startMarketData();
  console.log(`[boot] tracking ${stocks ?? marketStore.listStocks().length} stocks in ${mode} mode`);

  // Marks quotes stale when the feed goes quiet, without inventing movement.
  setInterval(() => {
    marketStore.markStale();
  }, 10_000);

  const shutdown = async (signal) => {
    console.log(`[boot] ${signal} received, shutting down`);
    stopEventDetection();
    await stopMarketData();
    await stopMarketCollector();
    await stopCandleAggregator();
    await closeSocketServer();
    server.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('[boot] fatal:', error);
  process.exit(1);
});
