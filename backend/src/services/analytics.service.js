import { query } from '../config/database.js';
import { config, historySource } from '../config/env.js';
import { marketStore } from './marketStore.js';
import {
  annualisedVolatility,
  clamp,
  ema,
  momentumScore,
  normalisePrices,
  percentReturn,
  returnsOf,
  riskAdjustedScore,
  rsi,
  sma,
  standardDeviation
} from '../utils/indicators.js';
import { activityCategory, computeActivityScore } from '../utils/activityScore.js';
import { latestSessionStart, isMarketOpen, sessionStartUtc, sessionEndUtc } from '../utils/time.js';
import { percentChange, round, toInt, ValidationError } from '../utils/validators.js';

const CACHE_TTL_MS = 5000;
let frameCache = { at: 0, promise: null };

/** Loads the analysis frame (daily history + intraday bars) with a short TTL. */
export async function loadFrame({ force = false } = {}) {
  const fresh = Date.now() - frameCache.at < CACHE_TTL_MS;
  if (!force && fresh && frameCache.promise) return frameCache.promise;

  // Analytics only ever compare observations from the active data mode, so demo
  // history cannot leak into LIVE rankings (and vice versa). A replay reads the
  // dataset it is replaying.
  const source = historySource();

  const promise = (async () => {
    const [stocks, daily, intraday, references] = await Promise.all([
      query(
        `SELECT s.id, s.symbol, s.company_name, s.instrument_key, s.exchange, s.market_cap,
                s.sector_id, COALESCE(sec.name, 'Unclassified') AS sector
         FROM stocks s
         LEFT JOIN sectors sec ON sec.id = s.sector_id
         WHERE s.is_active = TRUE
         ORDER BY s.id`
      ),
      query(
        `SELECT stock_id, candle_start, open, high, low, close, volume
         FROM stock_candles
         WHERE interval = '1d' AND source = $1
         ORDER BY stock_id, candle_start`,
        [source]
      ),
      query(
        `SELECT stock_id, candle_start, close, volume
         FROM stock_candles
         WHERE interval = '1m' AND candle_start >= $1 AND source = $2
         ORDER BY stock_id, candle_start`,
        // The simulated clock, not the wall clock, decides which session's intraday
        // bars belong to a replay.
        [latestSessionStart(new Date(marketStore.nowTs())).toISOString(), source]
      ),
      query('SELECT stock_id, high_52w, low_52w, avg_daily_vol FROM stock_reference WHERE source = $1', [source])
    ]);

    const frame = new Map();
    for (const row of stocks.rows) {
      frame.set(row.id, {
        stock: {
          id: row.id,
          symbol: row.symbol,
          companyName: row.company_name,
          instrumentKey: row.instrument_key,
          exchange: row.exchange,
          marketCap: Number(row.market_cap || 0),
          sectorId: row.sector_id,
          sector: row.sector
        },
        daily: [],
        intraday: [],
        reference: null
      });
    }

    for (const row of daily.rows) {
      const entry = frame.get(row.stock_id);
      if (!entry) continue;
      entry.daily.push({
        ts: new Date(row.candle_start).getTime(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume || 0)
      });
    }

    for (const row of intraday.rows) {
      const entry = frame.get(row.stock_id);
      if (!entry) continue;
      entry.intraday.push({ ts: new Date(row.candle_start).getTime(), close: Number(row.close), volume: Number(row.volume || 0) });
    }

    for (const row of references.rows) {
      const entry = frame.get(row.stock_id);
      if (!entry) continue;
      entry.reference = {
        high52w: row.high_52w === null ? null : Number(row.high_52w),
        low52w: row.low_52w === null ? null : Number(row.low_52w),
        avgDailyVolume: row.avg_daily_vol === null ? null : Number(row.avg_daily_vol)
      };
    }

    return frame;
  })();

  frameCache = { at: Date.now(), promise };
  try {
    return await promise;
  } catch (error) {
    frameCache = { at: 0, promise: null };
    throw error;
  }
}

export function invalidateFrameCache() {
  frameCache = { at: 0, promise: null };
}

/** Fraction of the trading session elapsed, used to annualise partial-day volume. */
function sessionElapsedFraction(now = new Date()) {
  if (!isMarketOpen(now)) return 1;
  const start = sessionStartUtc(now);
  const end = sessionEndUtc(now);
  return clamp((now - start) / (end - start), 0.05, 1);
}

/**
 * Per-stock analytical metrics:
 * momentum (5/20-session), realised volatility, relative volume, risk-adjusted
 * score and 52-week distance. Everything is derived from stored data.
 */
export async function getStockMetrics({ force = false } = {}) {
  const frame = await loadFrame({ force });
  const elapsed = sessionElapsedFraction();
  const metrics = [];

  for (const entry of frame.values()) {
    const { stock, daily, intraday, reference } = entry;
    const closes = daily.map((bar) => bar.close);
    const volumes = daily.map((bar) => bar.volume);
    const quote = marketStore.getQuote(stock.id);

    const currentPrice = quote?.price ?? closes[closes.length - 1] ?? null;
    const previousClose = quote?.previousClose ?? closes[closes.length - 1] ?? null;
    const dailyChangePct =
      quote?.changePct ?? (currentPrice && previousClose ? round(percentChange(currentPrice, previousClose), 2) : null);

    const return5 = percentReturn(closes, config.analysis.momentumShortSessions);
    const return20 = percentReturn(closes, config.analysis.momentumLongSessions);
    const dailyReturns = returnsOf(closes.slice(-(config.analysis.riskWindowSessions + 1)));
    const volatilityPct = annualisedVolatility(dailyReturns, 252);
    const intradayCloses = intraday.map((bar) => bar.close);
    // Missing observations stay null; they must never be reported as zero volatility.
    const intradayStdDev = standardDeviation(returnsOf(intradayCloses));
    const intradayVolatilityPct = intradayStdDev === null ? null : round(intradayStdDev * 100, 3);

    const lookbackVolumes = volumes.slice(-config.analysis.relativeVolumeLookbackSessions);
    const averageDailyVolume = average(lookbackVolumes) ?? reference?.avgDailyVolume ?? null;
    const expectedVolume = averageDailyVolume ? averageDailyVolume * elapsed : null;
    const currentVolume = quote?.volume ?? intraday.reduce((sum, bar) => sum + bar.volume, 0);
    const relativeVolume = expectedVolume && expectedVolume > 0 && Number.isFinite(currentVolume)
      ? round(currentVolume / expectedVolume, 2)
      : null;

    // Short-horizon movement used by the sudden-movement detector and activity score.
    const moveWindowMs = config.detection.priceMoveWindowMinutes * 60 * 1000;
    const moveBaseline = marketStore.priceAtOrAfter(stock.id, Date.now() - moveWindowMs);
    const priceMovePct =
      moveBaseline && currentPrice ? round(percentChange(currentPrice, moveBaseline.price), 2) : null;

    const activityScore = computeActivityScore({
      relativeVolume,
      priceMovePct,
      intradayVolatilityPct,
      volatilityPct
    });

    const high52w = reference?.high52w ?? (daily.length ? Math.max(...daily.slice(-252).map((bar) => bar.high)) : null);
    const low52w = reference?.low52w ?? (daily.length ? Math.min(...daily.slice(-252).map((bar) => bar.low)) : null);

    metrics.push({
      stockId: stock.id,
      symbol: stock.symbol,
      companyName: stock.companyName,
      sector: stock.sector,
      marketCap: stock.marketCap,
      price: currentPrice,
      previousClose,
      changePct: dailyChangePct,
      changeAbs: currentPrice !== null && previousClose !== null ? round(currentPrice - previousClose, 2) : null,
      volume: Number.isFinite(currentVolume) ? currentVolume : null,
      open: quote?.open ?? (daily.length ? daily[daily.length - 1].open : null),
      high: quote?.high ?? (daily.length ? daily[daily.length - 1].high : null),
      low: quote?.low ?? (daily.length ? daily[daily.length - 1].low : null),
      averagePrice: quote?.averagePrice ?? null,
      updatedAt: quote?.updatedAt ?? null,
      stale: quote?.stale ?? true,
      sessions: daily.length,
      return5: return5 === null ? null : round(return5, 2),
      return20: return20 === null ? null : round(return20, 2),
      momentumScore: momentumScore({ return5, return20 }),
      volatilityPct,
      intradayVolatilityPct,
      riskAdjustedScore: riskAdjustedScore(dailyReturns),
      averageDailyVolume: averageDailyVolume === null ? null : Math.round(averageDailyVolume),
      relativeVolume,
      priceMovePct,
      activityScore,
      activityCategory: activityCategory(activityScore),
      high52w,
      low52w,
      fromHigh52wPct:
        high52w && currentPrice ? round(((currentPrice - high52w) / high52w) * 100, 2) : null,
      fromLow52wPct:
        low52w && currentPrice ? round(((currentPrice - low52w) / low52w) * 100, 2) : null
    });
  }

  return metrics;
}

const average = (values) => (values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

const byDesc = (key) => (a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity);
const byAsc = (key) => (a, b) => (a[key] ?? Infinity) - (b[key] ?? Infinity);

/** Market overview: indices, tracked-universe breadth and dispersion. */
export async function getMarketOverview() {
  const metrics = await getStockMetrics();
  const priced = metrics.filter((metric) => metric.changePct !== null);
  const advancing = priced.filter((metric) => metric.changePct > config.heatmap.neutralBandPct).length;
  const declining = priced.filter((metric) => metric.changePct < -config.heatmap.neutralBandPct).length;
  const sorted = [...priced].sort(byDesc('changePct'));

  return {
    mode: marketStore.connection.mode,
    scope: `Tracked universe (${metrics.length} stocks)`,
    indices: marketStore.getIndices().map((index) => ({
      ...index,
      note: marketStore.connection.mode === 'live' ? 'Provider index feed' : 'Demo simulation'
    })),
    breadth: {
      advancing,
      declining,
      unchanged: priced.length - advancing - declining,
      // `available` is the denominator for breadth; `tracked` is the universe size.
      available: priced.length,
      tracked: metrics.length
    },
    averageChangePct: priced.length
      ? round(priced.reduce((sum, metric) => sum + metric.changePct, 0) / priced.length, 2)
      : null,
    volatilityPct: (() => {
      const available = metrics.map((metric) => metric.volatilityPct).filter((value) => Number.isFinite(value));
      return available.length ? round(average(available), 2) : null;
    })(),
    dispersionPct: priced.length > 1 ? round(standardDeviation(priced.map((m) => m.changePct)) ?? 0, 2) : null,
    topPerformer: sorted[0] ? pickMover(sorted[0]) : null,
    biggestDecliner: sorted.length ? pickMover(sorted[sorted.length - 1]) : null,
    marketStatus: marketStore.getMarketStatus(),
    freshness: marketStore.getFreshness(),
    generatedAt: new Date().toISOString()
  };
}

function pickMover(metric) {
  return {
    stockId: metric.stockId,
    symbol: metric.symbol,
    companyName: metric.companyName,
    sector: metric.sector,
    price: metric.price,
    changePct: metric.changePct,
    volume: metric.volume,
    updatedAt: metric.updatedAt
  };
}

export async function getMovers() {
  const metrics = (await getStockMetrics()).filter((metric) => metric.price !== null);
  const byPerformance = [...metrics].sort(byDesc('changePct'));
  const byRelativeVolume = [...metrics].filter((m) => m.relativeVolume !== null).sort(byDesc('relativeVolume'));
  const byIntradayVol = [...metrics]
    .filter((metric) => Number.isFinite(metric.intradayVolatilityPct))
    .sort(byDesc('intradayVolatilityPct'));

  return {
    topPerformer: byPerformance[0] ? pickMover(byPerformance[0]) : null,
    biggestDecliner: byPerformance.length ? pickMover(byPerformance[byPerformance.length - 1]) : null,
    highestRelativeVolume: byRelativeVolume[0]
      ? { ...pickMover(byRelativeVolume[0]), relativeVolume: byRelativeVolume[0].relativeVolume }
      : null,
    mostVolatile: byIntradayVol[0]
      ? { ...pickMover(byIntradayVol[0]), intradayVolatilityPct: byIntradayVol[0].intradayVolatilityPct }
      : null,
    generatedAt: new Date().toISOString()
  };
}

export async function getMomentumRanking() {
  const metrics = (await getStockMetrics()).filter((metric) => metric.momentumScore !== null);
  return [...metrics]
    .sort(byDesc('momentumScore'))
    .map((metric) => ({
      stockId: metric.stockId,
      symbol: metric.symbol,
      companyName: metric.companyName,
      sector: metric.sector,
      price: metric.price,
      changePct: metric.changePct,
      return5: metric.return5,
      return20: metric.return20,
      momentumScore: metric.momentumScore
    }));
}

export async function getVolatilityRanking() {
  const metrics = (await getStockMetrics()).filter((metric) => metric.volatilityPct !== null);
  const ranked = [...metrics].sort(byDesc('volatilityPct')).map((metric) => ({
    stockId: metric.stockId,
    symbol: metric.symbol,
    companyName: metric.companyName,
    sector: metric.sector,
    volatilityPct: metric.volatilityPct,
    intradayVolatilityPct: metric.intradayVolatilityPct,
    riskAdjustedScore: metric.riskAdjustedScore
  }));

  return {
    highest: ranked.slice(0, 5),
    lowest: [...ranked].slice(-5).reverse(),
    all: ranked,
    windowSessions: config.analysis.volatilityWindowSessions
  };
}

export async function getVolumeSpikes() {
  const metrics = await getStockMetrics();
  const threshold = config.detection.volumeSpikeRatio;
  const flagged = metrics
    .filter((metric) => metric.relativeVolume !== null && metric.relativeVolume >= threshold)
    .sort(byDesc('relativeVolume'))
    .map((metric) => ({
      stockId: metric.stockId,
      symbol: metric.symbol,
      companyName: metric.companyName,
      sector: metric.sector,
      relativeVolume: metric.relativeVolume,
      volume: metric.volume,
      averageDailyVolume: metric.averageDailyVolume,
      price: metric.price,
      changePct: metric.changePct
    }));

  const events = (await query(
    `SELECT e.id, e.stock_id, s.symbol, s.company_name, e.event_type, e.severity,
            e.activity_score, e.description, e.detected_at
     FROM market_events e
     JOIN stocks s ON s.id = e.stock_id
     WHERE e.event_type = 'VOLUME_SPIKE'
     ORDER BY e.detected_at DESC
     LIMIT 50`
  )).rows;

  return { threshold, flagged, events: events.map(mapEventRow), generatedAt: new Date().toISOString() };
}

export function mapEventRow(row) {
  return {
    id: Number(row.id),
    stockId: row.stock_id,
    symbol: row.symbol,
    companyName: row.company_name,
    eventType: row.event_type,
    severity: row.severity,
    activityScore: row.activity_score === null ? null : Number(row.activity_score),
    description: row.description,
    detectedAt: new Date(row.detected_at).toISOString()
  };
}

export async function getSectorPerformance() {
  const metrics = await getStockMetrics();
  const groups = new Map();

  for (const metric of metrics) {
    const group = groups.get(metric.sector) || {
      sector: metric.sector,
      stocks: 0,
      sumChange: 0,
      counted: 0,
      advancing: 0,
      declining: 0,
      marketCap: 0,
      volatility: []
    };
    group.stocks += 1;
    group.marketCap += metric.marketCap || 0;
    if (metric.changePct !== null) {
      group.sumChange += metric.changePct;
      group.counted += 1;
      if (metric.changePct > config.heatmap.neutralBandPct) group.advancing += 1;
      if (metric.changePct < -config.heatmap.neutralBandPct) group.declining += 1;
    }
    if (metric.volatilityPct !== null) group.volatility.push(metric.volatilityPct);
    groups.set(metric.sector, group);
  }

  const sectors = [...groups.values()]
    .map((group) => ({
      sector: group.sector,
      stocks: group.stocks,
      averageChangePct: group.counted ? round(group.sumChange / group.counted, 2) : null,
      advancing: group.advancing,
      declining: group.declining,
      marketCap: group.marketCap,
      averageVolatilityPct: group.volatility.length ? round(average(group.volatility), 2) : null,
      members: metrics
        .filter((metric) => metric.sector === group.sector)
        .sort(byDesc('changePct'))
        .map((metric) => ({
          stockId: metric.stockId,
          symbol: metric.symbol,
          companyName: metric.companyName,
          price: metric.price,
          changePct: metric.changePct,
          volatilityPct: metric.volatilityPct,
          relativeVolume: metric.relativeVolume
        }))
    }))
    .sort(byDesc('averageChangePct'));

  return {
    sectors,
    best: sectors[0] || null,
    worst: sectors.length ? sectors[sectors.length - 1] : null,
    generatedAt: new Date().toISOString()
  };
}

export async function getActivity(limit = 50) {
  const { rows } = await query(
    `SELECT e.id, e.stock_id, s.symbol, s.company_name, e.event_type, e.severity,
            e.activity_score, e.description, e.detected_at
     FROM market_events e
     JOIN stocks s ON s.id = e.stock_id
     ORDER BY e.detected_at DESC
     LIMIT $1`,
    [limit]
  );

  const metrics = await getStockMetrics();
  const scored = metrics
    .filter((metric) => metric.activityScore !== null)
    .sort((a, b) => (b.activityScore ?? 0) - (a.activityScore ?? 0))
    .map((metric) => ({
      stockId: metric.stockId,
      symbol: metric.symbol,
      companyName: metric.companyName,
      relativeVolume: metric.relativeVolume,
      priceMovePct: metric.priceMovePct,
      changePct: metric.changePct,
      activityScore: metric.activityScore,
      activityCategory: metric.activityCategory
    }));

  return {
    events: rows.map(mapEventRow),
    activity: scored,
    generatedAt: new Date().toISOString()
  };
}

/** Stock detail analytics: quote fields, indicators and historical ranges. */
export async function getStockAnalytics(stockId) {
  const id = toInt(stockId, null);
  if (id === null) throw new ValidationError('Invalid stock id');

  const stockRow = (await query(
    `SELECT s.*, COALESCE(sec.name, 'Unclassified') AS sector
     FROM stocks s LEFT JOIN sectors sec ON sec.id = s.sector_id
     WHERE s.id = $1`,
    [id]
  )).rows[0];
  if (!stockRow) throw new ValidationError('Stock not found', 404);

  const metrics = (await getStockMetrics()).find((metric) => metric.stockId === id) || null;
  const closeSeries = (await query(
    `SELECT close FROM stock_candles
     WHERE stock_id = $1 AND interval = '1d' AND source = $2
     ORDER BY candle_start`,
    [id, historySource()]
  )).rows.map((row) => Number(row.close));

  return {
    stock: {
      id: stockRow.id,
      symbol: stockRow.symbol,
      companyName: stockRow.company_name,
      instrumentKey: stockRow.instrument_key,
      exchange: stockRow.exchange,
      sector: stockRow.sector,
      marketCap: Number(stockRow.market_cap || 0)
    },
    quote: marketStore.getQuote(id),
    metrics,
    indicators: {
      sma20: round(sma(closeSeries, 20), 2),
      sma50: round(sma(closeSeries, 50), 2),
      ema20: round(ema(closeSeries, 20), 2),
      rsi14: round(rsi(closeSeries, 14), 2)
    },
    generatedAt: new Date().toISOString()
  };
}

const HISTORY_INTERVALS = new Set(['1m', '5m', '15m', '1d']);

/** Candle history for the detail chart, with indicator overlays. */
export async function getStockHistory(stockId, { interval = '5m', limit = 200 } = {}) {
  const id = toInt(stockId, null);
  if (id === null) throw new ValidationError('Invalid stock id');
  if (!HISTORY_INTERVALS.has(interval)) {
    throw new ValidationError(`interval must be one of: ${[...HISTORY_INTERVALS].join(', ')}`);
  }
  const capped = clamp(toInt(limit, 200) ?? 200, 10, 1000);

  const { rows } = await query(
    `SELECT candle_start, open, high, low, close, volume
     FROM stock_candles
     WHERE stock_id = $1 AND interval = $2 AND source = $4
     ORDER BY candle_start DESC
     LIMIT $3`,
    [id, interval, capped, historySource()]
  );

  const candles = rows
    .map((row) => ({
      time: new Date(row.candle_start).toISOString(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume || 0)
    }))
    .reverse();

  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);

  return {
    stockId: id,
    interval,
    candles,
    indicators: {
      sma20: trailingSma(closes, 20),
      sma50: trailingSma(closes, 50),
      ema20: trailingEma(closes, 20),
      rsi14: trailingRsi(closes, 14)
    },
    volumeStats: {
      highest: candles.length ? Math.max(...volumes) : null,
      average: volumes.length ? Math.round(average(volumes)) : null
    }
  };
}

/** Rolling SMA aligned to the candle series (null until enough data exists). */
function trailingSma(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    return round(sma(values.slice(0, index + 1), period), 2);
  });
}

function trailingEma(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    return round(ema(values.slice(0, index + 1), period), 2);
  });
}

function trailingRsi(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period + 1) return null;
    return round(rsi(values.slice(0, index + 1), period), 2);
  });
}

/** Side-by-side comparison, normalised to 100 at the start of the window. */
export async function getComparison({ ids, windowSessions = 60 } = {}) {
  const parsed = (Array.isArray(ids) ? ids : String(ids || '').split(','))
    .map((value) => toInt(value, null))
    .filter((value) => value !== null);

  if (parsed.length < 2) throw new ValidationError('Select at least two stock ids to compare');
  if (parsed.length > 3) throw new ValidationError('Compare at most three stocks');

  const frame = await loadFrame();
  const metrics = await getStockMetrics();

  const series = parsed.map((id) => {
    const entry = frame.get(id);
    if (!entry) throw new ValidationError(`Stock ${id} not found`, 404);
    const bars = entry.daily.slice(-windowSessions);
    const normalised = normalisePrices(bars.map((bar) => bar.close));
    return {
      stockId: id,
      symbol: entry.stock.symbol,
      companyName: entry.stock.companyName,
      sector: entry.stock.sector,
      points: bars.map((bar, index) => ({
        index,
        time: new Date(bar.ts).toISOString(),
        close: bar.close,
        normalised: normalised[index] ?? null
      })),
      metrics: metrics.find((metric) => metric.stockId === id) || null
    };
  });

  return {
    windowSessions,
    series: series.map((entry) => ({
      stockId: entry.stockId,
      symbol: entry.symbol,
      companyName: entry.companyName,
      sector: entry.sector,
      points: entry.points,
      stats: {
        totalReturnPct: entry.points.length > 1
          ? round(((entry.points[entry.points.length - 1].close - entry.points[0].close) / entry.points[0].close) * 100, 2)
          : null,
        volatilityPct: entry.metrics?.volatilityPct ?? null,
        relativeVolume: entry.metrics?.relativeVolume ?? null,
        momentumScore: entry.metrics?.momentumScore ?? null,
        return5: entry.metrics?.return5 ?? null,
        return20: entry.metrics?.return20 ?? null
      }
    })),
    generatedAt: new Date().toISOString()
  };
}

/**
 * Rule-based market observations. Every insight is derived from computed data and
 * returns the value that triggered it, so the UI can show the evidence.
 */
export async function getInsights() {
  const [metrics, sectors] = await Promise.all([getStockMetrics(), getSectorPerformance()]);
  const insights = [];
  const scored = metrics.filter((metric) => metric.changePct !== null);

  if (sectors.best && sectors.best.averageChangePct !== null) {
    insights.push({
      type: 'sector-leader',
      tone: sectors.best.averageChangePct >= 0 ? 'positive' : 'negative',
      message: `${sectors.best.sector} is the strongest tracked sector at ${sectors.best.averageChangePct}% average change.`,
      value: sectors.best.averageChangePct
    });
  }
  if (sectors.worst && sectors.worst.averageChangePct !== null && sectors.worst.averageChangePct < 0) {
    insights.push({
      type: 'sector-laggard',
      tone: 'negative',
      message: `${sectors.worst.sector} is the weakest tracked sector at ${sectors.worst.averageChangePct}% average change.`,
      value: sectors.worst.averageChangePct
    });
  }

  const volumeSpikes = metrics.filter((metric) => (metric.relativeVolume ?? 0) >= config.detection.volumeSpikeRatio);
  if (volumeSpikes.length) {
    insights.push({
      type: 'volume-spikes',
      tone: 'warning',
      message: `${volumeSpikes.length} stock${volumeSpikes.length === 1 ? ' is' : 's are'} trading at ${config.detection.volumeSpikeRatio}x or more of their historical average volume.`,
      value: volumeSpikes.length,
      stocks: volumeSpikes.map((metric) => metric.symbol)
    });
  }

  const negativeSectors = sectors.sectors.filter((sector) => (sector.averageChangePct ?? 0) < 0);
  if (negativeSectors.length) {
    insights.push({
      type: 'sector-weakness',
      tone: 'negative',
      message: `${negativeSectors.map((sector) => sector.sector).join(', ')} ${negativeSectors.length === 1 ? 'has' : 'have'} negative average returns.`,
      value: negativeSectors.length
    });
  }

  if (scored.length) {
    const advancing = scored.filter((metric) => metric.changePct > 0).length;
    const ratio = advancing / scored.length;
    const breadthLabel = ratio >= 0.7 ? 'strongly positive' : ratio >= 0.5 ? 'modestly positive' : ratio <= 0.3 ? 'strongly negative' : 'mixed';
    insights.push({
      type: 'breadth',
      tone: ratio >= 0.5 ? 'positive' : 'negative',
      message: `Market breadth across the tracked universe is ${breadthLabel}: ${advancing} of ${scored.length} stocks are advancing.`,
      value: round(ratio * 100, 1)
    });
  }

  const volatileStocks = metrics.filter(
    (metric) => (metric.intradayVolatilityPct ?? 0) >= 0.15 && metric.price !== null
  );
  if (volatileStocks.length) {
    insights.push({
      type: 'volatility',
      tone: 'warning',
      message: `${volatileStocks.length} stock${volatileStocks.length === 1 ? ' has' : 's have'} significant intraday volatility (1-minute return std-dev ≥ 0.15%).`,
      value: volatileStocks.length,
      stocks: volatileStocks.map((metric) => metric.symbol)
    });
  }

  const nearHighs = metrics.filter((metric) => (metric.fromHigh52wPct ?? -100) > -3);
  if (nearHighs.length) {
    insights.push({
      type: 'near-52w-high',
      tone: 'positive',
      message: `${nearHighs.length} stock${nearHighs.length === 1 ? ' is' : 's are'} within 3% of their 52-week high.`,
      value: nearHighs.length,
      stocks: nearHighs.map((metric) => metric.symbol)
    });
  }

  return { insights, generatedAt: new Date().toISOString() };
}

export const MARKET_METRIC_LABEL = 'Metrics cover the tracked stock universe only.';
