import {
  getComparison,
  getInsights,
  getMomentumRanking,
  getSectorPerformance,
  getStockMetrics,
  getVolatilityRanking,
  getVolumeSpikes,
  getActivity
} from '../services/analytics.service.js';
import { validateLimit } from '../utils/validators.js';

export async function momentum(req, res) {
  res.json({ rankings: await getMomentumRanking() });
}

export async function volatility(req, res) {
  res.json(await getVolatilityRanking());
}

export async function volumeSpikes(req, res) {
  res.json(await getVolumeSpikes());
}

export async function sectors(req, res) {
  res.json(await getSectorPerformance());
}

export async function activity(req, res) {
  res.json(await getActivity(validateLimit(req.query.limit, 50)));
}

export async function compare(req, res) {
  const ids = req.query.ids ? String(req.query.ids) : req.query.stockIds;
  res.json(await getComparison({ ids, windowSessions: req.query.window || 60 }));
}

export async function insights(req, res) {
  res.json(await getInsights());
}

/** Every ranking in one call, so the dashboard needs a single round-trip. */
export async function intelligence(req, res) {
  const [metrics, momentumRanking, volatilityRanking] = await Promise.all([
    getStockMetrics(),
    getMomentumRanking(),
    getVolatilityRanking()
  ]);

  const nearHigh = [...metrics]
    .filter((metric) => metric.fromHigh52wPct !== null)
    .sort((a, b) => b.fromHigh52wPct - a.fromHigh52wPct)
    .slice(0, 10)
    .map((metric) => ({
      stockId: metric.stockId,
      symbol: metric.symbol,
      companyName: metric.companyName,
      price: metric.price,
      high52w: metric.high52w,
      fromHigh52wPct: metric.fromHigh52wPct
    }));

  const nearLow = [...metrics]
    .filter((metric) => metric.fromLow52wPct !== null)
    .sort((a, b) => a.fromLow52wPct - b.fromLow52wPct)
    .slice(0, 10)
    .map((metric) => ({
      stockId: metric.stockId,
      symbol: metric.symbol,
      companyName: metric.companyName,
      price: metric.price,
      low52w: metric.low52w,
      fromLow52wPct: metric.fromLow52wPct
    }));

  res.json({
    momentum: momentumRanking,
    relativeVolume: [...metrics]
      .filter((metric) => metric.relativeVolume !== null)
      .sort((a, b) => b.relativeVolume - a.relativeVolume)
      .map((metric) => ({
        stockId: metric.stockId,
        symbol: metric.symbol,
        relativeVolume: metric.relativeVolume,
        volume: metric.volume,
        averageDailyVolume: metric.averageDailyVolume
      })),
    riskAdjusted: [...metrics]
      .filter((metric) => metric.riskAdjustedScore !== null)
      .sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore)
      .map((metric) => ({
        stockId: metric.stockId,
        symbol: metric.symbol,
        riskAdjustedScore: metric.riskAdjustedScore,
        volatilityPct: metric.volatilityPct,
        return20: metric.return20
      })),
    volatility: volatilityRanking,
    near52WeekHigh: nearHigh,
    near52WeekLow: nearLow,
    activity: (await getActivity(10)).activity
  });
}
