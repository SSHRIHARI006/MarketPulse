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
export function processTick(tick) {
  if (!tick || typeof tick.instrumentKey !== 'string') return false;

  // Index instruments feed the overview cards, not the stock universe.
  if (config.indices.some((index) => index.key === tick.instrumentKey)) {
    return marketStore.applyIndexTick(tick.instrumentKey, tick);
  }

  const stock = marketStore.getStockByKey(tick.instrumentKey);
  if (!stock) {
    marketStore.recordRejectedTick();
    return false;
  }
  if (!marketStore.applyTick(tick)) return false;
  const quote = marketStore.getQuote(stock.id);
  if (quote) ingestQuote(quote);
  return true;
}

export function handleTicks(ticks) {
  let accepted = 0;
  for (const tick of ticks) if (processTick(tick)) accepted += 1;
  return accepted;
}
