import test from 'node:test';
import assert from 'node:assert/strict';
import { marketStore } from '../src/services/marketStore.js';
import { sanitizeTick } from '../src/utils/validators.js';

const STOCKS = [
  { id: 501, symbol: 'AAA', company_name: 'Alpha Ltd', instrument_key: 'NSE_EQ|AAA', sectorId: 1, sector: 'Banking', market_cap: 1000 },
  { id: 502, symbol: 'BBB', company_name: 'Beta Ltd', instrument_key: 'NSE_EQ|BBB', sectorId: 1, sector: 'Banking', market_cap: 500 }
];

function resetStore() {
  marketStore.quotes.clear();
  marketStore.history.clear();
  marketStore.registerStocks(STOCKS);
  marketStore.setConnection({ mode: 'live', state: 'DISCONNECTED', error: null, subscribed: 0 });
  marketStore.stats = { messages: 0, ticksAccepted: 0, ticksRejected: 0, decodeErrors: 0 };
  marketStore.setMarketInfo({ segmentStatus: { NSE_EQ: 'NORMAL_OPEN' } });
}

const tick = (instrumentKey, lastPrice, at, extra = {}) =>
  sanitizeTick({ instrumentKey, lastPrice, previousClose: 100, lastTradedAt: at, ...extra }, () => new Date(at));

test('feed lifecycle separates connection from data reception', () => {
  resetStore();

  marketStore.setConnection({ state: 'CONNECTING' });
  assert.equal(marketStore.connection.state, 'CONNECTING');
  assert.equal(marketStore.connection.connected, false);

  marketStore.setConnection({ state: 'AUTHORIZING' });
  marketStore.setConnection({ state: 'SUBSCRIBING' });
  marketStore.setSubscription({ subscribed: 2, total: 2 });
  assert.equal(marketStore.getSubscriptionSummary().subscribedInstruments, 2);

  marketStore.setConnection({ state: 'CONNECTED' });
  assert.equal(marketStore.connection.connected, true);
  assert.equal(marketStore.connection.state, 'CONNECTED', 'a socket alone is not "receiving"');

  const now = Date.now();
  assert.equal(marketStore.applyTick(tick('NSE_EQ|AAA', 105, now)), true);
  assert.equal(marketStore.connection.state, 'RECEIVING', 'a valid tick promotes the feed');
});

test('authentication errors are reported as a distinct state', () => {
  resetStore();
  marketStore.setConnection({ state: 'AUTH_ERROR', error: null });
  assert.equal(marketStore.connection.state, 'AUTH_ERROR');
  assert.match(marketStore.connection.error, /rejected/i);
});

test('data freshness is derived from message timestamps, not price equality', () => {
  resetStore();
  const base = Date.now();

  marketStore.applyTick(tick('NSE_EQ|AAA', 105, base));
  const quote = marketStore.getQuote(501);

  assert.equal(marketStore.getDataStatus(quote, base), 'FRESH');
  assert.equal(marketStore.getDataStatus(quote, base + 20_000), 'STALE');

  // Repeating the same price is still a fresh observation.
  marketStore.applyTick(tick('NSE_EQ|AAA', 105, base + 21_000));
  assert.equal(marketStore.getDataStatus(marketStore.getQuote(501), base + 22_000), 'FRESH');

  // An untraded stock is unavailable, never zero.
  const untraded = marketStore.getQuote(502);
  assert.equal(untraded.price, null);
  assert.equal(marketStore.getDataStatus(untraded, base), 'UNAVAILABLE');

  // A closed market reports CLOSED while keeping the last valid price.
  marketStore.setMarketInfo({ segmentStatus: { NSE_EQ: 'NORMAL_CLOSE' } });
  const closed = marketStore.getQuote(501);
  assert.equal(marketStore.getDataStatus(closed, base + 60_000), 'CLOSED');
  assert.equal(closed.price, 105);
});

test('rejected ticks never overwrite a valid cached price', () => {
  resetStore();
  const now = Date.now();
  marketStore.applyTick(tick('NSE_EQ|AAA', 105, now));

  assert.equal(marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: -10 }, () => new Date(now))), false);
  assert.equal(marketStore.applyTick(sanitizeTick({ instrumentKey: 'NSE_EQ|UNKNOWN', lastPrice: 50 }, () => new Date(now))), false);
  assert.equal(marketStore.applyTick(null), false);

  assert.equal(marketStore.getQuote(501).price, 105);
  const diagnostics = marketStore.getDiagnostics();
  assert.equal(diagnostics.rejectedTicks >= 2, true, 'rejections are counted');
  assert.equal(diagnostics.acceptedTicks, 1);
});

test('snapshot returns every tracked stock, including ones that have not traded', () => {
  resetStore();
  const now = Date.now();
  marketStore.applyTick(tick('NSE_EQ|AAA', 110, now));
  marketStore.setConnection({ state: 'RECEIVING' });
  marketStore.setSubscription({ subscribed: 2, total: 2 });

  const snapshot = marketStore.snapshot(now);
  assert.equal(snapshot.quotes.length, 2);
  assert.equal(snapshot.connectionStatus, 'RECEIVING');
  assert.equal(snapshot.subscription.totalInstruments, 2);
  assert.equal(snapshot.subscription.subscribedInstruments, 2);

  const alpha = snapshot.quotes.find((quote) => quote.symbol === 'AAA');
  const beta = snapshot.quotes.find((quote) => quote.symbol === 'BBB');
  assert.equal(alpha.price, 110);
  assert.equal(alpha.dataStatus, 'FRESH');
  assert.equal(beta.price, null, 'no fabricated price for an untraded stock');
  assert.equal(beta.dataStatus, 'UNAVAILABLE');
});

test('diagnostics expose decode errors, reconnects and per-instrument updates', () => {
  resetStore();
  marketStore.setConnection({ state: 'RECONNECTING', error: 'closed 1006', reconnectCount: 3 });
  marketStore.recordDecodeError();
  marketStore.recordDecodeError();
  marketStore.applyTick(tick('NSE_EQ|BBB', 99, Date.now()));

  const diagnostics = marketStore.getDiagnostics();
  assert.equal(diagnostics.decodeErrors, 2);
  assert.equal(diagnostics.reconnectCount, 3);
  assert.equal(diagnostics.totalInstruments, 2);
  assert.equal(diagnostics.unavailable, 1);
  assert.equal(diagnostics.instruments.length, 2);
  const beta = diagnostics.instruments.find((entry) => entry.symbol === 'BBB');
  assert.ok(beta.lastMessageAt, 'per-instrument last update is reported');
});

test('tick validation rejects malformed timestamps and negative values', () => {
  const now = () => new Date('2026-05-01T06:00:00.000Z');

  assert.equal(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: 10, lastTradedAt: 'not-a-date' }, now), null);
  assert.equal(
    sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: 10, lastTradedAt: Date.now() + 5 * 24 * 3600 * 1000 }, now),
    null,
    'implausibly future trade times are rejected'
  );

  const sanitized = sanitizeTick(
    { instrumentKey: 'NSE_EQ|AAA', lastPrice: 10, open: -1, high: -5, low: -2, averagePrice: -3 },
    now
  );
  assert.equal(sanitized.open, null);
  assert.equal(sanitized.high, null);
  assert.equal(sanitized.low, null);
  assert.equal(sanitized.averagePrice, null);

  assert.ok(sanitizeTick({ instrumentKey: 'NSE_EQ|AAA', lastPrice: 10, lastTradedAt: new Date('2026-04-30T06:00:00Z') }, now));
});
