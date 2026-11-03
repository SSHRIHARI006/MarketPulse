import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeQuote, mergeQuoteList, quoteTime } from '../src/lib/quoteMerge.js';

const quote = (patch) => ({
  stockId: 1,
  symbol: 'AAA',
  price: 100,
  receivedAt: '2026-11-03T10:00:00.000Z',
  ...patch
});

test('a replayed observation is ordered by its historical timestamp', () => {
  const older = quote({ price: 100, candleAt: '2026-11-02T09:15:00.000Z', sessionId: 's1' });
  const newer = quote({ price: 105, candleAt: '2026-11-02T09:16:00.000Z', sessionId: 's1' });

  const merged = mergeQuote(older, newer, 's1');
  assert.equal(merged.price, 105);

  // A late, older update must not roll the price back.
  assert.equal(mergeQuote(newer, older, 's1').price, 105);
});

test('a delayed snapshot cannot overwrite a newer update', () => {
  const live = quote({ price: 110, updatedAt: '2026-11-03T10:00:05.000Z' });
  const snapshot = quote({ price: 90, receivedAt: '2026-11-03T10:00:00.000Z' });
  assert.equal(mergeQuote(live, snapshot).price, 110);
});

test('duplicate events are ignored', () => {
  const existing = quote({ eventId: 's1:1', price: 100, candleAt: '2026-11-02T09:15:00.000Z', sessionId: 's1' });
  const duplicate = quote({ eventId: 's1:1', price: 100, candleAt: '2026-11-02T09:15:00.000Z', sessionId: 's1' });
  assert.equal(mergeQuote(existing, duplicate, 's1'), existing);
});

test('events from a superseded replay session are rejected', () => {
  const current = quote({ sessionId: 's2', price: 120, candleAt: '2026-11-03T09:16:00.000Z' });
  const staleSession = quote({ sessionId: 's1', price: 500, candleAt: '2026-11-03T09:20:00.000Z' });
  const merged = mergeQuote(current, staleSession, 's2');
  assert.equal(merged.price, 120, 'an old session must never corrupt the active one');
});

test('a partial update preserves fields it does not carry', () => {
  const existing = quote({ price: 100, volume: 5000, sector: 'IT', high: 101 });
  const partial = quote({ price: 101, volume: undefined, sector: null });
  const merged = mergeQuote(existing, partial);
  assert.equal(merged.price, 101);
  assert.equal(merged.volume, 5000, 'missing volume must be preserved');
  assert.equal(merged.sector, 'IT', 'a null field must not erase a known value');
  assert.equal(merged.high, 101);
});

test('a first observation is accepted as-is', () => {
  const incoming = quote({ price: 99 });
  assert.equal(mergeQuote(undefined, incoming), incoming);
  assert.equal(mergeQuote(null, null), null);
});

test('quotes without timestamps are merged rather than dropped', () => {
  const existing = quote({ price: 100, receivedAt: null, updatedAt: null });
  const incoming = quote({ price: 101, receivedAt: null, updatedAt: null });
  assert.equal(quoteTime(existing), null);
  assert.equal(mergeQuote(existing, incoming).price, 101);
});

test('a list merge applies the same policy per stock', () => {
  const cache = { 1: quote({ price: 100, sessionId: 's2', candleAt: '2026-11-03T09:15:00.000Z' }) };
  const next = mergeQuoteList(
    cache,
    [
      quote({ stockId: 1, price: 500, sessionId: 's1' }),
      quote({ stockId: 2, symbol: 'BBB', price: 50, sessionId: 's2', candleAt: '2026-11-03T09:15:00.000Z' })
    ],
    's2'
  );
  assert.equal(next[1].price, 100);
  assert.equal(next[2].price, 50);
});
