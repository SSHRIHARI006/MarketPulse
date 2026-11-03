import { EventEmitter } from 'node:events';
import { config } from '../config/env.js';
import { percentChange, round } from '../utils/validators.js';

const MAX_HISTORY_POINTS = 6000; // ~2.5h of ticks per stock, bounded memory

/**
 * Feed lifecycle. A connected socket is not proof of a working feed, so
 * RECEIVING is a separate state reached only after a valid tick is accepted.
 *
 *   DISCONNECTED -> CONNECTING -> AUTHORIZING -> SUBSCRIBING -> CONNECTED -> RECEIVING
 *
 * Failure states: RECONNECTING, AUTH_ERROR.
 */
export const CONNECTION_STATES = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  AUTHORIZING: 'AUTHORIZING',
  SUBSCRIBING: 'SUBSCRIBING',
  CONNECTED: 'CONNECTED',
  RECEIVING: 'RECEIVING',
  RECONNECTING: 'RECONNECTING',
  AUTH_ERROR: 'AUTH_ERROR'
});

const CONNECTED_STATES = new Set([
  CONNECTION_STATES.CONNECTED,
  CONNECTION_STATES.RECEIVING
]);

export const DATA_STATUS = Object.freeze({
  FRESH: 'FRESH',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE',
  CLOSED: 'CLOSED'
});

/**
 * In-memory latest-price cache.
 *
 * Every update flows through `applyTick`, which validates the value, updates the
 * cache, appends to a bounded intraday history and emits `tick` so persistence,
 * candle aggregation, detection and Socket.IO broadcasting can react once.
 *
 * It also owns the feed's observable state: connection lifecycle, subscription
 * counts, per-instrument last-message timestamps and diagnostics counters. That is
 * what the snapshot, status and diagnostics endpoints report, so the UI never has
 * to guess whether data is live, stale or simply absent.
 */
class MarketStore extends EventEmitter {
  constructor() {
    super();
    this.stocksByKey = new Map();
    this.stocksById = new Map();
    this.quotes = new Map();
    this.history = new Map();
    this.indices = new Map();
    this.connection = {
      state: CONNECTION_STATES.DISCONNECTED,
      connected: false,
      mode: config.marketDataMode,
      error: null,
      lastMessageAt: null,
      reconnectCount: 0,
      subscribed: 0,
      total: 0
    };
    this.stats = {
      messages: 0,
      ticksAccepted: 0,
      ticksRejected: 0,
      decodeErrors: 0,
      // Broadcast/receipt instrumentation. `io.emit()` is not proof a browser
      // rendered anything, so frontend receipts are counted separately.
      broadcastBatches: 0,
      broadcastQuotes: 0,
      socketClients: 0,
      frontendReportClients: 0,
      lastFrontendReportAt: null
    };
    this.marketInfo = { segmentStatus: {}, observedAt: null, source: null };
    // Replay metadata published by the replay engine (null outside REPLAY mode).
    this.replay = null;
    this.startedAt = new Date();
  }

  /**
   * Simulated market clock in epoch milliseconds. Everything time-relative in a
   * replay (intraday baselines, freshness, market status) must use it instead of the
   * wall clock, otherwise a 10x replay would report a 10x-compressed "5 minutes".
   */
  nowTs() {
    const clock = this.replay?.clock;
    const parsed = clock ? new Date(clock).getTime() : Number.NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  setReplayState(replay) {
    this.replay = replay;
    this.emit('replay:state', replay);
  }

  registerStocks(rows) {
    this.stocksByKey.clear();
    this.stocksById.clear();
    for (const row of rows) {
      const stock = {
        id: row.id,
        symbol: row.symbol,
        companyName: row.company_name ?? row.companyName,
        instrumentKey: row.instrument_key ?? row.instrumentKey,
        exchange: row.exchange,
        sectorId: row.sector_id ?? row.sectorId ?? null,
        sector: row.sector ?? row.sector_name ?? 'Unclassified',
        marketCap: Number(row.market_cap ?? row.marketCap ?? 0),
        marketCapAsOf: row.market_cap_as_of ?? row.marketCapAsOf ?? null,
        isActive: row.is_active ?? true
      };
      this.stocksByKey.set(stock.instrumentKey, stock);
      this.stocksById.set(stock.id, stock);
      if (!this.quotes.has(stock.id)) this.quotes.set(stock.id, this.emptyQuote(stock));
      if (!this.history.has(stock.id)) this.history.set(stock.id, []);
    }
    this.connection.total = this.stocksById.size;
  }

  emptyQuote(stock) {
    return {
      stockId: stock.id,
      symbol: stock.symbol,
      companyName: stock.companyName,
      sector: stock.sector,
      sectorId: stock.sectorId,
      instrumentKey: stock.instrumentKey,
      marketCap: stock.marketCap,
      price: null,
      previousClose: null,
      changePct: null,
      changeAbs: null,
      volume: null,
      lastQuantity: null,
      open: null,
      high: null,
      low: null,
      averagePrice: null,
      tradedAt: null,
      receivedAt: null,
      updatedAt: null,
      stale: true,
      sources: 0,
      // Set for replayed observations only: the historical timestamp used for candle
      // buckets and the simulated clock, never the wall clock.
      candleAt: null,
      providerTimestamp: null,
      sourceGranularity: null,
      sessionId: null,
      eventId: null
    };
  }

  getStockByKey(instrumentKey) {
    return this.stocksByKey.get(instrumentKey) || null;
  }

  getStockById(id) {
    return this.stocksById.get(Number(id)) || null;
  }

  listStocks() {
    return [...this.stocksById.values()];
  }

  /** All provider instrument keys to subscribe: stocks plus index instruments. */
  getInstrumentKeys() {
    const stockKeys = [...this.stocksByKey.keys()];
    const indexKeys = config.indices.map((index) => index.key);
    return [...new Set([...stockKeys, ...indexKeys])];
  }

  getQuote(stockId) {
    return this.quotes.get(Number(stockId)) || null;
  }

  listQuotes() {
    return [...this.quotes.values()];
  }

  getHistory(stockId) {
    return this.history.get(Number(stockId)) || [];
  }

  /**
   * Applies a validated tick. Returns false when the instrument is not tracked or
   * the value is rejected, so callers can drop unknown/invalid provider messages.
   * A rejected tick never overwrites a valid cached price.
   */
  applyTick(tick) {
    if (!tick || typeof tick.instrumentKey !== 'string') {
      this.stats.ticksRejected += 1;
      return false;
    }
    const stock = this.stocksByKey.get(tick.instrumentKey);
    if (!stock) {
      // Unknown instruments are expected on a shared feed; count them, do not log
      // every occurrence.
      this.stats.ticksRejected += 1;
      return false;
    }

    const previous = this.quotes.get(stock.id);
    // Replay events are ordered by historical time and carry deterministic IDs.
    // Enforce that contract at the store boundary as well, so a delayed or
    // duplicated event cannot roll the dashboard back after reset/reconnect.
    if (tick.sessionId && previous?.sessionId === tick.sessionId) {
      if (tick.eventId && previous.eventId === tick.eventId) {
        this.stats.ticksRejected += 1;
        return false;
      }
      const incomingTs = tick.providerTimestamp ? new Date(tick.providerTimestamp).getTime() : null;
      const previousTs = previous.providerTimestamp ? new Date(previous.providerTimestamp).getTime() : null;
      if (Number.isFinite(incomingTs) && Number.isFinite(previousTs) && incomingTs < previousTs) {
        this.stats.ticksRejected += 1;
        return false;
      }
    }
    const previousClose = tick.previousClose ?? previous?.previousClose ?? null;
    const changePct = percentChange(tick.lastPrice, previousClose);
    const changeAbs = changePct === null ? null : tick.lastPrice - previousClose;
    const receivedAt = tick.receivedAt ?? new Date();

    const quote = {
      ...previous,
      price: tick.lastPrice,
      previousClose,
      changePct: changePct === null ? null : round(changePct, 4),
      changeAbs: changeAbs === null ? null : round(changeAbs, 4),
      volume: tick.volume ?? previous?.volume ?? null,
      lastQuantity: tick.lastQuantity ?? previous?.lastQuantity ?? null,
      open: tick.open ?? previous?.open ?? null,
      high: tick.high ?? previous?.high ?? null,
      low: tick.low ?? previous?.low ?? null,
      averagePrice: tick.averagePrice ?? previous?.averagePrice ?? null,
      tradedAt: tick.lastTradedAt ?? previous?.tradedAt ?? null,
      receivedAt,
      updatedAt: receivedAt,
      stale: false,
      sources: (previous?.sources || 0) + 1,
      // Replay provenance travels with the quote so the UI can reject events from a
      // previous session instead of silently applying them.
      candleAt: tick.candleAt ?? null,
      providerTimestamp: tick.providerTimestamp ?? null,
      sourceGranularity: tick.sourceGranularity ?? null,
      sessionId: tick.sessionId ?? null,
      eventId: tick.eventId ?? null
    };

    this.quotes.set(stock.id, quote);
    this.stats.ticksAccepted += 1;
    this.recordFeedMessage(receivedAt);

    // A valid tick proves the feed is delivering data, not merely connected.
    if (this.connection.state === CONNECTION_STATES.CONNECTED) {
      this.setConnection({ state: CONNECTION_STATES.RECEIVING });
    }

    const points = this.history.get(stock.id) || [];
    // Replayed points are stamped with the historical time so range comparisons use
    // the simulated clock rather than the wall clock.
    points.push({
      ts: (tick.candleAt ? new Date(tick.candleAt) : receivedAt).getTime(),
      price: tick.lastPrice,
      volume: quote.volume
    });
    if (points.length > MAX_HISTORY_POINTS) points.splice(0, points.length - MAX_HISTORY_POINTS);
    this.history.set(stock.id, points);

    this.emit('tick', quote);
    return true;
  }

  /** First observation at or after `fromTs`; used for interval-relative change. */
  priceAtOrAfter(stockId, fromTs) {
    const points = this.getHistory(stockId);
    for (const point of points) {
      if (point.ts >= fromTs) return point;
    }
    return null;
  }

  applyIndexTick(instrumentKey, tick) {
    const definition = config.indices.find((index) => index.key === instrumentKey);
    if (!definition || !tick) return false;
    const previous = this.indices.get(instrumentKey) || {
      symbol: definition.symbol,
      name: definition.name,
      price: null,
      previousClose: null,
      changePct: null,
      updatedAt: null
    };
    const previousClose = tick.previousClose ?? previous.previousClose ?? null;
    const changePct = percentChange(tick.lastPrice, previousClose);
    this.indices.set(instrumentKey, {
      ...previous,
      price: round(tick.lastPrice, 2),
      previousClose,
      changePct: changePct === null ? null : round(changePct, 2),
      updatedAt: tick.receivedAt ?? new Date()
    });
    this.recordFeedMessage(tick.receivedAt ?? new Date());
    return true;
  }

  getIndices() {
    return config.indices.map((definition) => {
      const live = this.indices.get(definition.key);
      return (
        live || {
          symbol: definition.symbol,
          name: definition.name,
          price: null,
          previousClose: null,
          changePct: null,
          updatedAt: null
        }
      );
    });
  }

  recordFeedMessage(at = new Date()) {
    this.stats.messages += 1;
    this.connection.lastMessageAt = at;
  }

  recordDecodeError() {
    this.stats.decodeErrors += 1;
  }

  recordBroadcast(quoteCount) {
    this.stats.broadcastBatches += 1;
    this.stats.broadcastQuotes += quoteCount;
  }

  recordSocketClients(count) {
    this.stats.socketClients = count;
  }

  recordFrontendReport(clientCount) {
    this.stats.frontendReportClients = clientCount;
    this.stats.lastFrontendReportAt = new Date().toISOString();
  }

  recordRejectedTick() {
    this.stats.ticksRejected += 1;
  }

  setConnection(patch) {
    const next = { ...this.connection, ...patch };
    if (patch.state !== undefined) {
      next.connected = CONNECTED_STATES.has(patch.state) || patch.state === CONNECTION_STATES.SUBSCRIBING;
    } else if (patch.connected !== undefined) {
      // Legacy callers only report connectivity; map it onto the state machine.
      next.state = patch.connected ? CONNECTION_STATES.CONNECTED : CONNECTION_STATES.DISCONNECTED;
      next.connected = patch.connected;
    }
    if (next.state === CONNECTION_STATES.AUTH_ERROR) next.error = next.error || 'Provider rejected authorisation';
    this.connection = next;
    this.emit('connection', this.connection);
  }

  setSubscription({ subscribed, total }) {
    if (Number.isFinite(subscribed)) this.connection.subscribed = subscribed;
    if (Number.isFinite(total)) this.connection.total = total;
    this.emit('connection', this.connection);
  }

  setMarketInfo(info) {
    this.marketInfo = { ...info, observedAt: new Date() };
  }

  get connectionState() {
    return this.connection.state;
  }

  /** Data status for one quote, derived from message timestamps, never price equality. */
  getDataStatus(quote, now = this.nowTs()) {
    if (!quote || quote.price === null || quote.price === undefined) return DATA_STATUS.UNAVAILABLE;
    const last = quote.updatedAt ?? quote.receivedAt;
    if (!last) return DATA_STATUS.UNAVAILABLE;
    if (!this.getMarketStatus().isOpen) return DATA_STATUS.CLOSED;
    // In a replay the observation is current when the simulated clock is close to the
    // historical timestamp it came from; the wall-clock age of the last event would
    // mark every tile stale as soon as playback is paused.
    const observedAt = quote.candleAt ? new Date(quote.candleAt).getTime() : new Date(last).getTime();
    return now - observedAt <= config.live.staleThresholdMs ? DATA_STATUS.FRESH : DATA_STATUS.STALE;
  }

  /** Recomputes the coarse `stale` flag after the freshness window elapses. */
  markStale(now = Date.now()) {
    // Replay freshness is measured on the simulated clock, which stops when paused.
    if (this.connection.mode === 'replay') return false;
    let changed = false;
    for (const [id, quote] of this.quotes) {
      if (!quote.updatedAt) continue;
      const isStale = now - new Date(quote.updatedAt).getTime() > config.live.staleThresholdMs;
      if (isStale !== quote.stale) {
        this.quotes.set(id, { ...quote, stale: isStale });
        changed = true;
      }
    }
    return changed;
  }

  /** Per-instrument last valid update, for diagnostics. */
  getInstrumentUpdates() {
    return this.listQuotes().map((quote) => ({
      stockId: quote.stockId,
      symbol: quote.symbol,
      instrumentKey: quote.instrumentKey,
      lastMessageAt: quote.updatedAt ? new Date(quote.updatedAt).toISOString() : null,
      dataStatus: this.getDataStatus(quote)
    }));
  }

  /** Compact payload pushed to clients; never claims freshness it cannot prove. */
  snapshot(now = this.nowTs()) {
    const quotes = this.listQuotes().map((quote) => ({
      ...quote,
      dataStatus: this.getDataStatus(quote, now)
    }));
    return {
      mode: this.connection.mode,
      connectionStatus: this.connection.state,
      connected: this.connection.connected,
      subscription: this.getSubscriptionSummary(now),
      marketStatus: this.getMarketStatus(),
      freshness: this.getFreshness(),
      quotes,
      indices: this.getIndices(),
      replay: this.replay,
      serverTime: new Date().toISOString(),
      simulatedTime: new Date(now).toISOString(),
      snapshotRefreshMs: config.live.snapshotRefreshMs
    };
  }

  /**
   * Clears everything replay-derived before a new session starts: cached quotes,
   * intraday history and counters. Stored history is never touched here.
   */
  resetReplayState() {
    for (const stock of this.stocksById.values()) {
      this.quotes.set(stock.id, this.emptyQuote(stock));
      this.history.set(stock.id, []);
    }
    this.indices.clear();
    this.stats.messages = 0;
    this.stats.ticksAccepted = 0;
    this.stats.ticksRejected = 0;
    this.stats.decodeErrors = 0;
    this.connection.lastMessageAt = null;
  }

  getSubscriptionSummary(now = this.nowTs()) {
    const total = this.stocksById.size;
    const receiving = this.listQuotes().filter(
      (quote) => this.getDataStatus(quote, now) === DATA_STATUS.FRESH
    ).length;
    return {
      totalInstruments: total,
      subscribedInstruments: this.connection.subscribed || 0,
      instrumentsReceivingUpdates: receiving
    };
  }

  getMarketStatus() {
    // A replayed session's open/closed status belongs to the historical date, never
    // to the current wall clock (spec 18.4).
    if (this.connection.mode === 'replay' && this.replay?.clock) {
      const at = new Date(this.replay.clock);
      const ist = new Date(at.getTime() + 5.5 * 3600 * 1000);
      const day = ist.getUTCDay();
      const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      const open = day >= 1 && day <= 5 && minutes >= 555 && minutes <= 930;
      return {
        isOpen: open,
        label: open ? 'Session open (replay)' : 'Session closed (replay)',
        source: 'replay-clock',
        tradingDate: this.replay.tradingDate ?? null,
        providerSegmentStatus: null,
        observedAt: this.replay.clock
      };
    }

    const segmentStatus = this.marketInfo.segmentStatus?.NSE_EQ;
    // The provider's segment status is authoritative when we have one.
    if (segmentStatus) {
      const status = String(segmentStatus).toUpperCase();
      const open = status.includes('OPEN');
      const closed = status.includes('CLOSE');
      return {
        isOpen: open,
        label: open ? 'Market open' : closed ? 'Market closed' : 'Market status unavailable',
        source: 'provider',
        providerSegmentStatus: segmentStatus,
        observedAt: this.marketInfo.observedAt
      };
    }

    const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
    const day = nowIst.getUTCDay();
    const minutes = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
    const open = day >= 1 && day <= 5 && minutes >= 555 && minutes <= 930; // 09:15–15:30 IST
    return {
      isOpen: open,
      label: open ? 'Market open' : 'Market closed',
      source: 'schedule',
      providerSegmentStatus: null,
      observedAt: this.marketInfo.observedAt
    };
  }

  getFreshness() {
    const last = this.connection.lastMessageAt;
    const age = last ? Date.now() - new Date(last).getTime() : null;
    return {
      lastMessageAt: last ? new Date(last).toISOString() : null,
      secondsSinceLastMessage: age === null ? null : Math.round(age / 1000),
      stale: age === null || age > config.live.staleThresholdMs,
      thresholdMs: config.live.staleThresholdMs
    };
  }

  /** Feed + instrument health, used to locate faults (credentials/subscribe/decode/UI). */
  getDiagnostics() {
    const now = this.nowTs();
    const quotes = this.listQuotes();
    const updates = this.getInstrumentUpdates();
    const statuses = quotes.map((quote) => this.getDataStatus(quote, now));
    const provider =
      this.connection.mode === 'live'
        ? 'upstox-v3'
        : this.connection.mode === 'replay'
          ? 'historical-replay'
          : 'demo-simulation';
    return {
      mode: this.connection.mode,
      provider,
      connection: this.connection.state,
      connected: this.connection.connected,
      error: this.connection.error,
      lastMessageAt: this.connection.lastMessageAt
        ? new Date(this.connection.lastMessageAt).toISOString()
        : null,
      totalInstruments: quotes.length,
      subscribed: this.connection.subscribed || 0,
      receivingUpdates: statuses.filter((status) => status === DATA_STATUS.FRESH).length,
      stale: statuses.filter((status) => status === DATA_STATUS.STALE).length,
      unavailable: statuses.filter((status) => status === DATA_STATUS.UNAVAILABLE).length,
      closed: statuses.filter((status) => status === DATA_STATUS.CLOSED).length,
      rejectedTicks: this.stats.ticksRejected,
      decodeErrors: this.stats.decodeErrors,
      messages: this.stats.messages,
      acceptedTicks: this.stats.ticksAccepted,
      reconnectCount: this.connection.reconnectCount || 0,
      staleThresholdMs: config.live.staleThresholdMs,
      snapshotRefreshMs: config.live.snapshotRefreshMs,
      instruments: updates,
      marketStatus: this.getMarketStatus(),
      uptimeSeconds: Math.round((Date.now() - this.startedAt.getTime()) / 1000)
    };
  }
}

export const marketStore = new MarketStore();
