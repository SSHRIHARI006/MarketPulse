import { flushCandles } from '../services/candle.service.js';
import { rollupCandles } from '../db/seedHistory.js';

let timer = null;
let rollupTimer = null;

const FLUSH_INTERVAL_MS = 15_000;
const ROLLUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Periodically writes open OHLCV buckets and refreshes the 5m/15m rollups and the
 * 52-week reference table, so detail charts stay current while the feed runs.
 */
export function startCandleAggregator() {
  timer = setInterval(() => {
    flushCandles().catch((error) => console.error('[candles] flush error:', error.message));
  }, FLUSH_INTERVAL_MS);

  rollupTimer = setInterval(() => {
    flushCandles()
      .then(() => rollupCandles())
      .catch((error) => console.error('[candles] rollup error:', error.message));
  }, ROLLUP_INTERVAL_MS);

  console.log('[candles] aggregator running');
}

export async function stopCandleAggregator() {
  clearInterval(timer);
  clearInterval(rollupTimer);
  timer = null;
  rollupTimer = null;
  await flushCandles();
}
