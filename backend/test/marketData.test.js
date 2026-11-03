import test from 'node:test';
import assert from 'node:assert/strict';
import { percentChange, sanitizeTick, validateRange, validateSizeBy, validateStockId } from '../src/utils/validators.js';
import { marketStore } from '../src/services/marketStore.js';
import { buildHeatmap } from '../src/services/heatmap.service.js';
import { computeActivityScore, activityCategory } from '../src/utils/activityScore.js';

const fixedNow = () => new Date('2026-01-05T05:00:00.000Z');

function registerFixture() {
  marketStore.registerStocks([
    { id: 1, symbol: 'AAA', company_name: 'Alpha Ltd', instrument_key: 'NSE_EQ|AAA', sectorId: 10, sector: 'Banking', market_cap: 1000 },
    { id: 2, symbol: 'BBB', company_name: 'Beta Ltd', instrument_key: 'NSE_EQ|BBB', sectorId: 20, sector: 'IT', market_cap: 500 },
    { id: 3, symbol: 'CCC', company_name: 'Gamma Ltd', instrument_key: 'NSE_EQ|CCC', sectorId: 20, sector: 'IT', market_cap: 250 }
  ]);
}

test('invalid and unknown ticks are rejected', () => {
  registerFixture();

  assert.equal(marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: -5 })), false);
  assert.equal(marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: 0 })), false);
  assert.equal(marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA' })), false);
  assert.equal(
    marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|UNKNOWN', lastPrice: 100 })),
    false,
    'unknown instruments must not create quotes'
  );
  assert.equal(sanitizeTick({ lastPrice: 100 }), null, 'missing instrument key is invalid');
});

test('a valid tick updates the cache and daily percentage change', () => {
  registerFixture();
  const accepted = marketStore.applyTick(
    sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: 110, previousClose: 100, volume: 5000, lastTradedAt: fixedNow() }, fixedNow)
  );

  assert.equal(accepted, true);
  const quote = marketStore.getQuote(1);
  assert.equal(quote.price, 110);
  assert.equal(quote.previousClose, 100);
  assert.equal(quote.changePct, 10);
  assert.equal(quote.stale, false);
});

test('heatmap computes change from the previous close and respects sector and size filters', () => {
  registerFixture();
  marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: 102, previousClose: 100, volume: 1000 }, fixedNow));
  marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|BBB', lastPrice: 95, previousClose: 100, volume: 2000 }, fixedNow));

  const all = buildHeatmap({ range: 'daily' });
  assert.equal(all.tiles.length, 3);
  const alpha = all.tiles.find((tile) => tile.symbol === 'AAA');
  const beta = all.tiles.find((tile) => tile.symbol === 'BBB');
  assert.equal(alpha.changePct, 2);
  assert.equal(beta.changePct, -5);
  assert.equal(all.summary.advancing, 1);
  assert.equal(all.summary.declining, 1);

  const itOnly = buildHeatmap({ range: 'daily', sector: 'IT' });
  assert.equal(itOnly.tiles.length, 2);
  assert.ok(itOnly.tiles.every((tile) => tile.sector === 'IT'));

  const byVolume = buildHeatmap({ range: 'daily', sizeBy: 'volume' });
  assert.equal(byVolume.tiles.find((tile) => tile.symbol === 'BBB').sizeValue, 2000);

  const equal = buildHeatmap({ range: 'daily', sizeBy: 'equal' });
  assert.ok(equal.tiles.every((tile) => tile.sizeValue === 1));
});

test('intraday ranges report unavailable instead of zero movement when history is missing', () => {
  registerFixture();
  marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: 102, previousClose: 100 }, fixedNow));

  // Fresh store: no observation old enough to serve as a 1h baseline.
  const heatmap = buildHeatmap({ range: '1h' });
  const alpha = heatmap.tiles.find((tile) => tile.symbol === 'AAA');
  assert.equal(alpha.available, false);
  assert.equal(alpha.changePct, null);
  assert.equal(heatmap.summary.unavailable >= 1, true);
});

test('stale quotes are marked without inventing new prices', () => {
  registerFixture();
  marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: 102, previousClose: 100 }, fixedNow));
  marketStore.markStale(Date.now() + 10 * 60 * 1000);

  const quote = marketStore.getQuote(1);
  assert.equal(quote.price, 102);
  assert.equal(quote.stale, true);
});

test('percentChange guards against zero and missing bases', () => {
  assert.equal(percentChange(100, 0), null);
  assert.equal(percentChange(100, null), null);
  assert.equal(percentChange(120, 100), 20);
});

test('query validators accept known values and reject the rest', () => {
  assert.equal(validateRange('1h'), '1h');
  assert.throws(() => validateRange('7d'));
  assert.equal(validateSizeBy('volume'), 'volume');
  assert.throws(() => validateSizeBy('random'));
  assert.equal(validateStockId('7'), 7);
  assert.throws(() => validateStockId('abc'));
});

test('activity score is bounded and classified', () => {
  const high = computeActivityScore({ relativeVolume: 3.5, priceMovePct: 3, intradayVolatilityPct: 0.2, volatilityPct: 0.08 });
  const low = computeActivityScore({ relativeVolume: 0.6, priceMovePct: 0.1, intradayVolatilityPct: 0.01, volatilityPct: 0.09 });

  assert.ok(high > 60 && high <= 100, `expected high score, got ${high}`);
  assert.ok(low < 30, `expected low score, got ${low}`);
  assert.equal(activityCategory(85), 'Very High');
  assert.equal(activityCategory(65), 'High');
  assert.equal(activityCategory(40), 'Moderate');
  assert.equal(activityCategory(5), 'Normal');
  assert.equal(computeActivityScore({ relativeVolume: null, priceMovePct: null, intradayVolatilityPct: null }), null);
});
