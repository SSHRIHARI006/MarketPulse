import 'dotenv/config';

function num(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

export const config = {
  port: Number.parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://marketpulse:marketpulse@localhost:5432/marketpulse',

  // 'live' connects to Upstox, 'replay' streams stored historical bars, 'demo'
  // runs the clearly labelled simulator. Every mode tags what it writes.
  marketDataMode: (process.env.MARKET_DATA_MODE || 'demo').trim().toLowerCase(),
  upstox: {
    accessToken: process.env.UPSTOX_ACCESS_TOKEN || '',
    // The V3 feed redirects to an authorised endpoint, so redirects must be followed.
    authorizeUrl: 'https://api.upstox.com/v3/feed/market-data-feed/authorize',
    feedUrl: 'wss://api.upstox.com/v3/feed/market-data-feed',
    instrumentMasterUrl:
      process.env.UPSTOX_INSTRUMENTS_URL ||
      'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz',
    // Optional override: drop the official MarketDataFeedV3.proto here.
    protoPath: process.env.UPSTOX_PROTO_PATH || ''
  },

  // Live-mode runtime behaviour.
  live: {
    // How often the browser re-requests the consolidated snapshot (reconciliation,
    // not the primary source of updates). Served from the in-memory cache.
    snapshotRefreshMs: num(process.env.LIVE_SNAPSHOT_REFRESH_MS, 5000),
    // A quote is FRESH when its last accepted tick is within this window.
    staleThresholdMs: num(process.env.LIVE_STALE_THRESHOLD_MS, 15000),
    // Provider subscription mode. 'full' carries LTP, previous close, OHLC, volume.
    subscriptionMode: (process.env.UPSTOX_SUBSCRIPTION_MODE || 'full').trim().toLowerCase(),
    // Instruments requested per subscription frame (provider limit is 500).
    subscriptionBatchSize: num(process.env.UPSTOX_SUBSCRIPTION_BATCH_SIZE, 100)
  },

  // Data collection / persistence tuning.
  tickSampleIntervalMs: num(process.env.TICK_SAMPLE_INTERVAL_MS, 15000),
  tickRetentionHours: num(process.env.TICK_RETENTION_HOURS, 48),
  demo: {
    tickIntervalMs: num(process.env.DEMO_TICK_INTERVAL_MS, 1500),
    historyDays: num(process.env.SEED_HISTORY_DAYS, 260)
  },

  // Historical replay. The dataset is read-only; replayed candles are written under
  // their own provenance so a replay can never alter the source it reads.
  replay: {
    // Provenance of the stored dataset that is replayed ('demo' history by default).
    datasetSource: (process.env.REPLAY_DATASET_SOURCE || 'demo').trim().toLowerCase(),
    // Session to load at start-up (YYYY-MM-DD, IST). Empty = most recent available.
    defaultSession: (process.env.REPLAY_SESSION || '').trim(),
    defaultSpeed: num(process.env.REPLAY_SPEED, 1),
    speeds: [1, 2, 5, 10],
    // Upper bound on how many historical events a single session may load.
    maxEvents: num(process.env.REPLAY_MAX_EVENTS, 200000),
    // Events emitted per scheduling wake before yielding to the event loop.
    maxBatchEvents: num(process.env.REPLAY_MAX_BATCH_EVENTS, 500)
  },

  // Analysis windows.
  analysis: {
    intradayWindowMinutes: 60,
    momentumShortSessions: 5,
    momentumLongSessions: 20,
    riskWindowSessions: 20,
    relativeVolumeLookbackSessions: 20,
    volatilityWindowSessions: 20,
    candleIntervals: ['1m', '5m', '15m', '1d']
  },

  // Unusual activity detection thresholds (all configurable by spec).
  detection: {
    volumeSpikeRatio: num(process.env.VOLUME_SPIKE_RATIO, 2),
    priceMovePct: num(process.env.PRICE_MOVE_PCT, 2),
    priceMoveWindowMinutes: num(process.env.PRICE_MOVE_WINDOW_MINUTES, 15),
    volatilitySpikeMultiple: num(process.env.VOLATILITY_SPIKE_MULTIPLE, 2),
    eventCooldownMinutes: num(process.env.EVENT_COOLDOWN_MINUTES, 10),
    evaluationIntervalMs: num(process.env.DETECTION_INTERVAL_MS, 20000)
  },

  heatmap: {
    // Percentage band around zero treated as neutral, to stop tiles flickering.
    neutralBandPct: num(process.env.HEATMAP_NEUTRAL_BAND_PCT, 0.05),
    maxPct: num(process.env.HEATMAP_MAX_PCT, 5)
  },

  // Index instruments shown in the market overview cards.
  indices: [
    { key: 'NSE_INDEX|Nifty 50', symbol: 'NIFTY 50', name: 'NIFTY 50', exchange: 'NSE', basePrice: 24350 },
    { key: 'BSE_INDEX|SENSEX', symbol: 'SENSEX', name: 'SENSEX', exchange: 'BSE', basePrice: 79900 }
  ]
};

export const isDemoMode = () => config.marketDataMode === 'demo';
export const isReplayMode = () => config.marketDataMode === 'replay';
export const isLiveMode = () => config.marketDataMode === 'live';

/** Provenance tag stored with every observation: 'demo', 'replay' or 'live'. */
export const dataSource = () => config.marketDataMode;

/**
 * Provenance used for *reads* of stored history. A replay reads the dataset it was
 * configured with, while still writing its own observations under 'replay'.
 */
export const historySource = () => (isReplayMode() ? config.replay.datasetSource : dataSource());

/**
 * Startup configuration check. Returns errors that prevent LIVE mode from working
 * and warnings for questionable-but-usable configuration. The token value is never
 * included in the output, only whether it is present.
 */
export function validateConfig() {
  const errors = [];
  const warnings = [];

  if (!['live', 'demo', 'replay'].includes(config.marketDataMode)) {
    warnings.push(`MARKET_DATA_MODE="${config.marketDataMode}" is not recognised; using DEMO mode.`);
  }

  if (config.marketDataMode === 'replay') {
    if (!config.replay.speeds.includes(config.replay.defaultSpeed)) {
      warnings.push(
        `REPLAY_SPEED=${config.replay.defaultSpeed} is not one of ${config.replay.speeds.join('/')}; the fastest allowed speed is used.`
      );
    }
    if (config.replay.defaultSession && !/^\d{4}-\d{2}-\d{2}$/.test(config.replay.defaultSession)) {
      warnings.push(`REPLAY_SESSION="${config.replay.defaultSession}" is not a YYYY-MM-DD date; the latest session is used.`);
    }
  }

  if (config.marketDataMode === 'live') {
    if (!config.upstox.accessToken) {
      errors.push(
        'MARKET_DATA_MODE=live requires UPSTOX_ACCESS_TOKEN, but it is empty. The feed cannot authorise; the UI will report an authentication error.'
      );
    }
    if (!Number.isFinite(config.live.staleThresholdMs) || config.live.staleThresholdMs < 1000) {
      warnings.push('LIVE_STALE_THRESHOLD_MS is below 1000ms; quotes will flap between fresh and stale.');
    }
    if (!Number.isFinite(config.live.snapshotRefreshMs) || config.live.snapshotRefreshMs < 1000) {
      warnings.push('LIVE_SNAPSHOT_REFRESH_MS is below 1000ms; clients would poll too aggressively.');
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
