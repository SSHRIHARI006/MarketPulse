import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInstrumentUpdates,
  indexInstrumentMaster,
  resolveInstrumentMappings
} from '../src/services/instrumentSync.js';

const instrument = (symbol, key, extra = {}) => ({
  segment: 'NSE_EQ',
  instrument_type: 'EQ',
  trading_symbol: symbol,
  instrument_key: key,
  isin: key.split('|')[1],
  ...extra
});

test('the master index only contains NSE cash equity', () => {
  const master = indexInstrumentMaster([
    instrument('AAA', 'NSE_EQ|INE001'),
    instrument('AAA', 'NSE_EQ|INEPARTLY', { instrument_type: 'SG' }),
    instrument('AAA', 'NSE_FO|12345', { segment: 'NSE_FO' }),
    instrument('BBB', 'NSE_EQ|INE002'),
    instrument('', 'NSE_EQ|INE003')
  ]);

  assert.deepEqual([...master.keys()], ['AAA', 'BBB']);
  assert.equal(master.get('AAA').length, 1);
});

test('valid mappings are updated, others keep their previous key and are reported', () => {
  const master = indexInstrumentMaster([
    instrument('AAA', 'NSE_EQ|INE001'),
    instrument('BBB', 'NSE_EQ|INE002'),
    instrument('BBB', 'NSE_EQ|INE002B'), // ambiguous
    instrument('DDD', 'NSE_EQ|INE004')
  ]);

  const stocks = [
    { id: 1, symbol: 'AAA', instrument_key: 'NSE_EQ|OLD1' },
    { id: 2, symbol: 'BBB', instrument_key: 'NSE_EQ|OLD2' },
    { id: 3, symbol: 'CCC', instrument_key: 'NSE_EQ|OLD3' },
    { id: 4, symbol: 'DDD', instrument_key: 'NSE_EQ|INE004' }
  ];

  const result = resolveInstrumentMappings(stocks, master);
  assert.equal(result.total, 4);
  assert.equal(result.resolved, 2);
  assert.deepEqual(result.updates.map((update) => [update.symbol, update.instrumentKey]), [['AAA', 'NSE_EQ|INE001']]);
  assert.equal(result.unchanged[0].symbol, 'DDD');
  assert.deepEqual(result.missing.map((entry) => entry.symbol), ['CCC']);
  assert.equal(result.missing[0].kept, 'NSE_EQ|OLD3', 'previous mapping is preserved');
  assert.deepEqual(result.ambiguous.map((entry) => entry.symbol), ['BBB']);
  assert.equal(result.ambiguous[0].kept, 'NSE_EQ|OLD2');
});

test('a provider key claimed by two stocks is never applied', () => {
  const master = indexInstrumentMaster([
    instrument('AAA', 'NSE_EQ|INE001'),
    instrument('BBB', 'NSE_EQ|INE001')
  ]);

  const result = resolveInstrumentMappings(
    [
      { id: 1, symbol: 'AAA', instrument_key: 'NSE_EQ|OLD1' },
      { id: 2, symbol: 'BBB', instrument_key: 'NSE_EQ|OLD2' }
    ],
    master
  );

  assert.equal(result.updates.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0].symbols.sort(), ['AAA', 'BBB']);
  assert.equal(result.ambiguous.length, 2);
});

test('only verified mappings reach the database', async () => {
  const calls = [];
  const runQuery = async (sql, params) => calls.push({ sql, params });

  const applied = await applyInstrumentUpdates(
    [{ id: 7, symbol: 'AAA', instrumentKey: 'NSE_EQ|INE001', previous: 'NSE_EQ|OLD' }],
    runQuery
  );

  assert.equal(applied, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['NSE_EQ|INE001', 7]);
});
