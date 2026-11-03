import { config, dataSource } from '../config/env.js';
import { marketStore } from '../services/marketStore.js';
import { processTick } from '../services/tickPipeline.js';
import { clearCandles, deleteCandlesBySource } from '../services/candle.service.js';
import { sanitizeTick } from '../utils/validators.js';
import { ReplayEngine, REPLAY_STATES } from './engine.js';
import { datasetSummary, isValidTradingDate, listSessions, loadSession } from './dataset.js';

/**
 * Replay session orchestration.
 *
 * The engine decides *when* an event is emitted; this module decides *what happens*
 * to it. Emitted events are converted into the same tick shape the LIVE adapter
 * produces and pushed through `processTick`, so the market store, candle aggregator,
 * analytics and Socket.IO broadcast are exactly the ones used by every other mode.
 *
 * One shared session exists for the whole backend (spec 16.4): every connected client
 * observes the same playback state.
 */

let engine = null;
let dataset = null;
let sessionCounter = 0;
let counters = emptyCounters();
let perInstrument = new Map();
let volumeState = new Map();
let loadPromise = null;

function emptyCounters() {
  return {
    eventsEmitted: 0,
    eventsAccepted: 0,
    eventsRejected: 0,
    marketStoreUpdates: 0,
    candleUpdates: 0
  };
}

function emptyInstrumentEntry(instrument) {
  return {
    stockId: instrument.stockId,
    symbol: instrument.symbol,
    instrumentKey: instrument.instrumentKey,
    mappingStatus: 'VERIFIED',
    dataAvailability: 'AVAILABLE',
    firstHistoricalEventAt: instrument.firstHistoricalEventAt ?? null,
    lastHistoricalEventAt: instrument.lastHistoricalEventAt ?? null,
    eventsAvailable: instrument.eventsAvailable ?? 0,
    eventsProcessed: 0,
    acceptedEvents: 0,
    rejectedEvents: 0,
    lastPrice: null,
    lastProcessedHistoricalTime: null,
    lastReceivedAt: null,
    lastRejectionReason: null,
    sourceGranularity: dataset?.granularity ?? null,
    status: 'REPLAY_PENDING'
  };
}

function resetState({ keepDataset = false } = {}) {
  counters = emptyCounters();
  volumeState = new Map();
  perInstrument = new Map();
  if (!keepDataset) dataset = null;
  if (dataset) {
    for (const instrument of dataset.instruments) {
      perInstrument.set(instrument.stockId, emptyInstrumentEntry(instrument));
    }
  }
}

/** Replay status as published to clients and diagnostics. */
export function replaySnapshot() {
  if (!engine) {
    return {
      mode: config.marketDataMode,
      state: REPLAY_STATES.IDLE,
      sessionId: null,
      tradingDate: null,
      speed: config.replay.defaultSpeed,
      allowedSpeeds: config.replay.speeds,
      clock: null,
      progress: { processedEvents: 0, totalEvents: 0, percentage: 0 },
      coverage: null
    };
  }
  const status = engine.status();
  return {
    mode: 'replay',
    state: status.state,
    sessionId: status.sessionId,
    tradingDate: status.tradingDate,
    granularity: status.granularity,
    datasetSource: status.source,
    speed: status.speed,
    allowedSpeeds: status.allowedSpeeds,
    error: status.error,
    // A single historical timestamp: the simulated market clock.
    clock: status.clock.currentHistoricalTime,
    firstEventAt: status.clock.firstEventAt,
    lastEventAt: status.clock.lastEventAt,
    startedAt: status.clock.startedAt,
    progress: status.progress,
    counters: status.counters,
    coverage: dataset
      ? {
          ...dataset.coverage,
          unavailableSymbols: dataset.unavailableInstruments.map((entry) => entry.symbol)
        }
      : null
  };
}

function publish() {
  const snapshot = replaySnapshot();
  marketStore.setReplayState(snapshot);
  return snapshot;
}

/**
 * Converts a stored bar into the same tick contract the LIVE decoder produces.
 *
 * `candleAt` carries the historical timestamp so candle buckets and intraday
 * comparisons use the simulated clock, while `receivedAt` keeps the real processing
 * time for diagnostics (spec 6.2).
 */
function buildTick(event, previousClose) {
  const state = volumeState.get(event.stockId) || { volume: 0, open: null, high: null, low: null };
  state.volume += Number.isFinite(event.volumeDelta) ? event.volumeDelta : 0;
  state.open = state.open ?? event.open;
  state.high = state.high === null ? event.high : Math.max(state.high, event.high);
  state.low = state.low === null ? event.low : Math.min(state.low, event.low);
  volumeState.set(event.stockId, state);

  const tick = sanitizeTick({
    instrumentKey: event.instrumentKey,
    lastPrice: event.price,
    previousClose: previousClose ?? null,
    volume: state.volume,
    lastQuantity: event.volumeDelta,
    open: state.open,
    high: state.high,
    low: state.low,
    lastTradedAt: event.providerTimestamp
  });
  if (!tick) return null;

  return {
    ...tick,
    candleAt: new Date(event.providerTimestamp),
    providerTimestamp: event.providerTimestamp,
    sourceGranularity: event.sourceGranularity,
    sessionId: event.sessionId,
    eventId: event.eventId
  };
}

/** Handles one batch of emitted historical events. */
function handleBatch(events, meta) {
  counters.eventsEmitted += events.length;

  for (const event of events) {
    const entry = perInstrument.get(event.stockId);
    const tick = buildTick(event, dataset?.previousCloses?.get(event.stockId));

    if (!tick) {
      counters.eventsRejected += 1;
      if (entry) {
        entry.rejectedEvents += 1;
        entry.lastRejectionReason = 'REJECTED_BY_VALIDATION';
        entry.status = entry.acceptedEvents ? entry.status : 'REJECTED';
      }
      continue;
    }

    const accepted = processTick(tick);
    if (accepted) {
      counters.eventsAccepted += 1;
      counters.marketStoreUpdates += 1;
      // processTick folds every accepted quote into the candle aggregator.
      counters.candleUpdates += 1;
      const quote = marketStore.getQuote(event.stockId);
      if (entry) {
        entry.acceptedEvents += 1;
        entry.eventsProcessed += 1;
        entry.lastPrice = quote?.price ?? event.price;
        entry.lastProcessedHistoricalTime = event.providerTimestamp;
        entry.lastReceivedAt = new Date().toISOString();
        entry.status = 'ACTIVE';
      }
    } else {
      counters.eventsRejected += 1;
      if (entry) {
        entry.rejectedEvents += 1;
        entry.lastRejectionReason = 'REJECTED_BY_PIPELINE';
        entry.status = entry.acceptedEvents ? entry.status : 'REJECTED';
      }
    }
  }

  // Publishing here keeps the simulated clock and progress in step with the events
  // that were actually processed, not with what was merely scheduled.
  const snapshot = publish();
  marketStore.emit('replay:progress', { ...snapshot, meta });
}

function ensureEngine() {
  if (engine) return engine;
  engine = new ReplayEngine({
    onBatch: handleBatch,
    onStateChange: () => {
      publish();
    },
    onError: (error) => console.warn('[replay] engine error:', error.message)
  });
  return engine;
}

export function isReplayLoaded() {
  return Boolean(engine && dataset);
}

/** Newest available session date, used when none is configured. */
export async function latestSessionDate() {
  const sessions = await listSessions();
  return sessions[0]?.tradingDate ?? null;
}

/**
 * Loads (or switches to) a historical session.
 *
 * Nothing is deleted from the dataset; only replay-owned in-memory state and the
 * 'replay' provenance rows this engine wrote previously are cleared.
 */
export async function loadReplaySession(tradingDate) {
  const engineRef = ensureEngine();

  const date = tradingDate || config.replay.defaultSession || (await latestSessionDate());
  if (!date) {
    throw Object.assign(new Error('No historical sessions are available to replay'), { status: 404 });
  }
  if (!isValidTradingDate(date)) {
    throw Object.assign(new Error(`"${date}" is not a valid trading date (YYYY-MM-DD)`), { status: 400 });
  }

  // Report LOADING before the (possibly slow) query, so clients can distinguish a
  // slow dataset from a stuck replay.
  marketStore.setReplayState({
    ...replaySnapshot(),
    state: REPLAY_STATES.LOADING,
    tradingDate: date,
    sessionId: null
  });

  sessionCounter += 1;
  const sessionId = `replay-${date}-${sessionCounter}`;
  const loaded = await loadSession(date, { sessionId });

  if (loaded.stats.recordsLoaded === 0) {
    marketStore.setReplayState({
      ...replaySnapshot(),
      state: REPLAY_STATES.ERROR,
      error: `No historical data for trading date ${date}`,
      tradingDate: date
    });
    throw Object.assign(new Error(`No historical data is available for ${date}`), { status: 404 });
  }

  // Stop the previous session before its state is replaced, and remove the bars the
  // previous replay wrote so a new session never inherits them.
  engineRef.pause();
  clearCandles();
  await deleteCandlesBySource(dataSource());

  dataset = loaded;
  resetState({ keepDataset: true });
  marketStore.resetReplayState();
  engineRef.load(dataset);

  // Everything is known but nothing has been emitted yet.
  for (const entry of perInstrument.values()) entry.status = 'REPLAY_PENDING';
  publish();
  marketStore.emit('replay:reset', { reason: 'loaded', ...replaySnapshot() });

  console.log(
    `[replay] loaded ${sessionId}: ${dataset.events.length} events across ` +
      `${dataset.coverage.availableInstruments}/${dataset.coverage.configuredInstruments} instruments ` +
      `(${dataset.stats.rejected} invalid records)`
  );

  return replaySnapshot();
}

/** Ensures a session is loaded; used at start-up and by the API guards. */
export async function ensureSessionLoaded() {
  if (isReplayLoaded()) return replaySnapshot();
  if (!loadPromise) {
    loadPromise = loadReplaySession(config.replay.defaultSession || undefined).finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

export function playReplay(speed) {
  const engineRef = ensureEngine();
  if (!dataset) throw Object.assign(new Error('Load a replay session before playing'), { status: 409 });
  engineRef.play(speed);
  return publish();
}

export async function pauseReplay() {
  const engineRef = ensureEngine();
  engineRef.pause();
  return publish();
}

export function setReplaySpeed(speed) {
  const engineRef = ensureEngine();
  if (!dataset) throw Object.assign(new Error('Load a replay session before changing speed'), { status: 409 });
  engineRef.setSpeed(speed);
  return publish();
}

/**
 * Returns the cursor, simulated clock and replay-owned market state to the start of
 * the session. Stored history is never modified.
 */
export async function resetReplay() {
  const engineRef = ensureEngine();
  if (!dataset) throw Object.assign(new Error('Load a replay session before resetting'), { status: 409 });

  engineRef.reset();
  clearCandles();
  await deleteCandlesBySource(dataSource());
  marketStore.resetReplayState();
  resetState({ keepDataset: true });
  publish();
  marketStore.emit('replay:reset', { reason: 'reset', ...replaySnapshot() });
  return replaySnapshot();
}

export function stopReplay() {
  engine?.pause();
}

function instrumentStatus(entry, state) {
  if (!entry) return 'UNAVAILABLE';
  if (entry.dataAvailability === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (state === REPLAY_STATES.COMPLETED) return 'COMPLETED';
  if (entry.acceptedEvents > 0) {
    if (entry.eventsProcessed >= entry.eventsAvailable) return 'COMPLETED';
    return 'ACTIVE';
  }
  if (entry.rejectedEvents > 0 && entry.acceptedEvents === 0) return 'REJECTED';
  return 'REPLAY_PENDING';
}

/** Full diagnostics: dataset, pipeline stages, broadcast and per-instrument trace. */
export function getReplayDiagnostics() {
  const snapshot = replaySnapshot();
  const state = snapshot.state;

  const instruments = marketStore.listStocks().map((stock) => {
    const entry = perInstrument.get(stock.id);
    if (!entry) {
      return {
        stockId: stock.id,
        symbol: stock.symbol,
        instrumentKey: stock.instrumentKey,
        mappingStatus: 'VERIFIED',
        dataAvailability: 'UNAVAILABLE',
        eventsAvailable: 0,
        eventsProcessed: 0,
        acceptedEvents: 0,
        rejectedEvents: 0,
        firstHistoricalEventAt: null,
        lastHistoricalEventAt: null,
        lastProcessedHistoricalTime: null,
        lastReceivedAt: null,
        lastPrice: null,
        lastRejectionReason: null,
        sourceGranularity: null,
        status: 'UNAVAILABLE'
      };
    }
    const quote = marketStore.getQuote(stock.id);
    return {
      ...entry,
      symbol: stock.symbol,
      lastPrice: quote?.price ?? entry.lastPrice,
      dataAvailability: entry.eventsAvailable > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
      status: instrumentStatus(entry, state)
    };
  });

  return {
    mode: config.marketDataMode,
    generatedAt: new Date().toISOString(),
    replay: snapshot,
    dataset: datasetSummary(dataset),
    processing: {
      ...counters,
      eventsScheduled: snapshot.counters?.eventsScheduled ?? 0,
      scheduledNotEmitted: Math.max(0, (snapshot.counters?.eventsScheduled ?? 0) - counters.eventsEmitted)
    },
    broadcast: {
      batchesEmitted: marketStore.stats.broadcastBatches,
      quotesEmitted: marketStore.stats.broadcastQuotes,
      socketClients: marketStore.stats.socketClients
    },
    frontend: {
      clientsReporting: marketStore.stats.frontendReportClients,
      lastClientReportAt: marketStore.stats.lastFrontendReportAt
    },
    instruments
  };
}

export { REPLAY_STATES };
