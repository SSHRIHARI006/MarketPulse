import { config } from '../config/env.js';
import { profileFor, normal } from '../data/stockProfiles.js';
import { sanitizeTick } from '../utils/validators.js';
import { isMarketOpen, sessionStartUtc } from '../utils/time.js';

/**
 * DEMO MODE feed.
 *
 * Generates a plausible, continuously moving market so the dashboard, heatmap and
 * analytics can be demonstrated without provider credentials. It is a simulation:
 * every API response and socket payload carries `mode: 'demo'`, and the UI shows a
 * DEMO badge, so simulated values are never presented as real market activity.
 */
export function createDemoFeed({ stocks, previousCloses, onTicks, onConnection, onMarketInfo }) {
  const state = new Map();
  const sessionStart = sessionStartUtc(new Date());
  const minutesIntoSession = Math.max(1, (Date.now() - sessionStart.getTime()) / 60000);

  for (const stock of stocks) {
    const profile = profileFor(stock.symbol);
    const previousClose = previousCloses.get(stock.id) ?? profile.basePrice;
    const open = previousClose * (1 + (Math.random() - 0.5) * 0.012);
    // Start each simulated day a little away from the open, as if trading is underway.
    const drifted = open * (1 + (Math.random() - 0.45) * 0.014);
    state.set(stock.id, {
      stock,
      previousClose,
      open,
      price: drifted,
      high: Math.max(open, drifted),
      low: Math.min(open, drifted),
      averagePrice: drifted,
      volume: Math.round((profile.avgVolume / 375) * minutesIntoSession * (0.7 + Math.random() * 0.6)),
      sigma: profile.dailyVolPct / 100 / Math.sqrt(375),
      drift: (Math.random() - 0.45) * 0.00002,
      burstTicks: 0,
      burstBias: 0
    });
  }

  let timer = null;
  let stopped = false;
  let onIndexTicks = null;

  function advance(entry) {
    const random = Math.random;

    // Occasionally start a short burst so unusual-activity detectors have events.
    if (entry.burstTicks <= 0 && random() < 0.004) {
      entry.burstTicks = 3 + Math.floor(random() * 8);
      entry.burstBias = (random() - 0.5) * entry.sigma * 4;
    }

    const burst = entry.burstTicks > 0 ? entry.burstBias : 0;
    if (entry.burstTicks > 0) entry.burstTicks -= 1;

    const shock = normal(random) * entry.sigma + entry.drift + burst;
    // Soft mean reversion towards the session's average price prevents runaway drift.
    const reversion = (entry.averagePrice - entry.price) / entry.price * 0.02;
    const nextPrice = Math.max(1, entry.price * (1 + shock + reversion));

    entry.price = nextPrice;
    entry.high = Math.max(entry.high, nextPrice);
    entry.low = Math.min(entry.low, nextPrice);

    const tradedQty = Math.round(
      (profileFor(entry.stock.symbol).avgVolume / 375) * (0.05 + random() * 0.25) * (entry.burstTicks > 0 ? 4 : 1)
    );
    entry.volume += tradedQty;
    entry.averagePrice = entry.averagePrice + (nextPrice - entry.averagePrice) * 0.08;

    return { tradedQty };
  }

  function emitTick() {
    if (stopped) return;
    const now = new Date();
    const open = isMarketOpen(now);

    // Sparse updates: not every stock prints on every interval, like a real feed.
    const candidates = [...state.values()];
    const tickCount = Math.max(1, Math.round(candidates.length * 0.45));
    const ticks = [];

    for (let i = 0; i < tickCount; i += 1) {
      const entry = candidates[Math.floor(Math.random() * candidates.length)];
      if (!entry) continue;
      const { tradedQty } = advance(entry);
      const tick = sanitizeTick({
        instrumentKey: entry.stock.instrumentKey,
        lastPrice: entry.price,
        previousClose: entry.previousClose,
        lastTradedAt: now.getTime(),
        lastQuantity: tradedQty,
        volume: entry.volume,
        open: entry.open,
        high: entry.high,
        low: entry.low,
        averagePrice: entry.averagePrice
      });
      if (tick) ticks.push(tick);
    }

    if (ticks.length) onTicks(ticks);

    // Indices are derived from the tracked universe's weighted move, so the
    // overview cards stay consistent with the heatmap instead of drifting apart.
    const entries = [...state.values()];
    const totalCap = entries.reduce((sum, entry) => sum + (entry.stock.marketCap || 0), 0) || 1;
    const weightedChange =
      entries.reduce(
        (sum, entry) => sum + ((entry.price - entry.previousClose) / entry.previousClose) * 100 * (entry.stock.marketCap || 0),
        0
      ) / totalCap;

    onIndexTicks?.(
      config.indices.map((index) => ({
        instrumentKey: index.key,
        previousClose: index.basePrice,
        lastPrice: index.basePrice * (1 + (weightedChange / 100) * (index.exchange === 'NSE' ? 0.92 : 0.88))
      }))
    );

    onMarketInfo?.({
      segmentStatus: { NSE_EQ: open ? 'NORMAL_OPEN' : 'NORMAL_CLOSE' },
      source: 'demo-simulation'
    });
  }

  return {
    start({ onIndexTick } = {}) {
      stopped = false;
      onIndexTicks = onIndexTick;
      onConnection({ connected: true, error: null });
      // Give clients an immediate first frame rather than waiting one interval.
      emitTick();
      timer = setInterval(emitTick, config.demo.tickIntervalMs);
      console.log(`[demo] simulated feed running every ${config.demo.tickIntervalMs}ms`);
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      onConnection({ connected: false, error: null });
    }
  };
}
