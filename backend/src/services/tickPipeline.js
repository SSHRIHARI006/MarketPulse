import { config } from '../config/env.js';
import { marketStore } from './marketStore.js';
import { ingestQuote } from './candle.service.js';

/**
 * The single market-event entry point shared by every data mode.
 *
 * DEMO, LIVE and REPLAY all funnel validated ticks through here, so the store,
 * candle aggregation and analytics behave identically no matter where the
 * observation came from (spec 8.2). Nothing in this module knows about providers.
 */
export function processTickDetailed(tick) {
  if (!tick || typeof tick.instrumentKey !== 'string') {
    return { accepted: false, marketStoreUpdated: false, candleUpdates: 0 };
  }

  // Index instruments feed the overview cards, not the stock universe.
  if (config.indices.some((index) => index.key === tick.instrumentKey)) {
    const updated = marketStore.applyIndexTick(tick.instrumentKey, tick);
    return { accepted: updated, marketStoreUpdated: updated, candleUpdates: 0 };
  }

  const stock = marketStore.getStockByKey(tick.instrumentKey);
  if (!stock) {
    marketStore.recordRejectedTick();
    return { accepted: false, marketStoreUpdated: false, candleUpdates: 0 };
  }
  if (!marketStore.applyTick(tick)) {
    return { accepted: false, marketStoreUpdated: false, candleUpdates: 0 };
  }
  const quote = marketStore.getQuote(stock.id);
  const candleUpdates = quote ? ingestQuote(quote) : 0;
  return { accepted: true, marketStoreUpdated: true, candleUpdates };
}

export function processTick(tick) {
  return processTickDetailed(tick).accepted;
}

export function handleTicks(ticks) {
  let accepted = 0;
  for (const tick of ticks) if (processTick(tick)) accepted += 1;
  return accepted;
}
