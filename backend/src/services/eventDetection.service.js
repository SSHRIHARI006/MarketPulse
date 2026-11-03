import { query } from '../config/database.js';
import { config } from '../config/env.js';
import { marketStore } from './marketStore.js';
import { getStockMetrics } from './analytics.service.js';
import { activityCategory, computeActivityScore, severityFromScore } from '../utils/activityScore.js';
import { round } from '../utils/validators.js';

let timer = null;
let running = false;

/** Historical per-minute volatility implied by the annualised daily figure. */
const impliedMinuteVol = (annualisedPct) => (annualisedPct ?? 0) / Math.sqrt(252) / Math.sqrt(375);

function buildCandidates(metric) {
  const candidates = [];
  const score = computeActivityScore({
    relativeVolume: metric.relativeVolume,
    priceMovePct: metric.priceMovePct,
    intradayVolatilityPct: metric.intradayVolatilityPct,
    volatilityPct: metric.volatilityPct
  });

  if (metric.relativeVolume !== null && metric.relativeVolume >= config.detection.volumeSpikeRatio) {
    candidates.push({
      type: 'VOLUME_SPIKE',
      severity: metric.relativeVolume >= config.detection.volumeSpikeRatio * 2 ? 'HIGH' : 'MODERATE',
      score,
      description:
        `Volume is ${metric.relativeVolume}x its comparable historical average ` +
        `(${formatVolume(metric.volume)} traded vs ${formatVolume(metric.averageDailyVolume)} expected so far this session).`
    });
  }

  if (
    metric.priceMovePct !== null &&
    Math.abs(metric.priceMovePct) >= config.detection.priceMovePct
  ) {
    const rising = metric.priceMovePct > 0;
    candidates.push({
      type: rising ? 'PRICE_SURGE' : 'PRICE_DROP',
      severity: Math.abs(metric.priceMovePct) >= config.detection.priceMovePct * 2 ? 'HIGH' : 'MODERATE',
      score,
      description: `${rising ? 'Surged' : 'Dropped'} ${Math.abs(metric.priceMovePct).toFixed(2)}% in the last ${config.detection.priceMoveWindowMinutes} minutes.`
    });
  }

  const threshold = config.detection.volatilitySpikeMultiple * impliedMinuteVol(metric.volatilityPct);
  if (metric.intradayVolatilityPct !== null && threshold > 0 && metric.intradayVolatilityPct >= threshold) {
    const multiple = round(metric.intradayVolatilityPct / impliedMinuteVol(metric.volatilityPct), 2);
    candidates.push({
      type: 'VOLATILITY_SPIKE',
      severity: multiple >= config.detection.volatilitySpikeMultiple * 2 ? 'HIGH' : 'MODERATE',
      score,
      description: `Recent 1-minute volatility is ${multiple}x this stock's historical volatility.`
    });
  }

  if (score !== null && score >= 60) {
    candidates.push({
      type: 'UNUSUAL_ACTIVITY',
      severity: severityFromScore(score),
      score,
      description: `Combined activity score ${score}/100 (${activityCategory(score)}).`
    });
  }

  return candidates;
}

function formatVolume(value) {
  if (value === null || value === undefined) return 'n/a';
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)} Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)} L`;
  return value.toLocaleString('en-IN');
}

async function recentEventKeys() {
  const { rows } = await query(
    `SELECT stock_id, event_type
     FROM market_events
     WHERE detected_at > now() - ($1 || ' minutes')::interval`,
    [String(config.detection.eventCooldownMinutes)]
  );
  return new Set(rows.map((row) => `${row.stock_id}:${row.event_type}`));
}

/** Runs every detector once, inserting events that pass the cooldown filter. */
export async function evaluateDetectors() {
  if (running) return [];
  const freshness = marketStore.getFreshness();
  if (freshness.stale) return [];

  running = true;
  try {
    const metrics = await getStockMetrics();
    const existing = await recentEventKeys();
    const created = [];

    for (const metric of metrics) {
      if (metric.price === null) continue;
      for (const candidate of buildCandidates(metric)) {
        const key = `${metric.stockId}:${candidate.type}`;
        if (existing.has(key)) continue; // cooldown / duplicate suppression

        const { rows } = await query(
          `INSERT INTO market_events (stock_id, event_type, severity, activity_score, description, detected_at)
           VALUES ($1, $2, $3, $4, $5, now())
           RETURNING id, detected_at`,
          [metric.stockId, candidate.type, candidate.severity, candidate.score, candidate.description]
        );

        const event = {
          id: Number(rows[0].id),
          stockId: metric.stockId,
          symbol: metric.symbol,
          companyName: metric.companyName,
          eventType: candidate.type,
          severity: candidate.severity,
          activityScore: candidate.score,
          description: candidate.description,
          detectedAt: new Date(rows[0].detected_at).toISOString()
        };
        created.push(event);
        marketStore.emit('event', event);
        existing.add(key);
      }
    }

    return created;
  } catch (error) {
    console.error('[detection] evaluation failed:', error.message);
    return [];
  } finally {
    running = false;
  }
}

export function startEventDetection() {
  if (timer) return;
  timer = setInterval(() => {
    evaluateDetectors().catch(() => {});
  }, config.detection.evaluationIntervalMs);
  console.log(`[detection] running every ${config.detection.evaluationIntervalMs}ms`);
}

export function stopEventDetection() {
  clearInterval(timer);
  timer = null;
}
