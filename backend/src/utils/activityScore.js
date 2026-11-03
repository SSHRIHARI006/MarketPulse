import { round } from './validators.js';

/**
 * Combined unusual-activity score (0–100).
 *
 * This is an internally defined indicator, not an established financial metric.
 * It blends three observable signals, each normalised to 0–1:
 *   - relative volume,
 *   - absolute short-term price movement,
 *   - recent volatility compared with the stock's own historical volatility.
 */
export const ACTIVITY_WEIGHTS = { volume: 0.45, movement: 0.25, volatility: 0.3 };

const ratioToUnit = (value, ceiling) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value / ceiling);
};

export function computeActivityScore({ relativeVolume, priceMovePct, intradayVolatilityPct, volatilityPct }) {
  if (relativeVolume === null && priceMovePct === null && intradayVolatilityPct === null) return null;

  const volumeUnit = ratioToUnit((relativeVolume ?? 1) - 1, 2.5); // 3.5x volume -> max
  const movementUnit = ratioToUnit(Math.abs(priceMovePct ?? 0), 3); // 3% move -> max
  const volatilityUnit = ratioToUnit((intradayVolatilityPct ?? 0) / Math.max(volatilityPct ?? 1, 0.01), 1.5);

  const score =
    volumeUnit * ACTIVITY_WEIGHTS.volume * 100 +
    movementUnit * ACTIVITY_WEIGHTS.movement * 100 +
    volatilityUnit * ACTIVITY_WEIGHTS.volatility * 100;

  return round(Math.max(0, Math.min(100, score)), 1);
}

export function activityCategory(score) {
  if (score === null) return 'Unknown';
  if (score >= 80) return 'Very High';
  if (score >= 60) return 'High';
  if (score >= 30) return 'Moderate';
  return 'Normal';
}

export function severityFromScore(score) {
  if (score === null) return 'LOW';
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MODERATE';
  return 'LOW';
}
