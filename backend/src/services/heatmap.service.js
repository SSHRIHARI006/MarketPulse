import { config } from '../config/env.js';
import { marketStore } from './marketStore.js';
import { RANGE_LOOKBACK_MS } from '../utils/time.js';
import { percentChange, round } from '../utils/validators.js';

const RANGE_LABELS = {
  session: 'Current session',
  daily: 'Daily (vs previous close)',
  '5m': 'Last 5 minutes',
  '15m': 'Last 15 minutes',
  '1h': 'Last 1 hour'
};

/**
 * Computes the heatmap payload.
 *
 * Area comes from a reference metric (market cap by default) and colour from
 * percentage movement over the selected range. When the baseline observation for a
 * range does not exist, `changePct` is null and `available` is false: missing data is
 * never rendered as zero movement.
 */
export function buildHeatmap({ range = 'daily', sector = 'all', sizeBy = 'marketCap' } = {}) {
  const now = Date.now();
  const quotes = marketStore.listQuotes();

  const tiles = quotes.map((quote) => {
    const baseline = baselineFor(quote, range, now);
    const changePct =
      baseline === null || quote.price === null ? null : round(percentChange(quote.price, baseline), 2);

    return {
      stockId: quote.stockId,
      symbol: quote.symbol,
      companyName: quote.companyName,
      sector: quote.sector,
      sectorId: quote.sectorId,
      price: quote.price,
      previousClose: quote.previousClose,
      changePct,
      changeAbs: changePct === null ? null : round(quote.price - baseline, 2),
      volume: quote.volume,
      marketCap: quote.marketCap,
      sizeValue: sizeValueFor(quote, sizeBy),
      dayHigh: quote.high,
      dayLow: quote.low,
      open: quote.open,
      updatedAt: quote.updatedAt,
      stale: quote.stale,
      available: changePct !== null,
      baseline
    };
  });

  const filtered = sector && sector !== 'all' ? tiles.filter((tile) => tile.sector === sector) : tiles;
  const sectors = groupBySector(filtered);

  const available = filtered.filter((tile) => tile.available);
  const advancing = available.filter((tile) => tile.changePct > config.heatmap.neutralBandPct).length;
  const declining = available.filter((tile) => tile.changePct < -config.heatmap.neutralBandPct).length;

  return {
    range,
    rangeLabel: RANGE_LABELS[range] || RANGE_LABELS.daily,
    sizeBy,
    sector: sector || 'all',
    neutralBandPct: config.heatmap.neutralBandPct,
    maxPct: config.heatmap.maxPct,
    tiles: filtered,
    sectors,
    summary: {
      tracked: filtered.length,
      advancing,
      declining,
      unchanged: Math.max(0, available.length - advancing - declining),
      unavailable: filtered.length - available.length,
      averageChangePct: available.length
        ? round(available.reduce((sum, tile) => sum + tile.changePct, 0) / available.length, 2)
        : null
    },
    mode: marketStore.connection.mode,
    generatedAt: new Date().toISOString()
  };
}

function baselineFor(quote, range, now) {
  if (range === 'daily' || range === 'session') return quote.previousClose;

  const lookback = RANGE_LOOKBACK_MS[range];
  if (!lookback) return quote.previousClose;
  if (quote.price === null) return null;

  const point = marketStore.priceAtOrAfter(quote.stockId, now - lookback);
  return point ? point.price : null;
}

function sizeValueFor(quote, sizeBy) {
  if (sizeBy === 'volume') return quote.volume ?? 0;
  if (sizeBy === 'equal') return 1;
  return quote.marketCap || 0;
}

function groupBySector(tiles) {
  const map = new Map();
  for (const tile of tiles) {
    const entry = map.get(tile.sector) || {
      sector: tile.sector,
      count: 0,
      sumChange: 0,
      counted: 0,
      marketCap: 0,
      advancing: 0,
      declining: 0
    };
    entry.count += 1;
    entry.marketCap += tile.marketCap || 0;
    if (tile.available) {
      entry.sumChange += tile.changePct;
      entry.counted += 1;
      if (tile.changePct > config.heatmap.neutralBandPct) entry.advancing += 1;
      if (tile.changePct < -config.heatmap.neutralBandPct) entry.declining += 1;
    }
    map.set(tile.sector, entry);
  }

  return [...map.values()]
    .map((entry) => ({
      sector: entry.sector,
      count: entry.count,
      averageChangePct: entry.counted ? round(entry.sumChange / entry.counted, 2) : null,
      marketCap: entry.marketCap,
      advancing: entry.advancing,
      declining: entry.declining
    }))
    .sort((a, b) => (b.averageChangePct ?? -Infinity) - (a.averageChangePct ?? -Infinity));
}

export const heatmapRanges = Object.keys(RANGE_LABELS);
