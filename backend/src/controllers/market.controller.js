import { getMarketOverview, getMovers } from '../services/analytics.service.js';
import { buildHeatmap } from '../services/heatmap.service.js';
import { marketStore } from '../services/marketStore.js';
import { getUniverse } from '../services/marketData.service.js';
import { validateRange, validateSizeBy } from '../utils/validators.js';

export async function overview(req, res) {
  res.json(await getMarketOverview());
}

export async function heatmap(req, res) {
  const range = validateRange(req.query.range);
  const sizeBy = validateSizeBy(req.query.sizeBy);
  const sector = typeof req.query.sector === 'string' && req.query.sector.length ? req.query.sector : 'all';
  res.json(buildHeatmap({ range, sector, sizeBy }));
}

export async function status(req, res) {
  res.json({
    mode: marketStore.connection.mode,
    state: marketStore.connection.state,
    connection: marketStore.connection,
    connected: marketStore.connection.connected,
    subscription: marketStore.getSubscriptionSummary(),
    marketStatus: marketStore.getMarketStatus(),
    freshness: marketStore.getFreshness(),
    trackedStocks: marketStore.listStocks().length,
    serverTime: new Date().toISOString()
  });
}

/**
 * Consolidated snapshot, served entirely from the in-memory cache. The frontend
 * polls this every LIVE_SNAPSHOT_REFRESH_MS to reconcile missed socket events; it
 * never triggers provider requests per stock.
 */
export async function snapshot(req, res) {
  const snap = marketStore.snapshot();
  res.json({
    mode: snap.mode,
    connectionStatus: snap.connectionStatus,
    connected: snap.connected,
    serverTime: snap.serverTime,
    lastFeedMessageAt: snap.freshness.lastMessageAt,
    snapshotRefreshMs: snap.snapshotRefreshMs,
    subscription: snap.subscription,
    marketStatus: snap.marketStatus,
    indices: snap.indices,
    stocks: snap.quotes.map((quote) => ({
      id: quote.stockId,
      symbol: quote.symbol,
      companyName: quote.companyName,
      sector: quote.sector,
      ltp: quote.price,
      previousClose: quote.previousClose,
      changePct: quote.changePct,
      changeAbs: quote.changeAbs,
      volume: quote.volume,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      lastTradeTime: quote.tradedAt,
      receivedAt: quote.receivedAt,
      dataStatus: quote.dataStatus
    }))
  });
}

/** Feed and instrument health. Credentials are never included. */
export async function diagnostics(req, res) {
  res.json(marketStore.getDiagnostics());
}

/** The tracked constituent universe, independent of current prices. */
export async function universe(req, res) {
  res.json(getUniverse());
}

export async function movers(req, res) {
  res.json(await getMovers());
}
