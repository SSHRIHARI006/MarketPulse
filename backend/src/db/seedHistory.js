import { config } from '../config/env.js';
import { query } from '../config/database.js';
import { mulberry32, normal, profileFor } from '../data/stockProfiles.js';
import {
  INTERVAL_MS,
  ONE_DAY_MS,
  latestSessionStart,
  previousSessionStart,
  sessionEndUtc,
  sessionStartUtc
} from '../utils/time.js';
import { round } from '../utils/validators.js';

/**
 * Seeds daily and intraday history for DEMO MODE.
 *
 * Daily bars cover ~260 sessions so 5/20-session momentum, 52-week ranges, SMA50
 * and RSI are meaningful on first boot. Intraday 1m bars are generated for the most
 * recent session so the heatmap's 5m/15m/1h comparisons have a baseline.
 *
 * It only ever writes `source = 'demo'` rows and is never called in LIVE mode, so
 * simulated history can never masquerade as market data.
 *
 * It is idempotent per stock: a stock that already has demo daily history is
 * skipped, so expanding the universe backfills only the newly tracked names.
 */
export async function seedHistoryIfEmpty() {
  // A single daily bar may just be today's aggregator bucket; require enough
  // sessions for the momentum/volatility windows before calling a stock seeded.
  const seeded = new Set(
    (
      await query(
        `SELECT stock_id FROM stock_candles
         WHERE interval = '1d' AND source = 'demo'
         GROUP BY stock_id
         HAVING COUNT(*) >= $1`,
        [config.analysis.momentumLongSessions + 1]
      )
    ).rows.map((row) => Number(row.stock_id))
  );

  const stocks = (
    await query('SELECT id, symbol FROM stocks WHERE is_active = TRUE ORDER BY id')
  ).rows.filter((stock) => !seeded.has(Number(stock.id)));
  if (!stocks.length) return { seeded: false };

  const dailyRows = [];
  const intradayRows = [];

  for (const stock of stocks) {
    const profile = profileFor(stock.symbol);
    const random = mulberry32(1337 + stock.id * 7919);
    const sessions = Math.max(config.demo.historyDays, 60);
    const startSession = latestSessionStart(new Date());

    let price = profile.basePrice * (0.82 + random() * 0.12);
    const dailyVol = profile.dailyVolPct / 100;

    for (let i = sessions; i >= 1; i -= 1) {
      const sessionStart = previousSessionStart(startSession, i);
      const drift = 0.0004; // gentle upward bias over the window
      const shock = normal(random) * dailyVol;
      const open = price;
      const close = Math.max(1, open * (1 + drift + shock));
      const range = Math.abs(shock) + dailyVol * (0.4 + random() * 0.8);
      const high = Math.max(open, close) * (1 + range * 0.55 * random());
      const low = Math.min(open, close) * (1 - range * 0.55 * random());
      const volume = Math.round(profile.avgVolume * (0.55 + random() * 0.95));

      dailyRows.push([
        stock.id,
        round(open, 4),
        round(high, 4),
        round(low, 4),
        round(close, 4),
        volume,
        sessionStart.toISOString()
      ]);
      price = close;
    }

    // Intraday 1m bars for the latest session, ending at the current price so the
    // first simulated tick follows on smoothly.
    const sessionStart = sessionStartUtc(startSession);
    const sessionEnd = sessionEndUtc(startSession);
    const now = new Date();
    const lastBar = new Date(Math.min(now.getTime(), sessionEnd.getTime()));
    const totalBars = Math.max(1, Math.floor((lastBar - sessionStart) / INTERVAL_MS['1m']));
    const startPrice = price * (0.995 + random() * 0.01);
    const perMinuteVol = dailyVol / Math.sqrt(375);
    const avgMinuteVolume = Math.round(profile.avgVolume / 375);
    let barPrice = startPrice;

    for (let i = 0; i < totalBars; i += 1) {
      const barStart = new Date(sessionStart.getTime() + i * INTERVAL_MS['1m']);
      const open = barPrice;
      const close = open * (1 + normal(random) * perMinuteVol);
      const high = Math.max(open, close) * (1 + Math.abs(normal(random)) * perMinuteVol * 0.35);
      const low = Math.min(open, close) * (1 - Math.abs(normal(random)) * perMinuteVol * 0.35);
      const volume = Math.round(avgMinuteVolume * (0.4 + random() * 1.7));
      intradayRows.push([
        stock.id,
        round(open, 4),
        round(high, 4),
        round(low, 4),
        round(close, 4),
        volume,
        barStart.toISOString()
      ]);
      barPrice = close;
    }

    // Keep the previous close (last daily bar) consistent with today's open.
    const lastDaily = dailyRows[dailyRows.length - 1];
    if (lastDaily) lastDaily[4] = round(startPrice, 4);
  }

  await insertCandles(dailyRows, '1d', 'demo');
  await insertCandles(intradayRows, '1m', 'demo');
  await rollupCandles();

  console.log(
    `[seed] generated ${dailyRows.length} daily bars and ${intradayRows.length} intraday bars for ${stocks.length} stocks`
  );
  return { seeded: true, dailyRows: dailyRows.length, intradayRows: intradayRows.length };
}

async function insertCandles(rows, interval, source) {
  const chunkSize = 400;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    // Row shape: [stock_id, open, high, low, close, volume, candle_start]
    const values = chunk
      .map((_, index) => {
        const base = index * 9;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
      })
      .join(', ');

    await query(
      `INSERT INTO stock_candles (stock_id, interval, candle_start, open, high, low, close, volume, source)
       VALUES ${values}
       ON CONFLICT (stock_id, interval, candle_start, source) DO NOTHING`,
      chunk.flatMap((row) => [row[0], interval, row[6], row[1], row[2], row[3], row[4], row[5], source])
    );
  }
}

/** Builds 5m/15m rollups from stored 1m bars (used after seeding and at startup). */
export async function rollupCandles() {
  const buckets = [
    { interval: '5m', ms: INTERVAL_MS['5m'] },
    { interval: '15m', ms: INTERVAL_MS['15m'] }
  ];

  for (const bucket of buckets) {
    await query(
      `INSERT INTO stock_candles (stock_id, interval, candle_start, open, high, low, close, volume, source)
       SELECT stock_id,
              $1,
              bucket,
              (array_agg(open ORDER BY candle_start))[1],
              MAX(high),
              MIN(low),
              (array_agg(close ORDER BY candle_start DESC))[1],
              COALESCE(SUM(volume), 0),
              source
       FROM (
         SELECT stock_id, candle_start, open, high, low, close, volume, source,
                to_timestamp(floor(extract(epoch FROM candle_start) / $2) * $2) AS bucket
         FROM stock_candles
         WHERE interval = '1m'
       ) AS bars
       GROUP BY stock_id, source, bucket
       ON CONFLICT (stock_id, interval, candle_start, source) DO UPDATE
       SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
           close = EXCLUDED.close, volume = EXCLUDED.volume`,
      [bucket.interval, bucket.ms / 1000]
    );
  }

  // Reference statistics used by the 52-week rankings, kept per provenance.
  await query(
    `INSERT INTO stock_reference (stock_id, source, high_52w, low_52w, avg_daily_vol, reference_date)
     SELECT stock_id, source, MAX(high), MIN(low), AVG(volume)::BIGINT, CURRENT_DATE
     FROM stock_candles
     WHERE interval = '1d' AND candle_start >= now() - INTERVAL '365 days'
     GROUP BY stock_id, source
     ON CONFLICT (stock_id, source) DO UPDATE
     SET high_52w = EXCLUDED.high_52w,
         low_52w = EXCLUDED.low_52w,
         avg_daily_vol = EXCLUDED.avg_daily_vol,
         reference_date = EXCLUDED.reference_date`
  );
}

/** Clears daily rows older than `days` (used when history grows stale). */
export async function pruneDailyCandles(days = 400) {
  await query(
    `DELETE FROM stock_candles WHERE interval = '1d' AND candle_start < now() - ($1 || ' days')::interval`,
    [String(days)]
  );
}

export const ONE_DAY = ONE_DAY_MS;
