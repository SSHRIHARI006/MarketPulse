import { config } from '../config/env.js';

/**
 * Historical replay engine.
 *
 * Reads a loaded, already-normalised event stream and emits it in chronological
 * order at a chosen multiple of the original speed.
 *
 * Scheduling is elapsed-time based, not a chain of fixed timers: every anchor
 * records (wall clock, historical clock), and an event is due when
 *
 *     anchorWall + (eventTs - anchorHistorical) / speed <= now
 *
 * so a slow timer or a paused tab cannot cause the replay to drift, and a speed
 * change rebases the anchor without losing the cursor (spec 7.4).
 *
 * The engine owns replay state; the frontend never decides playback state, it only
 * sends commands and renders what the backend reports.
 */

export const REPLAY_STATES = Object.freeze({
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR'
});

const ALLOWED_SPEEDS = config.replay.speeds;
// Timers fire a little late; anything due within this window is emitted now.
const SCHEDULE_TOLERANCE_MS = 2;
// Cap on how much the scheduler may run ahead in one wake, so a huge dataset at a
// high speed cannot block the event loop for long.
const MAX_RUN_AHEAD_MS = 250;

export class ReplayEngine {
  constructor({
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    now = () => Date.now(),
    onBatch = null,
    onStateChange = null,
    onError = null,
    speeds = ALLOWED_SPEEDS,
    maxBatchEvents = config.replay.maxBatchEvents
  } = {}) {
    this._setTimeout = setTimeoutFn;
    this._clearTimeout = clearTimeoutFn;
    this._now = now;
    this._onBatch = onBatch;
    this._onStateChange = onStateChange;
    this._onError = onError;
    this._speeds = speeds;
    this._maxBatchEvents = maxBatchEvents;

    this._timer = null;
    this._session = null;
    this._cursor = 0;
    this._generation = 0;
    this._anchor = null;
    this._speed = 1;
    this._startedAt = null;
    this._error = null;
    this._emittedByStock = new Map();

    this._state = REPLAY_STATES.IDLE;
    this._counters = this._emptyCounters();
  }

  _emptyCounters() {
    return {
      eventsEmitted: 0,
      batches: 0,
      eventsScheduled: 0
    };
  }

  get state() {
    return this._state;
  }

  get sessionId() {
    return this._session?.sessionId ?? null;
  }

  get generation() {
    return this._generation;
  }

  get speed() {
    return this._speed;
  }

  /** Loads a normalised dataset (see dataset.loadSession) and arms the cursor. */
  load(session) {
    if (!session || !Array.isArray(session.events)) {
      throw new Error('A replay session must provide an event array');
    }
    this._cancelTimer();
    this._generation += 1;
    this._session = {
      sessionId: session.sessionId,
      tradingDate: session.tradingDate,
      granularity: session.granularity,
      source: session.source,
      previousCloses: session.previousCloses ?? new Map(),
      coverage: session.coverage ?? null,
      instruments: session.instruments ?? [],
      unavailableInstruments: session.unavailableInstruments ?? [],
      rejections: session.rejections ?? null,
      stats: session.stats ?? null,
      events: session.events ?? []
    };
    this._cursor = 0;
    this._emittedByStock = new Map();
    this._counters = this._emptyCounters();
    this._startedAt = null;
    this._error = null;
    this._anchor = null;
    this._setState(REPLAY_STATES.READY);
    return this;
  }

  play(speed) {
    if (speed !== undefined) this.setSpeed(speed);
    if (!this._session) throw Object.assign(new Error('No replay session is loaded'), { status: 409 });
    if (this._state === REPLAY_STATES.PLAYING) return this.status();
    if (this._state === REPLAY_STATES.COMPLETED) {
      throw Object.assign(new Error('Replay has completed; reset it before playing again'), { status: 409 });
    }
    if (this._state === REPLAY_STATES.ERROR) {
      throw Object.assign(new Error('Replay is in an error state; reset it before playing'), { status: 409 });
    }
    if (this._state === REPLAY_STATES.LOADING) {
      throw Object.assign(new Error('Replay session is still loading'), { status: 409 });
    }
    if (this._session.events.length === 0) {
      throw Object.assign(new Error('This session has no replayable events'), { status: 409 });
    }

    this._startedAt = this._startedAt ?? this._now();
    this._anchor = {
      wall: this._now(),
      // Anchor on the next unprocessed event, so resuming continues immediately from
      // where playback stopped instead of re-waiting the gap that was paused through.
      historical: this._nextEventTs() ?? this._clockMs()
    };
    this._setState(REPLAY_STATES.PLAYING);
    this._schedule();
    return this.status();
  }

  pause() {
    if (this._state !== REPLAY_STATES.PLAYING) return this.status();
    this._cancelTimer();
    this._setState(REPLAY_STATES.PAUSED);
    return this.status();
  }

  reset() {
    this._cancelTimer();
    this._cursor = 0;
    this._anchor = null;
    this._startedAt = null;
    this._error = null;
    this._emittedByStock = new Map();
    this._counters = this._emptyCounters();
    this._setState(this._session ? REPLAY_STATES.READY : REPLAY_STATES.IDLE);
    return this.status();
  }

  setSpeed(speed) {
    const value = Number(speed);
    if (!Number.isFinite(value) || !this._speeds.includes(value)) {
      throw Object.assign(
        new Error(`speed must be one of: ${this._speeds.join(', ')}`),
        { status: 400 }
      );
    }
    // Rebase so the change applies from now on without moving the cursor.
    if (this._state === REPLAY_STATES.PLAYING) {
      this._anchor = { wall: this._now(), historical: this._clockMs() };
    }
    this._speed = value;
    if (this._state === REPLAY_STATES.PLAYING) this._schedule();
    return this.status();
  }

  /** Marks an unrecoverable dataset/processing error and stops playback. */
  fail(error) {
    this._cancelTimer();
    this._error = error?.message || String(error);
    this._setState(REPLAY_STATES.ERROR);
    this._onError?.(error);
    return this.status();
  }

  _cancelTimer() {
    if (this._timer !== null) {
      this._clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _setState(state) {
    if (this._state === state) return;
    this._state = state;
    this._onStateChange?.(this.status());
  }

  _nextEventTs() {
    const next = this._session?.events[this._cursor];
    return next ? Date.parse(next.providerTimestamp) : null;
  }

  _clockMs() {
    const next = this._session?.events[this._cursor];
    if (this._cursor === 0 && next) return Date.parse(next.providerTimestamp);
    const previous = this._session?.events[this._cursor - 1];
    if (previous) return Date.parse(previous.providerTimestamp);
    return next ? Date.parse(next.providerTimestamp) : null;
  }

  _nextDueWall(event) {
    if (!this._anchor) return this._now();
    return this._anchor.wall + (Date.parse(event.providerTimestamp) - this._anchor.historical) / this._speed;
  }

  _schedule() {
    this._cancelTimer();
    if (this._state !== REPLAY_STATES.PLAYING) return;

    const next = this._session?.events[this._cursor];
    if (!next) {
      this._complete();
      return;
    }

    const dueAt = this._nextDueWall(next);
    const delay = Math.max(0, Math.min(dueAt - this._now(), MAX_RUN_AHEAD_MS));
    const generation = this._generation;
    this._timer = this._setTimeout(() => {
      this._timer = null;
      // A timer from an older generation must never touch the current session.
      if (generation !== this._generation) return;
      this._onTimer();
    }, delay);
  }

  _onTimer() {
    if (this._state !== REPLAY_STATES.PLAYING) return;

    const now = this._now();
    // A late timer may leave several events due; emit up to one batch worth and
    // reschedule immediately for the rest rather than blocking the loop.
    const batch = [];
    while (this._cursor < this._session.events.length) {
      const event = this._session.events[this._cursor];
      if (this._nextDueWall(event) > now + SCHEDULE_TOLERANCE_MS) break;
      batch.push(event);
      this._cursor += 1;
      if (batch.length >= this._maxBatchEvents) break;
    }

    if (batch.length) {
      this._counters.eventsEmitted += batch.length;
      this._counters.eventsScheduled += batch.length;
      this._counters.batches += 1;
      for (const event of batch) {
        this._emittedByStock.set(event.stockId, (this._emittedByStock.get(event.stockId) || 0) + 1);
      }
      try {
        this._onBatch?.(batch, this._batchMeta(batch));
      } catch (error) {
        this.fail(error);
        return;
      }
    }

    if (this._cursor >= this._session.events.length) {
      this._complete();
      return;
    }
    this._schedule();
  }

  _batchMeta(batch) {
    const last = batch[batch.length - 1];
    return {
      sessionId: this._session.sessionId,
      tradingDate: this._session.tradingDate,
      generation: this._generation,
      providerTimestamp: last.providerTimestamp,
      clock: new Date(Date.parse(last.providerTimestamp)).toISOString(),
      firstEventId: batch[0].eventId,
      lastEventId: last.eventId
    };
  }

  _complete() {
    this._cancelTimer();
    this._setState(REPLAY_STATES.COMPLETED);
  }

  status() {
    const total = this._session?.events.length ?? 0;
    const processed = this._cursor;
    const firstEvent = this._session?.events[0];
    const lastEvent = this._session?.events[total - 1];
    const clockMs = total ? this._clockMs() : null;
    return {
      mode: 'replay',
      state: this._state,
      sessionId: this._session?.sessionId ?? null,
      tradingDate: this._session?.tradingDate ?? null,
      granularity: this._session?.granularity ?? null,
      source: this._session?.source ?? null,
      speed: this._speed,
      allowedSpeeds: this._speeds,
      error: this._error,
      progress: {
        processedEvents: processed,
        totalEvents: total,
        percentage: total ? Math.round((processed / total) * 10000) / 100 : 0
      },
      clock: {
        // The simulated market time is a historical timestamp, never the wall clock.
        currentHistoricalTime: clockMs ? new Date(clockMs).toISOString() : null,
        firstEventAt: firstEvent?.providerTimestamp ?? null,
        lastEventAt: lastEvent?.providerTimestamp ?? null,
        startedAt: this._startedAt ? new Date(this._startedAt).toISOString() : null
      },
      counters: { ...this._counters }
    };
  }

  /** Per-instrument emission counts, merged with dataset availability by the session layer. */
  emittedByStock() {
    return new Map(this._emittedByStock);
  }
}
