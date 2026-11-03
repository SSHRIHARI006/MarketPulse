import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annualisedVolatility,
  ema,
  momentumScore,
  normalisePrices,
  percentReturn,
  returnsOf,
  riskAdjustedScore,
  rsi,
  sma,
  standardDeviation
} from '../src/utils/indicators.js';

test('sma returns null until the window is filled, then averages the tail', () => {
  assert.equal(sma([1, 2, 3], 5), null);
  assert.equal(sma([1, 2, 3, 4, 5], 5), 3);
  assert.equal(sma([10, 20, 30, 40], 2), 35);
});

test('ema seeds from the SMA and weights the latest value more heavily', () => {
  const values = [1, 2, 3, 4, 5, 6];
  const period = 3;
  const seed = (1 + 2 + 3) / 3;
  const multiplier = 2 / (period + 1);
  const expected = values.slice(3).reduce((previous, value) => (value - previous) * multiplier + previous, seed);
  assert.equal(ema(values, period), expected);
  assert.equal(ema([1, 2], 3), null);
});

test('rsi is 100 for a strictly rising series and 50 for a flat series', () => {
  const rising = Array.from({ length: 20 }, (_, index) => 100 + index);
  assert.equal(rsi(rising, 14).toFixed(4), '100.0000');
  const flat = Array.from({ length: 20 }, () => 100);
  assert.equal(rsi(flat, 14), 50);
  assert.equal(rsi([1, 2, 3], 14), null);
});

test('rsi stays between 0 and 100 on mixed data', () => {
  const values = [100, 102, 101, 105, 104, 103, 107, 106, 108, 109, 105, 104, 106, 110, 108, 111, 109, 112, 115, 113];
  const value = rsi(values, 14);
  assert.ok(value > 0 && value < 100, `rsi out of range: ${value}`);
});

test('percentReturn uses only the requested session window', () => {
  const closes = [100, 101, 102, 103, 104, 110];
  assert.equal(percentReturn(closes, 5).toFixed(2), '10.00');
  assert.equal(percentReturn(closes, 1).toFixed(2), '5.77');
  assert.equal(percentReturn([100], 5), null);
});

test('returnsOf and standardDeviation behave on simple series', () => {
  assert.deepEqual(returnsOf([100, 110, 99]), [0.10000000000000009, -0.09999999999999998]);
  assert.equal(standardDeviation([2, 2, 2]), 0);
  assert.equal(standardDeviation([1]), null);
});

test('momentum score blends short and medium term returns', () => {
  assert.equal(momentumScore({ return5: 3, return20: 8 }), 5);
  assert.equal(momentumScore({ return5: 2, return20: null }), 1.2);
  assert.equal(momentumScore({ return5: null, return20: null }), null);
});

test('risk-adjusted score handles zero-variance returns', () => {
  assert.equal(riskAdjustedScore([0.01, 0.01, 0.01]), null);
  assert.ok(riskAdjustedScore([0.02, -0.01, 0.03, 0]) > 0);
});

test('annualised volatility scales periodic standard deviation', () => {
  const returns = [0.01, -0.01, 0.02, -0.02];
  const expected = standardDeviation(returns) * Math.sqrt(252) * 100;
  assert.ok(Math.abs(annualisedVolatility(returns, 252) - expected) < 0.01);
});

test('normalisePrices rebases the series to 100', () => {
  assert.deepEqual(normalisePrices([50, 75, 100]), [100, 150, 200]);
  assert.deepEqual(normalisePrices([]), []);
});
