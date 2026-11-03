import { query } from '../config/database.js';
import { config, dataSource } from '../config/env.js';
import { INTERVAL_MS, floorTo, sessionStartUtc } from '../utils/time.js';
import { round } from '../utils/validators.js';

/**
 * OHLCV candle aggregation.
 *
 * Incoming quotes are folded into 1m buckets; 5m and 15m buckets are derived from
 * ticks too (flooring to the interval), and the daily bucket uses the session open.
 * Buckets are kept in memory and upserted in batches, so a busy feed cannot turn
 * into one database write per tick.
 */
const intervals = ['1m', '5m', '15m', '1d'];
const buckets = new Map(); // `${stockId}:${interval}` -> candle
const dirty = new Set();

const key = (stockId, interval) => `${stockId}:${interval}`;

function bucketStartFor(interval, at) {
  if (interval === '1d') return sessionStartUtc(at);
  return floorTo(at, INTERVAL_MS[interval]);
}

function ensureBucket(stockId, interval, start) {
  const id = key(stockId, interval);
  let candle = buckets.get(id);
  if (!candle || candle.start.getTime() !== start.getTime()) {
    if (candle) dirty.add(id);
    candle = {
      stockId,
      interval,
      start,
      open: null,
      high: null,
      low: null,
      close: null,
      volumeBase: 0,
      volume: 0
    };
    buckets.set(id, candle);
  }
  return candle;
}

/** Folds a validated quote into every interval bucket it belongs to. */
export function ingestQuote(quote) {
  if (!quote || !Number.isFinite(quote.price)) return 0;
  // Replayed observations must be bucketed by their historical timestamp; the wall
  // clock would stack an entire session into the current minute.
  const at = quote.candleAt ? new Date(quote.candleAt) : quote.receivedAt ? new Date(quote.receivedAt) : new Date();
  const cumulativeVolume = Number.isFinite(quote.volume) ? quote.volume : null;

  for (const interval of intervals) {
    const start = bucketStartFor(interval, at);
    const candle = buckets.get(key(quote.stockId, interval));
    const isNew = !candle || candle.start.getTime() !== start.getTime();
    const active = ensureBucket(quote.stockId, interval, start);

    if (isNew) {
      // Replay events carry a cumulative session volume plus the source bar's
      // volume in `lastQuantity`. The first bar in a new bucket must retain that
      // bar volume instead of treating the cumulative value as the bucket base.
      // Keep the existing LIVE/DEMO behaviour unchanged: only normalized
      // one-minute replay candles use this adjustment.
      const replayBarVolume =
        quote.sourceGranularity === 'ONE_MINUTE_CANDLE' && Number.isFinite(quote.lastQuantity)
          ? Math.max(0, Number(quote.lastQuantity))
          : null;
      active.volumeBase = replayBarVolume === null
        ? cumulativeVolume ?? 0
        : Math.max(0, (cumulativeVolume ?? replayBarVolume) - replayBarVolume);
      active.open = quote.price;
      active.high = quote.price;
      active.low = quote.price;
    } else {
      active.open = active.open ?? quote.price;
      active.high = Math.max(active.high ?? quote.price, quote.price);
      active.low = Math.min(active.low ?? quote.price, quote.price);
    }

    active.close = quote.price;
    if (cumulativeVolume !== null) {
      // Provider volumes are cumulative for the session; store the delta per bucket.
      active.volume = Math.max(0, cumulativeVolume - active.volumeBase);
    }
    dirty.add(key(quote.stockId, interval));
  }
  return intervals.length;
}

export function getOpenCandle(stockId, interval) {
  return buckets.get(key(stockId, interval)) || null;
}

/** Drops in-memory buckets (replay reset / session switch). Persisted rows are separate. */
export function clearCandles() {
  buckets.clear();
  dirty.clear();
}

/**
 * Removes candles belonging to one provenance. Replay uses this so restarting a
 * session rebuilds its own bars instead of merging with the previous run, while the
 * historical dataset it reads (a different source) is never touched.
 */
export async function deleteCandlesBySource(source) {
  const { rowCount } = await query('DELETE FROM stock_candles WHERE source = $1', [source]);
  return rowCount;
}

/** Persists all changed buckets. Safe to call frequently; no-op when clean. */
export async function flushCandles() {
  if (dirty.size === 0) return 0;
  const pending = [...dirty].map((id) => buckets.get(id)).filter((candle) => candle && candle.open !== null);
  dirty.clear();
  if (!pending.length) return 0;

  const source = dataSource();
  const values = pending
    .map((_, index) => {
      const base = index * 8;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, '${source}')`;
    })
    .join(', ');

  const params = pending.flatMap((candle) => [
    candle.stockId,
    candle.interval,
    candle.start.toISOString(),
    round(candle.open, 4),
    round(candle.high, 4),
    round(candle.low, 4),
    round(candle.close, 4),
    Math.round(candle.volume)
  ]);

  try {
    await query(
      `INSERT INTO stock_candles (stock_id, interval, candle_start, open, high, low, close, volume, source)
       VALUES ${values}
       ON CONFLICT (stock_id, interval, candle_start, source) DO UPDATE
       SET open = EXCLUDED.open,
           high = GREATEST(stock_candles.high, EXCLUDED.high),
           low = LEAST(stock_candles.low, EXCLUDED.low),
           close = EXCLUDED.close,
           volume = EXCLUDED.volume`,
      params
    );
  } catch (error) {
    console.error('[candles] flush failed:', error.message);
    // Re-mark so the next flush retries rather than silently losing bars.
    pending.forEach((candle) => dirty.add(key(candle.stockId, candle.interval)));
    return 0;
  }

  return pending.length;
}

export async function flushAllIntervals() {
  const count = await flushCandles();
  return count;
}

export const CANDLE_INTERVALS = intervals;
export const supportedIntervals = config.analysis.candleIntervals;
