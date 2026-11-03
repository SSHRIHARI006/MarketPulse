import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseEvents, REJECTION_REASONS, istDayBounds, isValidTradingDate } from '../src/replay/dataset.js';
import { ReplayEngine, REPLAY_STATES } from '../src/replay/engine.js';
import { marketStore } from '../src/services/marketStore.js';
import { processTick } from '../src/services/tickPipeline.js';
import { getOpenCandle } from '../src/services/candle.service.js';
import { sanitizeTick } from '../src/utils/validators.js';

const SESSION = '2026-11-02';
const STOCKS = new Map([
  [1, { id: 1, symbol: 'AAA', instrumentKey: 'NSE_EQ|AAA' }],
  [2, { id: 2, symbol: 'BBB', instrumentKey: 'NSE_EQ|BBB' }]
]);

const BAR = { open: 100, high: 102, low: 99, close: 101, volume: 1000 };

const row = (stockId, iso, patch = {}) => ({ stock_id: stockId, candle_start: iso, ...BAR, ...patch });

const normalise = (rows, options = {}) =>
  normaliseEvents({ rows, stocksById: STOCKS, sessionId: 'replay-test-1', tradingDate: SESSION, ...options });

/* ------------------------------------------------------------------ dataset */

test('historical bars are normalised into chronological replay events', () => {
  const { events, stats } = normalise([
    row(2, '2026-11-02T03:46:00.000Z'),
    row(1, '2026-11-02T03:45:00.000Z'),
    row(1, '2026-11-02T03:46:00.000Z')
  ]);

  assert.equal(stats.recordsLoaded, 3);
  assert.equal(stats.accepted, 3);
  assert.equal(stats.rejected, 0);
  assert.deepEqual(
    events.map((event) => `${event.providerTimestamp}:${event.symbol}`),
    ['2026-11-02T03:45:00.000Z:AAA', '2026-11-02T03:46:00.000Z:AAA', '2026-11-02T03:46:00.000Z:BBB'],
    'rows must be ordered by historical time, then by instrument'
  );
  assert.equal(events[0].price, 101, 'the candle close is the replayed observation');
  assert.equal(events[0].sourceGranularity, 'ONE_MINUTE_CANDLE');
  assert.deepEqual(
    events.map((event) => event.sequence),
    [0, 1, 2]
  );
});

test('malformed records are counted and isolated instead of aborting the session', () => {
  const { events, rejections, stats } = normalise([
    row(1, '2026-11-02T03:45:00.000Z'),
    row(1, '2026-11-02T03:46:00.000Z', { close: -5 }),
    row(1, '2026-11-02T03:47:00.000Z', { high: 90, close: 101 }),
    row(1, '2026-11-02T03:48:00.000Z', { volume: -100 }),
    row(1, 'not-a-timestamp'),
    row(99, '2026-11-02T03:49:00.000Z'),
    row(1, '2026-11-02T03:45:00.000Z')
  ]);

  assert.equal(stats.accepted, 1, 'only the valid record is replayed');
  assert.equal(stats.rejected, 6);
  assert.equal(rejections.byReason.INVALID_PRICE, 1);
  assert.equal(rejections.byReason.INVALID_OHLC, 1);
  assert.equal(rejections.byReason.INVALID_VOLUME, 1);
  assert.equal(rejections.byReason.INVALID_TIMESTAMP, 1);
  assert.equal(rejections.byReason.UNKNOWN_INSTRUMENT, 1);
  assert.equal(rejections.byReason.DUPLICATE_EVENT, 1);
  assert.equal(events.length, 1);
});

test('observations outside the selected trading date are rejected', () => {
  const { stats, rejections } = normalise([row(1, '2026-11-03T03:45:00.000Z')]);
  assert.equal(stats.accepted, 0);
  assert.equal(rejections.byReason[REJECTION_REASONS.INVALID_TIMESTAMP], 1);
});

test('identical timestamps across instruments are all preserved', () => {
  const iso = '2026-11-02T03:45:00.000Z';
  const { events } = normalise([row(1, iso), row(2, iso)]);
  assert.equal(events.length, 2, 'a shared timestamp must not drop instruments');
  assert.equal(new Set(events.map((event) => event.providerTimestamp)).size, 1);
});

test('a session larger than the configured cap is truncated deterministically', () => {
  const rows = Array.from({ length: 5 }, (_, index) =>
    row(1, `2026-11-02T03:${String(45 + index).padStart(2, '0')}:00.000Z`)
  );
  const { events, stats } = normalise(rows, { maxEvents: 3 });
  assert.equal(events.length, 3);
  assert.equal(stats.truncated, 2);
});

test('trading-date helpers reject impossible dates', () => {
  assert.equal(isValidTradingDate('2026-11-02'), true);
  assert.equal(isValidTradingDate('02-11-2026'), false);
  assert.equal(isValidTradingDate('2026-13-45'), false);
  const bounds = istDayBounds('2026-11-02');
  assert.equal(bounds.start.toISOString(), '2026-11-01T18:30:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-11-02T18:30:00.000Z');
});

/* ------------------------------------------------------------------- engine */

/** Deterministic scheduler so timing tests do not depend on real timers. */
function makeClock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeoutFn: (fn, delay) => {
      sequence += 1;
      timers.set(sequence, { at: now + Math.max(0, delay), fn });
      return sequence;
    },
    clearTimeoutFn: (id) => timers.delete(id),
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        timers.delete(next[0]);
        now = Math.max(now, next[1].at);
        next[1].fn();
      }
      now = target;
    },
    pending: () => timers.size
  };
}

function engineFixture() {
  const clock = makeClock();
  const emitted = [];
  const states = [];
  const engine = new ReplayEngine({
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    now: clock.now,
    onBatch: (batch) => emitted.push(...batch),
    onStateChange: (status) => states.push(status.state)
  });
  return { clock, emitted, states, engine };
}

const minute = (offset, symbol = 'AAA') => ({
  eventId: `${symbol}-${offset}`,
  sessionId: 'replay-test-1',
  stockId: symbol === 'AAA' ? 1 : 2,
  symbol,
  instrumentKey: `NSE_EQ|${symbol}`,
  eventType: 'CANDLE',
  price: 100 + offset,
  providerTimestamp: new Date(Date.parse('2026-11-02T03:45:00.000Z') + offset * 60_000).toISOString(),
  sourceGranularity: 'ONE_MINUTE_CANDLE'
});

function loadMinutes(engine, offsets = [0, 1, 2, 3]) {
  engine.load({
    sessionId: 'replay-test-1',
    tradingDate: SESSION,
    granularity: 'ONE_MINUTE_CANDLE',
    events: offsets.map((offset) => minute(offset))
  });
}

test('playback emits each observation once, in order, at its historical spacing', () => {
  const { clock, emitted, engine } = engineFixture();
  loadMinutes(engine);

  assert.equal(engine.state, REPLAY_STATES.READY);
  engine.play(1);
  assert.equal(engine.state, REPLAY_STATES.PLAYING);

  clock.advance(0);
  assert.equal(emitted.length, 1, 'the first event fires immediately');

  clock.advance(59_999);
  assert.equal(emitted.length, 1, 'the next minute has not elapsed yet');

  clock.advance(1);
  assert.equal(emitted.length, 2);
  assert.deepEqual(
    emitted.map((event) => event.eventId),
    ['AAA-0', 'AAA-1']
  );
});

test('2x and 5x advance simulated time at the configured multiple', () => {
  const fast = engineFixture();
  loadMinutes(fast.engine);
  fast.engine.play(2);
  fast.clock.advance(0);
  fast.clock.advance(30_000);
  assert.equal(fast.emitted.length, 2, 'at 2x a one-minute gap takes 30s');
  fast.clock.advance(30_000);
  assert.equal(fast.emitted.length, 3);

  const faster = engineFixture();
  loadMinutes(faster.engine);
  faster.engine.play(5);
  faster.clock.advance(0);
  faster.clock.advance(12_000);
  assert.equal(faster.emitted.length, 2, 'at 5x a one-minute gap takes 12s');
});

test('pause freezes the cursor and the simulated clock, resume continues without duplicates', () => {
  const { clock, emitted, engine } = engineFixture();
  loadMinutes(engine);

  engine.play(1);
  clock.advance(0);
  const afterFirst = engine.status();
  assert.equal(afterFirst.clock.currentHistoricalTime, '2026-11-02T03:45:00.000Z');

  engine.pause();
  assert.equal(engine.state, REPLAY_STATES.PAUSED);
  clock.advance(300_000);
  assert.equal(emitted.length, 1, 'no events may be emitted while paused');
  assert.equal(engine.status().progress.processedEvents, 1);
  assert.equal(engine.status().clock.currentHistoricalTime, afterFirst.clock.currentHistoricalTime);

  engine.play();
  clock.advance(0);
  assert.equal(emitted.length, 2, 'resume continues from the next unprocessed event');
  assert.equal(engine.status().progress.processedEvents, 2);
});

test('a speed change keeps the cursor position', () => {
  const { clock, emitted, engine } = engineFixture();
  loadMinutes(engine);

  engine.play(1);
  clock.advance(0);
  const before = engine.status().progress.processedEvents;

  engine.setSpeed(10);
  assert.equal(engine.status().progress.processedEvents, before);
  assert.equal(engine.status().speed, 10);

  clock.advance(6_000);
  assert.equal(emitted.length, 2, 'at 10x the next minute arrives after 6s');
});

test('unsupported speeds are rejected without changing playback', () => {
  const { engine } = engineFixture();
  loadMinutes(engine);
  engine.play(1);
  assert.throws(() => engine.setSpeed(3), /speed must be one of/);
  assert.equal(engine.speed, 1);
  assert.equal(engine.state, REPLAY_STATES.PLAYING);
});

test('reset returns to the beginning and completion is detected once', () => {
  const { clock, emitted, engine } = engineFixture();
  loadMinutes(engine, [0, 1]);

  engine.play(1);
  clock.advance(0);
  clock.advance(60_000);
  assert.equal(engine.state, REPLAY_STATES.COMPLETED);
  assert.equal(emitted.length, 2);
  assert.equal(engine.status().progress.percentage, 100);

  assert.throws(() => engine.play(), /completed/);

  engine.reset();
  assert.equal(engine.state, REPLAY_STATES.READY);
  assert.equal(engine.status().progress.processedEvents, 0);
  assert.equal(engine.status().clock.currentHistoricalTime, '2026-11-02T03:45:00.000Z');

  engine.play(1);
  clock.advance(0);
  assert.equal(emitted.length, 3, 'a reset session can be replayed again');
});

test('repeated play requests do not duplicate emissions', () => {
  const { clock, emitted, engine } = engineFixture();
  loadMinutes(engine);

  engine.play(1);
  engine.play(1);
  engine.play(1);
  clock.advance(0);
  assert.equal(emitted.length, 1);
});

test('switching sessions invalidates the previous scheduler', () => {
  const { clock, emitted, engine } = engineFixture();
  loadMinutes(engine, [0, 1, 2]);
  engine.play(1);
  clock.advance(0);
  assert.equal(emitted.length, 1);

  engine.load({
    sessionId: 'replay-test-2',
    tradingDate: '2026-11-03',
    events: [minute(0), minute(1)].map((event) => ({ ...event, sessionId: 'replay-test-2' }))
  });
  assert.equal(engine.state, REPLAY_STATES.READY);
  clock.advance(600_000);
  assert.equal(emitted.length, 1, 'no event from the old session may still fire');
});

test('an empty session cannot be played', () => {
  const { engine } = engineFixture();
  engine.load({ sessionId: 'empty', tradingDate: SESSION, events: [] });
  assert.equal(engine.state, REPLAY_STATES.READY);
  assert.throws(() => engine.play(1), /no replayable events/);
});

/* ----------------------------------------------------------------- pipeline */

test('replayed observations enter the store with historical timestamps', () => {
  marketStore.registerStocks([
    { id: 1, symbol: 'AAA', company_name: 'Alpha Ltd', instrument_key: 'NSE_EQ|AAA', sector: 'IT', market_cap: 1000 }
  ]);
  marketStore.connection.mode = 'replay';
  marketStore.setReplayState({ state: 'PLAYING', sessionId: 'replay-test-1', clock: '2026-11-02T03:45:00.000Z', tradingDate: SESSION });

  const wallNow = new Date();
  const tick = {
    ...sanitizeTick({
      instrumentKey: 'NSE_EQ|AAA',
      lastPrice: 101,
      previousClose: 100,
      volume: 1000,
      lastTradedAt: '2026-11-02T03:45:00.000Z',
      open: 100,
      high: 102,
      low: 99
    }),
    candleAt: new Date('2026-11-02T03:45:00.000Z'),
    providerTimestamp: '2026-11-02T03:45:00.000Z',
    sourceGranularity: 'ONE_MINUTE_CANDLE',
    sessionId: 'replay-test-1'
  };

  assert.equal(processTick(tick), true);

  const quote = marketStore.getQuote(1);
  assert.equal(quote.price, 101);
  assert.equal(quote.changePct, 1);
  assert.equal(quote.sessionId, 'replay-test-1');
  assert.equal(quote.candleAt.toISOString(), '2026-11-02T03:45:00.000Z');
  assert.ok(quote.receivedAt.getTime() >= wallNow.getTime() - 1000, 'processing time stays on the wall clock');

  // Candle aggregation is bucketed by the historical minute, not the current one.
  const candle = getOpenCandle(1, '1m');
  assert.equal(candle.start.toISOString(), '2026-11-02T03:45:00.000Z');
  assert.equal(candle.close, 101);

  // The simulated clock decides freshness, so a paused replay does not go stale.
  assert.equal(marketStore.nowTs(), new Date('2026-11-02T03:45:00.000Z').getTime());
  assert.equal(marketStore.getDataStatus(quote), 'FRESH');
  assert.equal(marketStore.getMarketStatus().label, 'Session open (replay)');
});

test('the market store rejects duplicate and out-of-order replay events', () => {
  marketStore.registerStocks([
    { id: 1, symbol: 'AAA', company_name: 'Alpha Ltd', instrument_key: 'NSE_EQ|AAA', sector: 'IT', market_cap: 1000 }
  ]);
  const makeTick = (eventId, timestamp, price) => ({
    ...sanitizeTick({
      instrumentKey: 'NSE_EQ|AAA',
      lastPrice: price,
      previousClose: 100,
      volume: 1000,
      lastTradedAt: timestamp,
      open: 100,
      high: price,
      low: 99
    }),
    candleAt: new Date(timestamp),
    providerTimestamp: timestamp,
    sourceGranularity: 'ONE_MINUTE_CANDLE',
    sessionId: 'replay-order-test',
    eventId
  });

  assert.equal(processTick(makeTick('event-2', '2026-11-02T03:46:00.000Z', 102)), true);
  assert.equal(processTick(makeTick('event-2', '2026-11-02T03:46:00.000Z', 102)), false);
  assert.equal(processTick(makeTick('event-1', '2026-11-02T03:45:00.000Z', 101)), false);
  assert.equal(marketStore.getQuote(1).price, 102);
});
