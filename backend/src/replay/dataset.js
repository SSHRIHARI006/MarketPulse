import { query } from '../config/database.js';
import { config } from '../config/env.js';
import { IST_OFFSET_MS, ONE_DAY_MS, SESSION_END_MINUTES, SESSION_START_MINUTES } from '../utils/time.js';
import { round } from '../utils/validators.js';

/**
 * Historical dataset access for REPLAY mode.
 *
 * The dataset is whatever the project actually stores: one-minute OHLCV bars in
 * `stock_candles` for a given provenance. Nothing here invents observations — a
 * candle's close is replayed as the price observed during that minute, and the bar
 * is labelled with its real granularity so the UI cannot claim tick-level data.
 *
 * The normalisation functions are pure (no database access) so the validation and
 * ordering rules can be tested without PostgreSQL.
 */

export const REPLAY_GRANULARITY = 'ONE_MINUTE_CANDLE';
export const DATASET_INTERVAL = '1m';

/**
 * A replayable "session" is the exchange trading window (09:15-15:30 IST), not the
 * whole calendar day. The DEMO simulator keeps ticking overnight and therefore stores
 * out-of-session bars; replaying those would fake pre-open activity and report an
 * open market that never existed.
 */
export const SESSION_WINDOW = Object.freeze({
  startMinutes: SESSION_START_MINUTES,
  endMinutes: SESSION_END_MINUTES
});

/** Minutes since IST midnight for an instant. */
export function istMinutesOfDay(ts) {
  const ist = new Date(ts + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

export function isWithinTradingWindow(ts) {
  const minutes = istMinutesOfDay(ts);
  return minutes >= SESSION_WINDOW.startMinutes && minutes <= SESSION_WINDOW.endMinutes;
}
export const MAX_REJECTION_SAMPLES = 25;

export const REJECTION_REASONS = Object.freeze({
  UNKNOWN_INSTRUMENT: 'UNKNOWN_INSTRUMENT',
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  INVALID_PRICE: 'INVALID_PRICE',
  INVALID_OHLC: 'INVALID_OHLC',
  INVALID_VOLUME: 'INVALID_VOLUME',
  DUPLICATE_EVENT: 'DUPLICATE_EVENT',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS'
});

/** IST calendar date (YYYY-MM-DD) of an instant. */
export function istDateString(date) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function isValidTradingDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00+05:30`));
}

/** UTC instants bounding an IST trading date, used to select a session's bars. */
export function istDayBounds(tradingDate) {
  const start = new Date(`${tradingDate}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + ONE_DAY_MS) };
}

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Validates one stored bar. Returns a rejection reason instead of throwing so a
 * single malformed row can never terminate a replay session.
 */
export function validateRecord(row, stocksById) {
  if (!row || row.stock_id === undefined || row.stock_id === null || !row.candle_start) {
    return REJECTION_REASONS.MISSING_REQUIRED_FIELDS;
  }
  const stock = stocksById.get(Number(row.stock_id));
  if (!stock) return REJECTION_REASONS.UNKNOWN_INSTRUMENT;

  const ts = Date.parse(row.candle_start);
  if (!Number.isFinite(ts)) return REJECTION_REASONS.INVALID_TIMESTAMP;

  const close = finite(row.close);
  if (close === null || close <= 0 || close > 5_000_000) return REJECTION_REASONS.INVALID_PRICE;

  const open = finite(row.open);
  const high = finite(row.high);
  const low = finite(row.low);
  if (open === null || high === null || low === null) return REJECTION_REASONS.MISSING_REQUIRED_FIELDS;
  if (open <= 0 || high <= 0 || low <= 0) return REJECTION_REASONS.INVALID_PRICE;
  // OHLC consistency, allowing for floating-point storage rounding.
  const tolerance = Math.max(0.0001, close * 1e-6);
  if (low > Math.min(open, close) + tolerance || high < Math.max(open, close) - tolerance || high < low - tolerance) {
    return REJECTION_REASONS.INVALID_OHLC;
  }

  const volume = finite(row.volume);
  if (volume === null || volume < 0) return REJECTION_REASONS.INVALID_VOLUME;

  return null;
}

/**
 * Turns stored bars into the internal replay event stream.
 *
 * Ordering is deterministic: historical timestamp first, then stock id as the
 * tie-breaker, so two runs over the same dataset emit the same sequence.
 */
export function normaliseEvents({
  rows = [],
  stocksById = new Map(),
  sessionId,
  tradingDate,
  maxEvents = config.replay.maxEvents
} = {}) {
  const rejections = { total: 0, byReason: {}, samples: [] };
  const seen = new Set();
  const instruments = new Map();
  const accepted = [];
  const bounds = tradingDate ? istDayBounds(tradingDate) : null;
  let truncated = 0;
  let outsideSession = 0;

  const reject = (row, reason) => {
    rejections.total += 1;
    rejections.byReason[reason] = (rejections.byReason[reason] || 0) + 1;
    if (rejections.samples.length < MAX_REJECTION_SAMPLES) {
      rejections.samples.push({
        stockId: row?.stock_id ?? null,
        candleStart: row?.candle_start ?? null,
        reason
      });
    }
  };

  // Defensive stable sort: the SQL already orders this way, but replay must not
  // depend on the database collation for chronological correctness.
  const ordered = rows.slice().sort((a, b) => {
    const diff = Date.parse(a.candle_start) - Date.parse(b.candle_start);
    return diff !== 0 ? diff : Number(a.stock_id) - Number(b.stock_id);
  });

  for (const row of ordered) {
    const reason = validateRecord(row, stocksById);
    if (reason) {
      reject(row, reason);
      continue;
    }

    const ts = Date.parse(row.candle_start);
    if (bounds && (ts < bounds.start.getTime() || ts >= bounds.end.getTime())) {
      reject(row, REJECTION_REASONS.INVALID_TIMESTAMP);
      continue;
    }

    // Bars the simulator wrote outside trading hours are not part of the session;
    // they are counted and excluded rather than reported as corrupt.
    if (!isWithinTradingWindow(ts)) {
      outsideSession += 1;
      continue;
    }

    const stockId = Number(row.stock_id);
    const identity = `${stockId}|${ts}`;
    if (seen.has(identity)) {
      reject(row, REJECTION_REASONS.DUPLICATE_EVENT);
      continue;
    }
    seen.add(identity);

    if (accepted.length >= maxEvents) {
      truncated += 1;
      continue;
    }

    const stock = stocksById.get(stockId);
    const event = {
      sequence: accepted.length,
      eventId: `${sessionId}:${accepted.length}`,
      sessionId,
      stockId,
      symbol: stock.symbol,
      instrumentKey: stock.instrumentKey,
      eventType: 'CANDLE',
      price: round(Number(row.close), 4),
      open: round(Number(row.open), 4),
      high: round(Number(row.high), 4),
      low: round(Number(row.low), 4),
      // Per-minute traded volume, as stored. Cumulative session volume is derived
      // by the pipeline; this value is never presented as a single trade.
      volumeDelta: Math.round(Number(row.volume)),
      providerTimestamp: new Date(ts).toISOString(),
      sourceGranularity: REPLAY_GRANULARITY
    };
    accepted.push(event);

    const summary = instruments.get(stockId) || {
      stockId,
      symbol: stock.symbol,
      instrumentKey: stock.instrumentKey,
      eventsAvailable: 0,
      firstHistoricalEventAt: event.providerTimestamp,
      lastHistoricalEventAt: event.providerTimestamp
    };
    summary.eventsAvailable += 1;
    summary.lastHistoricalEventAt = event.providerTimestamp;
    instruments.set(stockId, summary);
  }

  return {
    events: accepted,
    rejections,
    instruments: [...instruments.values()],
    stats: {
      recordsLoaded: ordered.length,
      accepted: accepted.length,
      rejected: rejections.total,
      outsideSession,
      truncated
    }
  };
}

/** Available historical sessions, newest first, with real coverage numbers. */
export async function listSessions() {
  const source = config.replay.datasetSource;
  const [{ rows }, configured] = await Promise.all([
    query(
      `SELECT (c.candle_start AT TIME ZONE 'Asia/Kolkata')::date::text AS trading_date,
              COUNT(*)::int AS event_count,
              COUNT(DISTINCT c.stock_id)::int AS instrument_count,
              COUNT(DISTINCT c.stock_id) FILTER (WHERE s.is_active)::int AS available_instruments,
              MIN(c.candle_start) AS first_event,
              MAX(c.candle_start) AS last_event
       FROM stock_candles c
       JOIN stocks s ON s.id = c.stock_id
       WHERE c.interval = $1 AND c.source = $2
         -- Only bars inside the exchange trading window are replayable.
         AND (c.candle_start AT TIME ZONE 'Asia/Kolkata')::time BETWEEN '09:15:00' AND '15:30:00'
       GROUP BY 1
       ORDER BY 1 DESC`,
      [DATASET_INTERVAL, source]
    ),
    query('SELECT COUNT(*)::int AS count FROM stocks WHERE is_active = TRUE')
  ]);

  const configuredInstruments = Number(configured.rows[0]?.count || 0);

  return rows.map((row) => ({
    sessionId: row.trading_date,
    tradingDate: row.trading_date,
    instrumentCount: Number(row.available_instruments),
    datasetInstrumentCount: Number(row.instrument_count),
    configuredInstruments,
    eventCount: Number(row.event_count),
    granularity: REPLAY_GRANULARITY,
    source,
    firstEventAt: row.first_event ? new Date(row.first_event).toISOString() : null,
    lastEventAt: row.last_event ? new Date(row.last_event).toISOString() : null,
    // Sessions are listed with their real coverage; partial coverage is allowed and
    // reported rather than filled in.
    status: 'AVAILABLE'
  }));
}

/**
 * Loads and normalises one historical session. Returns the event stream plus the
 * diagnostics needed to explain what was accepted, rejected and missing.
 */
export async function loadSession(tradingDate, { sessionId } = {}) {
  const source = config.replay.datasetSource;
  const bounds = istDayBounds(tradingDate);

  const stocks = (
    await query(
      `SELECT s.id, s.symbol, s.instrument_key
       FROM stocks s WHERE s.is_active = TRUE ORDER BY s.id`
    )
  ).rows;
  const stocksById = new Map(
    stocks.map((row) => [
      Number(row.id),
      { id: Number(row.id), symbol: row.symbol, instrumentKey: row.instrument_key }
    ])
  );

  const [bars, previousCloseRows] = await Promise.all([
    query(
      `SELECT stock_id, candle_start, open, high, low, close, volume
       FROM stock_candles
       WHERE interval = $1 AND source = $2 AND candle_start >= $3 AND candle_start < $4
       ORDER BY candle_start, stock_id`,
      [DATASET_INTERVAL, source, bounds.start.toISOString(), bounds.end.toISOString()]
    ),
    // The percentage-change baseline is the last completed daily bar before the
    // replayed session. Without one, change is reported as unavailable.
    query(
      `SELECT DISTINCT ON (stock_id) stock_id, close
       FROM stock_candles
       WHERE interval = '1d' AND source = $1 AND candle_start < $2
       ORDER BY stock_id, candle_start DESC`,
      [source, bounds.start.toISOString()]
    )
  ]);

  const previousCloses = new Map(
    previousCloseRows.rows.map((row) => [Number(row.stock_id), Number(row.close)])
  );

  const normalised = normaliseEvents({
    rows: bars.rows,
    stocksById,
    sessionId,
    tradingDate
  });

  const available = new Set(normalised.instruments.map((instrument) => instrument.stockId));
  const unavailable = [...stocksById.values()]
    .filter((stock) => !available.has(stock.id))
    .map((stock) => ({ stockId: stock.id, symbol: stock.symbol }));

  const events = normalised.events;
  return {
    tradingDate,
    sessionId,
    source,
    granularity: REPLAY_GRANULARITY,
    events,
    previousCloses,
    instruments: normalised.instruments,
    unavailableInstruments: unavailable,
    rejections: normalised.rejections,
    stats: normalised.stats,
    coverage: {
      configuredInstruments: stocksById.size,
      availableInstruments: available.size,
      unavailableInstruments: unavailable.length
    },
    firstEventAt: events.length ? events[0].providerTimestamp : null,
    lastEventAt: events.length ? events[events.length - 1].providerTimestamp : null
  };
}

/** Diagnostics-friendly summary of the dataset that is currently loaded. */
export function datasetSummary(dataset) {
  if (!dataset) return null;
  return {
    tradingDate: dataset.tradingDate,
    source: dataset.source,
    granularity: dataset.granularity,
    configuredInstruments: dataset.coverage.configuredInstruments,
    availableInstruments: dataset.coverage.availableInstruments,
    unavailableInstruments: dataset.coverage.unavailableInstruments,
    unavailableSymbols: dataset.unavailableInstruments.map((entry) => entry.symbol),
    recordsLoaded: dataset.stats.recordsLoaded,
    acceptedEvents: dataset.stats.accepted,
    invalidRecords: dataset.stats.rejected,
    // Bars stored outside 09:15-15:30 IST are excluded, not treated as corrupt.
    outsideSessionRecords: dataset.stats.outsideSession ?? 0,
    truncatedRecords: dataset.stats.truncated,
    rejectionReasons: dataset.rejections.byReason,
    rejectionSamples: dataset.rejections.samples,
    firstEventAt: dataset.firstEventAt,
    lastEventAt: dataset.lastEventAt
  };
}
