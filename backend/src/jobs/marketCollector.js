import { query } from '../config/database.js';
import { config, dataSource } from '../config/env.js';
import { marketStore } from '../services/marketStore.js';

const pending = new Map(); // stockId -> latest sampled quote
let sampleTimer = null;
let retentionTimer = null;

function capture(quote) {
  if (!Number.isFinite(quote.price)) return;
  pending.set(quote.stockId, quote);
}

async function flushSamples() {
  if (pending.size === 0) return 0;
  const samples = [...pending.values()];
  pending.clear();

  const source = dataSource();
  const params = samples.flatMap((quote) => [
    quote.stockId,
    quote.price,
    quote.previousClose,
    quote.lastQuantity,
    (quote.tradedAt && new Date(quote.tradedAt)) ? new Date(quote.tradedAt).toISOString() : new Date().toISOString(),
    source
  ]);

  try {
    const values = samples
      .map((_, index) => {
        const base = index * 6;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, now(), $${base + 6})`;
      })
      .join(', ');

    await query(
      `INSERT INTO market_ticks (stock_id, last_price, previous_close, last_quantity, traded_at, received_at, source)
       VALUES ${values}`,
      params
    );
    return samples.length;
  } catch (error) {
    console.error('[collector] sample flush failed:', error.message);
    return 0;
  }
}

async function pruneOldTicks() {
  try {
    const { rowCount } = await query(
      `DELETE FROM market_ticks WHERE received_at < now() - ($1 || ' hours')::interval`,
      [String(config.tickRetentionHours)]
    );
    if (rowCount) console.log(`[collector] pruned ${rowCount} ticks older than ${config.tickRetentionHours}h`);
  } catch (error) {
    console.error('[collector] retention failed:', error.message);
  }
}

/**
 * Persists a *sample* of the feed, not every tick: one latest observation per stock
 * per sampling interval. This keeps historical queries useful without unbounded growth.
 */
export function startMarketCollector() {
  marketStore.on('tick', capture);
  sampleTimer = setInterval(() => {
    flushSamples().catch(() => {});
  }, config.tickSampleIntervalMs);
  retentionTimer = setInterval(() => {
    pruneOldTicks().catch(() => {});
  }, 30 * 60 * 1000);

  console.log(`[collector] sampling ticks every ${config.tickSampleIntervalMs}ms, retention ${config.tickRetentionHours}h`);
}

export async function stopMarketCollector() {
  marketStore.off('tick', capture);
  clearInterval(sampleTimer);
  clearInterval(retentionTimer);
  sampleTimer = null;
  retentionTimer = null;
  await flushSamples();
}
