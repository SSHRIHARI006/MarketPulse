/** Pure statistical / technical indicators. No I/O, so they are unit-testable. */
import { round } from './validators.js';

export function sma(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const window = values.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / period;
}

export function ema(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const multiplier = 2 / (period + 1);
  // Seed with the SMA of the first `period` values, then apply the recursive form.
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < values.length; i += 1) {
    previous = (values[i] - previous) * multiplier + previous;
  }
  return previous;
}

/** Wilder's RSI over a 14-period window by default. */
export function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  const current = () => {
    if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
    const relativeStrength = averageGain / averageLoss;
    return 100 - 100 / (1 + relativeStrength);
  };
  let value = current();

  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    value = current();
  }

  return value;
}

export function mean(values) {
  if (!values?.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Population standard deviation. */
export function standardDeviation(values) {
  if (!values || values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Simple period-over-period returns (as fractions). */
export function returnsOf(values) {
  const returns = [];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > 0) returns.push(values[i] / values[i - 1] - 1);
  }
  return returns;
}

export function percentReturn(values, sessions) {
  if (!values || values.length < 2) return null;
  const window = values.slice(-(sessions + 1));
  if (window.length < 2) return null;
  const start = window[0];
  const end = window[window.length - 1];
  if (!(start > 0)) return null;
  return ((end - start) / start) * 100;
}

/**
 * Momentum score combining 5- and 20-session returns.
 *
 * Both returns are scaled to a comparable range (percent returns, equal weight)
 * and averaged, so short-term and medium-term momentum are both visible.
 */
export function momentumScore({ return5, return20 }) {
  if (return5 === null && return20 === null) return null;
  const shortTerm = return5 ?? 0;
  const mediumTerm = return20 ?? 0;
  return round(shortTerm * 0.6 + mediumTerm * 0.4, 2);
}

/** Annualised volatility (%) from periodic returns of a known frequency. */
export function annualisedVolatility(returns, periodsPerYear) {
  const sd = standardDeviation(returns);
  if (sd === null) return null;
  return round(sd * Math.sqrt(periodsPerYear) * 100, 2);
}

/** Simplified risk-adjusted score: mean return / std-dev of returns. */
export function riskAdjustedScore(returns) {
  const sd = standardDeviation(returns);
  if (!sd) return null;
  const avg = mean(returns);
  return round(avg / sd, 4);
}

/** Rescales prices so the first observation equals 100. */
export function normalisePrices(values, base = 100) {
  if (!values?.length || !(values[0] > 0)) return [];
  return values.map((value) => round((value / values[0]) * base, 2));
}

export const last = (values) => (values?.length ? values[values.length - 1] : null);

/** Clamps a value into [min, max]. */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
