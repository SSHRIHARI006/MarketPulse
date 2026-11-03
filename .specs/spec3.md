# MarketPulse – Spec 3

## Historical Data Replay, Pipeline Reliability & End-to-End Dashboard Simulation

**Project:** MarketPulse – Real-Time Stock Market Intelligence & Analytics Platform  
**Phase:** Phase 3  
**Target:** Build a reliable historical-data replay system that simulates a live market-data pipeline across all 50 NIFTY 50 constituents.  
**Status:** Proposed implementation specification  
**Repository:** https://github.com/SSHRIHARI006/MarketPulse

---

# 1. Context and Existing Architecture

MarketPulse is a full-stack stock-market intelligence and analytics platform designed around the NIFTY 50 universe.

The project already contains the core infrastructure required to process and display market updates.

## 1.1 Backend

- Node.js + Express.
- Upstox Market Data Feed V3 adapter.
- Protobuf decoding using `protobufjs`.
- Instrument synchronisation using NSE constituent data and Upstox instrument master.
- In-memory `MarketStore`.
- PostgreSQL persistence.
- OHLCV candle aggregation.
- Analytics and event detection.
- Socket.IO broadcasting.
- Snapshot, diagnostics and universe APIs.

## 1.2 Frontend

- React + Vite.
- Tailwind CSS.
- D3-based stock heatmap.
- Single shared Socket.IO connection.
- Snapshot reconciliation.
- Per-stock quote cache.
- Dashboard, stock details, comparison and watchlists.

## 1.3 Existing market-data pipeline

The current LIVE pipeline is:

```text
Upstox V3 WebSocket
        |
        v
WebSocket Adapter
        |
        v
Protobuf Decoder
        |
        v
sanitizeTick()
        |
        v
processTick()
        |
        v
MarketStore.applyTick()
        |
        +---------------------+
        |                     |
        v                     v
Candle Aggregator       Socket.IO
        |                     |
        v                     v
Analytics              React Context
                              |
                              v
                           Heatmap
```

The core pipeline is already implemented.

However, genuine live market-data access introduces practical limitations:

- Access-token management.
- Provider restrictions.
- Subscription limitations.
- Market-data availability.
- Potentially expensive data subscriptions.
- Difficulty obtaining a reliable live feed for a college demonstration.

The project should not depend on a paid or continuously available external provider to demonstrate its core functionality.

## 1.4 New direction

MarketPulse will introduce a **Historical Data Replay Engine**.

The replay engine will read previously collected historical market data and emit timestamped market events over time.

These events will enter the same internal processing pipeline used by LIVE mode.

The result should be a dashboard that behaves like a live market-data application while accurately identifying its data as historical replay.

The existing LIVE provider integration must remain available for future use.

---

# 2. Problem Statement

The current DEMO functionality is not sufficient to demonstrate the complete behaviour of a real-time market-data application.

A static or periodically refreshed dataset cannot adequately demonstrate:

1. Individual stock updates arriving over time.
2. Market-store updates.
3. Real-time candle construction.
4. Analytics changing as new events arrive.
5. Socket.IO broadcasting.
6. Frontend state reconciliation.
7. Heatmap changes.
8. Pause, resume and playback speed.
9. Historical session progression.
10. End-to-end event processing and diagnostics.

The project needs a reproducible way to demonstrate these behaviours without relying on an external live market-data subscription.

The solution is a replay system that processes existing historical data as a chronological stream.

**Important distinction:**

Historical data replay is not genuine live market data.

The dashboard must clearly identify the source as simulated historical data and display the original trading date and simulated market time.

No fabricated market movements, trades or timestamps may be presented as actual historical observations.

---

# 3. Primary Objectives

## 3.1 P0 objectives

1. Audit the historical data already available in the project.
2. Establish a consistent historical event format.
3. Implement a controllable replay engine.
4. Support chronological event playback.
5. Support configurable playback speeds.
6. Support pause, resume and reset.
7. Route replayed events through the existing market-data processing pipeline.
8. Update the market store using replayed events.
9. Support candle aggregation during replay.
10. Update analytics as replay events are processed.
11. Broadcast replayed updates through Socket.IO.
12. Update the React dashboard without page reloads.
13. Prevent duplicate and out-of-order updates.
14. Provide instrument-level replay diagnostics.
15. Clearly distinguish historical replay from genuine LIVE data.
16. Preserve existing DEMO and LIVE functionality.
17. Verify the complete pipeline using automated tests.

## 3.2 P1 objectives

1. Support selection of historical trading sessions.
2. Support replay progress tracking.
3. Support configurable replay speed.
4. Support replay completion and restart.
5. Support deterministic playback.
6. Support replay-session diagnostics.
7. Improve the developer diagnostics interface.
8. Support partial-universe replay.
9. Support replaying selected instruments for debugging.
10. Provide a polished simulation experience for demonstrations.

## 3.3 Explicit non-objectives

- Purchasing a real-time market-data subscription.
- Replacing Upstox.
- Removing the existing LIVE provider adapter.
- Fabricating individual trades from OHLCV candles.
- Generating artificial historical price movements.
- Building a trading engine.
- Adding investment recommendations.
- Migrating to microservices.
- Introducing Kafka or Redis.
- Rewriting the existing dashboard.
- Replacing the existing database.
- Rebuilding all existing analytics.

The current application architecture should be preserved.

---

# 4. Requirement 1 – Data Mode Architecture

MarketPulse must support three distinct data modes.

```text
MARKET_DATA_MODE

       |
       +------------------+
       |                  |
       v                  v
      DEMO              REPLAY
       |                  |
       v                  v
 Static / Existing    Historical Data
 Demo Behaviour       Replay Engine
       |                  |
       v                  v
       +--------+---------+
                |
                v
         Common Processing
             Pipeline

                ^
                |
               LIVE
                |
                v
         Upstox WebSocket
```

All modes must remain isolated.

## 4.1 DEMO mode

Preserve the existing DEMO implementation.

It should continue to work as it currently does unless a specific compatibility change is required.

Do not silently convert DEMO into REPLAY.

## 4.2 REPLAY mode

Introduce a new mode:

```env
MARKET_DATA_MODE=replay
```

REPLAY mode must:

- Load a selected historical dataset.
- Initialise the replay engine.
- Emit events according to their original chronological ordering.
- Apply the configured playback speed.
- Route events through the common processing pipeline.
- Update the dashboard through existing Socket.IO infrastructure.
- Expose replay controls and replay diagnostics.

## 4.3 LIVE mode

Preserve the existing Upstox integration.

```env
MARKET_DATA_MODE=live
UPSTOX_ACCESS_TOKEN=...
```

LIVE mode must continue using the actual Upstox feed.

Do not make the application depend on an Upstox token when operating in REPLAY mode.

## 4.4 Provider abstraction

Introduce a common internal market-data interface if the existing architecture does not already provide one.

Suggested interface:

```javascript
class MarketDataProvider {
    async connect() {}

    async subscribe(instruments) {}

    async disconnect() {}

    onTick(callback) {}
}
```

Implementations:

```text
MarketDataProvider
       |
       +------ UpstoxProvider
       |
       +------ HistoricalReplayProvider
```

The purpose is to keep the event-processing pipeline independent of the source.

Do not overengineer this abstraction or rewrite working code unnecessarily.

---

# 5. Requirement 2 – Historical Data Audit

This is the first implementation stage.

Before writing the replay engine, inspect the repository and identify the historical data actually available.

Do not assume that the project contains tick-level data.

## 5.1 Identify historical data sources

Inspect:

- Existing PostgreSQL tables.
- Historical price records.
- OHLCV candle tables.
- Existing CSV or JSON datasets.
- Any downloaded market-data files.
- Existing DEMO fixtures.
- Existing historical data-fetching or storage services.

Produce a report identifying:

| Field | Description |
|---|---|
| Data source | Database, CSV, JSON or another source |
| Granularity | Tick, one-minute candle, five-minute candle, etc. |
| Trading dates | Available historical sessions |
| Instruments | Number of distinct instruments |
| Coverage | Which of the 50 stocks are available |
| Event count | Total available observations |
| Timestamp quality | Whether timestamps are valid and ordered |
| Missing data | Missing instruments or intervals |
| Price fields | LTP, OHLC, volume and other available fields |
| Storage | Current database or file location |

## 5.2 Data granularity classification

The replay engine must support the granularity actually available.

### A. Tick-level data

If individual market events are available:

```json
{
  "instrumentKey": "NSE_EQ|INE002A01018",
  "symbol": "RELIANCE",
  "price": 1320.50,
  "volume": 100,
  "providerTimestamp": "2026-11-02T09:15:01.000Z"
}
```

Replay individual events in chronological order.

Tick-level data offers the most realistic simulation.

### B. OHLCV candle data

If only candle data is available:

```json
{
  "symbol": "RELIANCE",
  "timestamp": "2026-11-02T09:15:00.000Z",
  "open": 1320.00,
  "high": 1322.50,
  "low": 1319.00,
  "close": 1321.50,
  "volume": 12000
}
```

Replay candle observations at their historical intervals.

Do not generate fictional trades or claim that a candle represents an individual trade.

If the existing dashboard requires a changing LTP, use the historical candle's available close value as the observation for that interval and identify its source granularity.

Do not interpolate or invent intermediate market prices.

## 5.3 Historical data coverage

The replay system must support partial instrument coverage.

For example:

```text
Configured instruments: 50
Available instruments: 48
Unavailable instruments: 2
```

The replay engine must not silently create data for missing instruments.

Unavailable instruments should be clearly identified.

## 5.4 Data quality validation

Before a replay session begins, validate:

- Instrument identifiers.
- Stock-to-instrument mapping.
- Timestamp validity.
- Chronological ordering.
- Price validity.
- OHLC consistency where applicable.
- Non-negative volume.
- Duplicate observations.
- Missing required fields.

Invalid records should be counted and reported.

Do not allow one malformed record to terminate the entire replay session unless the dataset itself cannot be loaded safely.

## 5.5 Deliverable

Produce a historical-data audit report before implementing the replay engine.

The report must identify:

1. The actual source of historical data.
2. The available trading dates.
3. The available instruments.
4. The event granularity.
5. The total number of usable observations.
6. Any data-quality issues.
7. Whether the dataset can sustain a useful demonstration.

---

# 6. Requirement 3 – Historical Event Normalisation

Different historical sources may use different field names and formats.

The replay system must normalise them into a common internal event format.

## 6.1 Internal replay event

Suggested structure:

```json
{
  "eventId": "replay-event-000001",
  "source": "historical-replay",
  "sessionId": "replay-session-001",

  "stockId": 12,
  "symbol": "RELIANCE",
  "instrumentKey": "NSE_EQ|INE002A01018",

  "eventType": "QUOTE",

  "price": 1320.50,
  "volume": 100,

  "providerTimestamp": "2026-11-02T09:15:01.000Z",
  "receivedAt": "2026-11-03T10:00:01.000Z",

  "sourceGranularity": "TICK"
}
```

The example is illustrative.

Only include fields supported by the source dataset.

## 6.2 Timestamp separation

Replay events must preserve two different concepts:

**Historical event time**

The original timestamp associated with the historical observation.

**Replay processing time**

The actual time at which the replay engine processes and emits the event.

Maintain separate fields:

| Field | Meaning |
|---|---|
| `providerTimestamp` | Original historical observation timestamp |
| `receivedAt` | Actual backend time when replay event enters the pipeline |
| `processedAt` | Actual backend processing time |
| `broadcastAt` | Actual Socket.IO emission time |
| `clientReceivedAt` | Actual frontend receipt time |
| `replayClock` | Current simulated historical market time |

Never overwrite the original historical timestamp with the current system time.

## 6.3 Event ordering

Events must be ordered using:

1. Historical timestamp.
2. Deterministic tie-breaking using source sequence or stable event ordering.

Multiple instruments can have observations at the same historical timestamp.

The replay engine must support such events without incorrectly dropping them.

## 6.4 Event identity

Every replay event should have a deterministic event identifier or equivalent sequence metadata.

This helps with:

- Duplicate detection.
- Replay diagnostics.
- Debugging.
- Deterministic tests.
- Frontend reconciliation.

---

# 7. Requirement 4 – Replay Engine

The replay engine is the main addition in this phase.

It is responsible for reading historical observations and emitting them over time.

## 7.1 Core responsibilities

The replay engine must:

1. Load a selected historical session.
2. Validate the selected dataset.
3. Sort or verify events chronologically.
4. Maintain a replay cursor.
5. Emit events at the configured speed.
6. Support pause and resume.
7. Support reset.
8. Support completion detection.
9. Maintain replay progress.
10. Expose replay diagnostics.
11. Handle empty or invalid datasets.
12. Avoid duplicate event emission.

## 7.2 Replay state model

Suggested states:

| State | Meaning |
|---|---|
| IDLE | No replay session loaded |
| LOADING | Historical dataset is being loaded |
| READY | Session loaded and ready to play |
| PLAYING | Events are being emitted |
| PAUSED | Playback temporarily stopped |
| COMPLETED | All events have been processed |
| ERROR | Replay cannot continue due to an unrecoverable error |

The state must be maintained by the backend.

The frontend should not independently decide the actual replay state.

## 7.3 Replay controls

The following controls must be supported:

| Control | Behaviour |
|---|---|
| Play | Start or resume playback |
| Pause | Stop event emission temporarily |
| Reset | Return the replay cursor to the beginning |
| Speed | Change playback speed |
| Progress | Display processed-event progress |
| Session | Select a historical trading session |

The controls should be accessible from the dashboard.

## 7.4 Playback speed

Support:

```text
1x
2x
5x
10x
```

Optional additional speeds can be introduced later.

The speed multiplier changes how quickly historical time advances relative to actual time.

Example:

Original event timestamps:

```text
09:15:00
09:15:02
09:15:05
09:15:10
```

At 1x:

```text
09:15:00 -> 0 seconds
09:15:02 -> 2 seconds
09:15:05 -> 5 seconds
09:15:10 -> 10 seconds
```

At 5x:

```text
09:15:00 -> 0 seconds
09:15:02 -> 0.4 seconds
09:15:05 -> 1 second
09:15:10 -> 2 seconds
```

Conceptually:

```javascript
actualDelay = historicalTimeDifference / playbackSpeed;
```

The implementation must use a scheduler that accounts for elapsed time rather than blindly chaining fixed-duration timers.

This is important because JavaScript timers are not guaranteed to execute at exact intervals.

## 7.5 Replay scheduler

Requirements:

- Preserve chronological ordering.
- Preserve relative historical event timing.
- Support multiple events at the same timestamp.
- Support speed changes while playing.
- Avoid duplicate emission after pause and resume.
- Avoid blocking the Node.js event loop.
- Avoid loading an unnecessarily large dataset entirely into memory.
- Use bounded batching or streaming if dataset size requires it.

The replay engine must not emit all historical records immediately.

## 7.6 Pause and resume

When paused:

- No additional replay events may be emitted.
- The current event cursor must be preserved.
- Replay progress must remain unchanged.
- The simulated clock must stop advancing.
- The frontend must display PAUSED.

When resumed:

- Playback must continue from the next unprocessed event.
- Already processed events must not be emitted again.

## 7.7 Reset

Reset must:

1. Stop the scheduler.
2. Reset the event cursor.
3. Reset replay progress.
4. Reset the simulated clock.
5. Reset session-level processing counters.
6. Clear or reinitialise replay-specific in-memory market state.
7. Reset candle aggregation state for the replay session.
8. Reset replay-specific analytics state where necessary.
9. Broadcast the reset state to connected clients.

Do not delete historical source data.

Do not delete unrelated persistent application records.

Reset must be scoped to replay state.

## 7.8 Replay completion

When all events have been processed:

- Transition to COMPLETED.
- Stop the scheduler.
- Preserve the final dashboard state.
- Display the completion status.
- Allow the user to reset and replay the session.

Do not automatically restart unless explicitly configured.

---

# 8. Requirement 5 – Pipeline Integration

This is a critical requirement.

Historical replay must not create a separate simplified dashboard update path.

It must enter the existing market-data processing pipeline.

## 8.1 Required architecture

```text
                DATA SOURCE
                     |
          +----------+----------+
          |                     |
          v                     v
     Upstox LIVE           Historical Data
          |                     |
          v                     v
     Protobuf Decoder      Replay Engine
          |                     |
          v                     v
     Feed Normaliser       Event Normaliser
          |                     |
          +----------+----------+
                     |
                     v
                sanitizeTick()
                     |
                     v
                processTick()
                     |
                     v
              MarketStore
                     |
          +----------+----------+
          |                     |
          v                     v
    Candle Aggregator       Socket.IO
          |                     |
          v                     v
       Analytics           React Context
                                |
                                v
                             Heatmap
```

The exact internal function names may differ depending on the current repository.

Reuse existing functions wherever possible.

## 8.2 Shared processing function

The replay engine should emit normalised events into a shared processing entry point.

For example:

```javascript
async function handleMarketEvent(event) {
    const tick = sanitizeTick(event);

    if (!tick) {
        recordRejectedEvent(event);
        return;
    }

    await processTick(tick);
}
```

This is illustrative.

Adapt the actual implementation to the repository.

Do not duplicate the entire `processTick()` implementation for replay mode.

## 8.3 MarketStore

Replayed observations must update the existing in-memory market store.

Requirements:

- Correct stock identification.
- Correct price updates.
- Correct percentage-change calculation.
- Correct volume handling.
- Correct update timestamps.
- Correct stale/fresh status.
- Correct event emission.

Replay events must not be confused with LIVE events.

The source mode must be available in the market state or event metadata.

## 8.4 Candle aggregation

The existing candle aggregator must consume replay events.

Requirements:

- Use historical event timestamps for candle boundaries.
- Preserve the source granularity.
- Build candles in chronological order.
- Handle multiple events within the same interval.
- Avoid duplicate candle updates.
- Handle replay reset correctly.
- Prevent old replay sessions from contaminating new sessions.

If the source is already OHLCV candles rather than ticks, do not reconstruct fictional tick-level trades.

Use the source data's actual granularity.

## 8.5 Analytics

Existing analytics must work during replay.

Examples:

- Top gainers.
- Top losers.
- Percentage change.
- Market breadth.
- Sector performance, if supported.
- Stock comparisons.
- Historical price trends.
- Existing event detection.

Analytics should update as replay events are processed.

Do not calculate all final-session analytics at the beginning and display them as if they are changing live.

## 8.6 Persistence isolation

Historical source data must remain unchanged.

Replay should not accidentally insert duplicate historical observations into the original source tables.

If replay-session persistence is required, use a separate replay-specific storage mechanism or clearly scoped session records.

Do not introduce a database migration unless necessary.

---

# 9. Requirement 6 – Replay API and Controls

Introduce replay-specific endpoints.

Use the existing Express route conventions.

Suggested API:

## 9.1 Get available sessions

```http
GET /api/replay/sessions
```

Returns available historical sessions.

Example:

```json
{
  "sessions": [
    {
      "sessionId": "2026-11-02",
      "tradingDate": "2026-11-02",
      "instrumentCount": 50,
      "eventCount": 12000,
      "granularity": "TICK",
      "status": "AVAILABLE"
    }
  ]
}
```

All values are illustrative.

Only report actual available data.

## 9.2 Load session

```http
POST /api/replay/load
```

Example request:

```json
{
  "sessionId": "2026-11-02"
}
```

Expected behaviour:

- Validate the session.
- Load or initialise the replay dataset.
- Prepare the replay cursor.
- Initialise replay state.
- Return session metadata.

Do not start playback automatically unless explicitly requested.

## 9.3 Play

```http
POST /api/replay/play
```

Example:

```json
{
  "speed": 1
}
```

## 9.4 Pause

```http
POST /api/replay/pause
```

## 9.5 Reset

```http
POST /api/replay/reset
```

## 9.6 Change speed

```http
POST /api/replay/speed
```

Example:

```json
{
  "speed": 5
}
```

Validate allowed speed values.

Changing speed must not reset replay progress.

## 9.7 Get replay status

```http
GET /api/replay/status
```

Example:

```json
{
  "mode": "replay",
  "state": "PLAYING",
  "sessionId": "2026-11-02",

  "tradingDate": "2026-11-02",

  "speed": 5,

  "progress": {
    "processedEvents": 5000,
    "totalEvents": 12000,
    "percentage": 41.67
  },

  "clock": {
    "currentHistoricalTime": "2026-11-02T11:30:00.000Z",
    "startedAt": "2026-11-03T10:00:00.000Z"
  }
}
```

All values are illustrative.

The actual status must come from the backend replay engine.

## 9.8 API validation

All replay endpoints must:

- Validate request bodies.
- Return appropriate HTTP status codes.
- Reject invalid session identifiers.
- Reject unsupported playback speeds.
- Handle conflicting state transitions.
- Avoid multiple concurrent replay schedulers.
- Provide useful error messages.

---

# 10. Requirement 7 – Socket.IO Replay Events

Preserve the existing Socket.IO architecture.

The existing service already broadcasts market updates and heatmap updates.

Replay mode should reuse these events wherever possible.

## 10.1 Replay status event

Introduce:

```text
replay:status
```

It should contain:

- Session ID.
- Replay state.
- Trading date.
- Playback speed.
- Current historical time.
- Processed event count.
- Total event count.
- Progress percentage.

## 10.2 Replay lifecycle events

Suggested events:

```text
replay:loaded
replay:started
replay:paused
replay:resumed
replay:reset
replay:completed
replay:error
```

Do not create unnecessary events if the existing architecture can communicate the same state cleanly.

## 10.3 Market updates

Replayed market events should continue using the existing market update mechanism.

Example:

```json
{
  "eventId": "replay-event-000001",
  "source": "historical-replay",
  "sessionId": "2026-11-02",

  "quotes": [
    {
      "stockId": 12,
      "symbol": "RELIANCE",
      "price": 1320.50,

      "providerTimestamp": "2026-11-02T09:15:01.000Z",

      "receivedAt": "2026-11-03T10:00:01.000Z",

      "sourceGranularity": "TICK"
    }
  ]
}
```

Preserve existing payload fields for backward compatibility.

## 10.4 Broadcast instrumentation

Track:

- Replay events processed.
- Quotes queued for broadcast.
- Broadcast batches created.
- Quotes included in batches.
- Connected Socket.IO clients.
- Broadcast errors where detectable.

Do not interpret `io.emit()` as proof that a browser rendered an update.

Frontend receipt should be measured separately.

---

# 11. Requirement 8 – Frontend Replay Experience

The existing dashboard design must be preserved.

The new replay controls should integrate with the existing visual theme.

Do not redesign the entire dashboard.

## 11.1 Simulation indicator

Display a persistent and clearly visible indicator:

```text
SIMULATED LIVE
HISTORICAL DATA REPLAY
```

The indicator must remain visible throughout replay.

Do not use labels such as:

- LIVE MARKET DATA
- LIVE NSE FEED
- REAL-TIME MARKET DATA

for replayed historical observations.

## 11.2 Replay information

Display:

- Historical trading date.
- Simulated market time.
- Replay state.
- Playback speed.
- Progress percentage.
- Number of processed events.

Example:

```text
SIMULATED LIVE

Trading date: 02 Nov 2026
Market time: 11:30:00 IST

Status: PLAYING
Speed: 5x

Progress: 41.67%
Events: 5,000 / 12,000
```

All values are illustrative.

## 11.3 Replay control panel

Provide:

```text
[ Play ] [ Pause ] [ Reset ]

Speed:
[ 1x ] [ 2x ] [ 5x ] [ 10x ]

Progress:
==================--------
```

The exact visual layout should follow the existing dashboard style.

## 11.4 Session selection

If multiple historical sessions are available, allow selection from the available session list.

Show only sessions that have passed the required dataset validation.

If only one session is available, the UI should still work without requiring an unnecessary selector.

## 11.5 Frontend state management

The frontend must obtain replay state from the backend.

Do not implement an independent browser-only replay scheduler.

The backend is the source of truth for:

- Replay state.
- Playback speed.
- Event progress.
- Session identity.
- Simulated market time.

The frontend should send commands and render the returned state.

## 11.6 Existing dashboard behaviour

The following must continue to work:

- All available stock tiles remain visible.
- Heatmap colours update as observations arrive.
- Stock details update correctly.
- Market analytics update.
- Candlestick charts update where supported.
- Watchlists remain functional.
- No page reload is required.
- No unnecessary heatmap reconstruction occurs on every update.

## 11.7 Paused and completed states

When paused:

- Display PAUSED.
- Freeze the simulated market clock.
- Stop incoming replay updates.

When completed:

- Display COMPLETED.
- Preserve the final dashboard state.
- Allow the user to reset and replay.

---

# 12. Requirement 9 – Data Consistency and Event Ordering

Historical replay must be deterministic.

The same dataset, session and playback configuration should produce the same sequence of market events.

## 12.1 Backend ordering

For each instrument:

- Preserve historical timestamps.
- Preserve event sequence.
- Reject invalid observations.
- Prevent older events from overwriting newer values.
- Handle equal timestamps deterministically.
- Preserve partial fields.
- Avoid duplicate event processing.

## 12.2 Frontend merging

Inspect:

```text
frontend/src/context/MarketContext.jsx
```

The frontend currently receives Socket.IO events and reconciles state with snapshots.

Preserve this architecture.

However, replay mode must use a consistent quote-merging policy.

Both snapshots and Socket.IO updates should use one shared merge function.

The merge function must:

1. Identify the stock.
2. Identify the replay session.
3. Compare event sequence or historical timestamps.
4. Prevent older updates from overwriting newer ones.
5. Ignore duplicate events.
6. Preserve fields missing from partial updates.
7. Handle missing timestamps explicitly.
8. Avoid applying events from an old replay session after reset.
9. Update state immutably.

## 12.3 Replay reset protection

Consider:

```text
Session A is playing.
Session A is reset.
Session B is loaded.
A delayed event from Session A arrives.
```

The delayed event must not corrupt Session B.

Use a replay session identifier or generation identifier to reject obsolete events.

## 12.4 Snapshot consistency

A delayed snapshot must not overwrite a newer replay update.

Snapshots should include sufficient replay-session and sequence metadata to identify the state they represent.

---

# 13. Requirement 10 – Instrument-Level Diagnostics

The original instrument-level diagnostics remain important.

They should now support both replay and LIVE modes.

The diagnostics system must explain what happened to an event as it travels through the pipeline.

## 13.1 Instrument lifecycle

Suggested states:

| State | Meaning |
|---|---|
| CONFIGURED | Instrument exists in the tracked universe |
| MAPPED | Valid internal instrument mapping exists |
| AVAILABLE | Historical data exists for this instrument |
| REPLAY_PENDING | Historical events are waiting to be emitted |
| RECEIVING | At least one replay event has entered processing |
| ACTIVE | Recent replay events are being processed |
| COMPLETED | All available session events for this instrument are processed |
| UNAVAILABLE | No usable historical data exists |
| REJECTED | One or more observations failed validation |
| ERROR | Instrument-specific processing failed |

These states must be derived from actual evidence.

## 13.2 Per-instrument metadata

Suggested structure:

```json
{
  "stockId": 12,
  "symbol": "RELIANCE",
  "instrumentKey": "NSE_EQ|INE002A01018",

  "mappingStatus": "VERIFIED",
  "dataAvailability": "AVAILABLE",

  "firstHistoricalEventAt": "2026-11-02T09:15:01.000Z",
  "lastHistoricalEventAt": "2026-11-02T15:29:59.000Z",

  "eventsAvailable": 500,
  "eventsProcessed": 250,

  "acceptedEvents": 249,
  "rejectedEvents": 1,

  "lastPrice": 1320.50,

  "lastProcessedHistoricalTime": "2026-11-02T11:30:00.000Z",

  "lastReceivedAt": "2026-11-03T10:00:01.000Z",

  "status": "ACTIVE"
}
```

This is illustrative.

Do not persist every diagnostic field unnecessarily.

## 13.3 Pipeline counters

Track:

- Historical records loaded.
- Records validated.
- Invalid records.
- Replay events scheduled.
- Replay events emitted.
- Events accepted.
- Events rejected.
- Market-store updates.
- Candle updates.
- Analytics updates.
- Socket.IO broadcasts.
- Frontend events received.
- Frontend updates applied.

## 13.4 Rejection reasons

Suggested reasons:

```text
INVALID_INSTRUMENT_KEY
UNKNOWN_INSTRUMENT
INVALID_PRICE
INVALID_TIMESTAMP
INVALID_OHLC
INVALID_VOLUME
DUPLICATE_EVENT
OUT_OF_ORDER_EVENT
MISSING_REQUIRED_FIELDS
UNSUPPORTED_DATA_FORMAT
DATASET_READ_ERROR
```

Counters must be bounded and available through diagnostics.

Do not generate unbounded logs for every event.

---

# 14. Requirement 11 – Diagnostics API

Preserve and extend:

```http
GET /api/market/diagnostics
```

Introduce or extend:

```http
GET /api/replay/diagnostics
```

## 14.1 Replay diagnostics response

Suggested structure:

```json
{
  "mode": "replay",

  "replay": {
    "state": "PLAYING",
    "sessionId": "2026-11-02",
    "tradingDate": "2026-11-02",
    "speed": 5,

    "processedEvents": 5000,
    "totalEvents": 12000,
    "progressPercentage": 41.67,

    "currentHistoricalTime": "2026-11-02T11:30:00.000Z"
  },

  "dataset": {
    "granularity": "TICK",
    "instrumentsAvailable": 50,
    "recordsLoaded": 12000,
    "invalidRecords": 2
  },

  "processing": {
    "eventsEmitted": 5000,
    "acceptedEvents": 4998,
    "rejectedEvents": 2,
    "marketStoreUpdates": 4998,
    "candleUpdates": 1200
  },

  "broadcast": {
    "batchesEmitted": 450,
    "quotesEmitted": 4998,
    "socketClients": 2
  },

  "frontend": {
    "clientsReporting": 1,
    "lastClientReportAt": "2026-11-03T10:00:05.000Z"
  },

  "instruments": []
}
```

All values are illustrative.

## 14.2 Instrument diagnostics

For each instrument, include:

- Stock ID.
- Symbol.
- Instrument key.
- Mapping status.
- Historical data availability.
- Source granularity.
- Available event count.
- Processed event count.
- Accepted event count.
- Rejected event count.
- First historical event.
- Last historical event.
- Last processed historical timestamp.
- Last actual processing timestamp.
- Latest displayed price.
- Current replay status.
- Last rejection reason, if any.

## 14.3 Diagnostics accuracy

Never report an event as processed simply because it was scheduled.

Maintain separate counters for:

- Loaded.
- Scheduled.
- Emitted.
- Accepted.
- Stored.
- Broadcast.
- Received by frontend.

These represent different pipeline stages.

---

# 15. Requirement 12 – Developer Diagnostics Interface

Create a compact diagnostics page or collapsible panel.

It should be accessible separately from the main dashboard.

## 15.1 Replay summary

Example:

```text
Mode: REPLAY
Session: 02 Nov 2026
State: PLAYING
Speed: 5x
Progress: 41.67%

Events processed: 5,000 / 12,000
```

## 15.2 Dataset summary

```text
Configured instruments: 50
Available instruments: 50
Unavailable instruments: 0

Source granularity: TICK
Historical records: 12,000
Invalid records: 2
```

Use actual values from the dataset.

## 15.3 Pipeline summary

```text
Events emitted:       5,000
Events accepted:      4,998
Events rejected:          2
Market-store updates: 4,998
Candle updates:       1,200
Broadcast batches:      450
```

## 15.4 Instrument table

Suggested columns:

| Symbol | Data available | Events processed | Last price | Status |
|---|---|---:|---:|---|
| RELIANCE | Yes | 250 | Actual value | Active |
| TCS | Yes | 245 | Actual value | Active |
| INFY | Yes | 0 | — | Pending |

Use real dataset and replay values.

## 15.5 Filters

Allow filtering by:

- All stocks.
- Available data.
- Unavailable data.
- Pending.
- Active.
- Completed.
- Rejected events.
- Processing errors.

The diagnostics interface should make it clear where an event is being lost.

Do not clutter the primary dashboard with low-level technical counters.

---

# 16. Requirement 13 – Replay Session Isolation

Replay sessions must not contaminate one another.

## 16.1 Session identity

Every loaded replay must have a unique session identity.

For example:

```text
replay-session-001
replay-session-002
```

The historical trading date and the replay-session identity are separate concepts.

## 16.2 State isolation

Each session must have its own:

- Replay cursor.
- Playback state.
- Playback speed.
- Event counters.
- Simulated clock.
- Instrument processing status.
- Candle aggregation state.
- Replay-specific analytics state.

## 16.3 Switching sessions

When switching sessions:

1. Stop the current replay scheduler.
2. Invalidate the previous replay session.
3. Clear replay-specific in-memory state.
4. Load the requested historical dataset.
5. Validate the dataset.
6. Initialise a new replay session.
7. Broadcast the new session state.

Do not allow delayed events from the previous session to affect the new session.

## 16.4 Multiple clients

For the initial implementation, use one shared backend replay session.

All connected dashboard clients should observe the same replay state.

For example:

- If one client pauses replay, all connected clients observe PAUSED.
- If one client changes playback speed, all clients observe the new speed.
- If one client resets replay, all clients observe the reset.

This behaviour must be documented.

Do not implement independent per-browser replay sessions in this phase.

---

# 17. Requirement 14 – Testing

All replay functionality must be testable without an Upstox account.

## 17.1 Historical data tests

Test:

- Valid historical dataset.
- Empty dataset.
- Missing instrument.
- Invalid price.
- Invalid timestamp.
- Duplicate records.
- Out-of-order records.
- Invalid OHLC values.
- Negative volume.
- Multiple instruments.
- Multiple events with identical timestamps.
- Dataset with partial instrument coverage.

## 17.2 Replay engine tests

Test:

- Loading a session.
- Starting playback.
- Pausing playback.
- Resuming playback.
- Resetting playback.
- Completing playback.
- Changing speed.
- Invalid speed.
- Empty session.
- Repeated play requests.
- Pause during event scheduling.
- Reset during playback.
- Session switching.
- Scheduler cleanup.
- No duplicate event emission.

## 17.3 Timing tests

Use controlled datasets with known timestamp intervals.

Verify:

- 1x preserves the original relative intervals.
- 2x advances historical time twice as quickly.
- 5x advances historical time five times as quickly.
- 10x advances historical time ten times as quickly.
- Speed changes do not reset the event cursor.
- Pause stops the simulated clock.
- Resume continues from the correct position.

Allow reasonable scheduling tolerance because JavaScript timers are not real-time guarantees.

## 17.4 Pipeline tests

Inject a historical event.

Verify:

1. Historical event is loaded.
2. Replay engine emits the event.
3. Event normalisation succeeds.
4. Sanitisation succeeds.
5. Instrument mapping resolves.
6. MarketStore updates.
7. Tick event is emitted.
8. Candle aggregation receives the event.
9. Analytics update.
10. Socket.IO queues the quote.
11. Broadcast contains the correct session and event metadata.
12. Diagnostics counters update.

Repeat with multiple instruments.

## 17.5 Frontend tests

Test:

- Initial replay snapshot.
- Replay status event.
- Play.
- Pause.
- Resume.
- Reset.
- Speed change.
- Progress update.
- Session change.
- Out-of-order events.
- Duplicate events.
- Delayed snapshot.
- Socket disconnection.
- Socket reconnection.
- Old-session events arriving after reset.

Verify that the dashboard never displays an event from a previous replay session.

## 17.6 End-to-end replay tests

Run a complete historical session.

Verify:

- All available instruments are loaded.
- Events are processed chronologically.
- Playback controls work.
- Heatmap updates.
- Stock details update.
- Candles update where supported.
- Analytics update.
- Socket.IO broadcasts updates.
- Frontend receives the updates.
- Replay progress is accurate.
- Replay completion is detected.
- Reset works correctly.

---

# 18. Requirement 15 – Replay Data Integrity and Presentation

This requirement is essential for academic credibility.

## 18.1 Historical data identification

The dashboard must always disclose that replay data is historical.

Display:

```text
SIMULATED LIVE
HISTORICAL DATA REPLAY
```

Also show the original trading date.

## 18.2 No fabricated market data

Do not:

- Generate random prices.
- Generate random volume.
- Invent missing trades.
- Interpolate prices and label them as observed values.
- Change historical timestamps to current timestamps.
- Claim that replay is an actual exchange feed.

If the dataset has gaps, preserve them.

If the dataset contains only OHLCV candles, identify it as candle replay.

## 18.3 Simulated clock

The simulated market clock must advance according to the historical event timestamps and replay speed.

It must stop when paused.

It must reset when replay is reset.

The actual system clock must remain separate for processing and diagnostics.

## 18.4 Market status

Do not calculate actual current market status using a historical replay clock.

The dashboard should display the historical session date and simulated market time.

Any market-open/closed indicator must refer to the replayed historical session, not the current date.

---

# 19. Implementation Plan

Implementation must be staged.

Do not attempt to implement the entire specification in one large change.

## Stage 0 – Repository Baseline and Historical Data Audit

1. Pull the latest repository.
2. Run existing backend tests.
3. Build the frontend.
4. Start the Docker stack in its current working mode.
5. Verify the 50-stock universe.
6. Verify the existing dashboard.
7. Identify all historical data sources.
8. Inspect database schemas and existing fixtures.
9. Determine available event granularity.
10. Identify historical session coverage.
11. Count available observations per instrument.
12. Identify data-quality issues.
13. Save baseline logs and diagnostics.

**Deliverable:** Repository baseline and historical-data audit report.

**Do not implement the replay engine during this stage.**

## Stage 1 – Historical Data Normalisation

1. Identify the source dataset.
2. Define the internal replay event contract.
3. Implement source-specific normalisation.
4. Validate timestamps and prices.
5. Validate instrument mapping.
6. Handle duplicates.
7. Handle invalid records.
8. Establish deterministic event ordering.
9. Implement historical session discovery.
10. Add dataset diagnostics.

**Deliverable:** Validated, normalised historical events ready for replay.

## Stage 2 – Replay Engine

1. Implement replay state management.
2. Implement session loading.
3. Implement event cursor management.
4. Implement chronological event scheduling.
5. Implement playback speed.
6. Implement pause.
7. Implement resume.
8. Implement reset.
9. Implement completion detection.
10. Implement replay status.
11. Implement session isolation.
12. Add replay engine tests.

**Deliverable:** Independently testable historical replay engine.

## Stage 3 – Pipeline Integration

1. Introduce the replay data provider.
2. Reuse existing tick normalisation and processing.
3. Route events through the shared processing pipeline.
4. Update MarketStore.
5. Integrate candle aggregation.
6. Integrate existing analytics.
7. Add replay-session metadata.
8. Prevent duplicate and out-of-order updates.
9. Ensure LIVE and REPLAY remain isolated.
10. Test the complete backend pipeline.

**Deliverable:** Historical events successfully flowing through the existing backend.

## Stage 4 – Socket.IO and Frontend Integration

1. Add replay lifecycle events.
2. Extend market update metadata.
3. Implement replay status synchronisation.
4. Implement replay controls.
5. Add simulated-live indicator.
6. Display historical trading date.
7. Display simulated market time.
8. Display playback speed and progress.
9. Unify snapshot and socket quote merging.
10. Prevent previous-session updates from overwriting current state.
11. Verify heatmap updates.
12. Verify stock details and analytics.

**Deliverable:** Fully functional historical replay experience in the dashboard.

## Stage 5 – Diagnostics Interface

1. Expand replay diagnostics API.
2. Add dataset summary.
3. Add replay pipeline counters.
4. Add per-instrument diagnostics.
5. Add filters.
6. Add frontend receipt diagnostics.
7. Preserve the existing dashboard design.

**Deliverable:** Developer-facing replay diagnostics interface.

## Stage 6 – End-to-End Verification

1. Run backend tests.
2. Run frontend production build.
3. Run a complete historical replay session.
4. Test all playback controls.
5. Test all supported playback speeds.
6. Test reset and session switching.
7. Test partial instrument coverage.
8. Test malformed historical records.
9. Verify candles and analytics.
10. Verify Socket.IO delivery.
11. Verify frontend state consistency.
12. Verify replay completion.
13. Document results.

**Deliverable:** Verified Phase 3 release.

---

# 20. Acceptance Criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-01 | Historical data sources are identified and documented | P0 |
| AC-02 | Dataset granularity is correctly identified | P0 |
| AC-03 | Available instruments and missing coverage are reported | P0 |
| AC-04 | Historical observations are normalised into a common event format | P0 |
| AC-05 | Historical timestamps are preserved | P0 |
| AC-06 | Replay events are emitted chronologically | P0 |
| AC-07 | 1x, 2x, 5x and 10x playback work | P0 |
| AC-08 | Pause and resume preserve replay position | P0 |
| AC-09 | Reset reinitialises replay state correctly | P0 |
| AC-10 | Replay completion is detected correctly | P0 |
| AC-11 | Replay uses the existing backend processing pipeline | P0 |
| AC-12 | MarketStore updates correctly | P0 |
| AC-13 | Candle aggregation works with supported source granularity | P0 |
| AC-14 | Existing analytics update during replay | P0 |
| AC-15 | Socket.IO broadcasts replayed updates | P0 |
| AC-16 | React receives and applies updates correctly | P0 |
| AC-17 | Heatmap updates without page reload | P0 |
| AC-18 | Replay state is synchronised across connected clients | P0 |
| AC-19 | Old replay-session events cannot corrupt a new session | P0 |
| AC-20 | Instrument-level diagnostics are available | P0 |
| AC-21 | Replay diagnostics distinguish loaded, emitted, accepted and broadcast events | P0 |
| AC-22 | Historical data is never presented as genuine current market data | P0 |
| AC-23 | Existing DEMO mode continues working | P0 |
| AC-24 | Existing LIVE provider integration remains available | P0 |
| AC-25 | Backend tests and frontend production build pass | P0 |
| AC-26 | Full historical replay is verified end to end | P0 |

---

# 21. Technical Constraints

1. Preserve the existing Node.js and React architecture.
2. Reuse the existing MarketStore.
3. Reuse the existing candle aggregator.
4. Reuse existing analytics.
5. Preserve the single Socket.IO connection.
6. Preserve existing dashboard functionality.
7. Keep historical source data immutable.
8. Keep replay state separate from LIVE state.
9. Keep replay-specific counters bounded.
10. Do not fabricate market movements.
11. Preserve original historical timestamps.
12. Separate historical event time from actual processing time.
13. Avoid loading unnecessarily large datasets into memory.
14. Avoid unnecessary database migrations.
15. Do not introduce Kafka or Redis.
16. Do not require an Upstox token in REPLAY mode.
17. Keep the existing Upstox adapter intact.
18. Do not redesign the primary dashboard.
19. Ensure replay controls are backend-authoritative.
20. Ensure all replay events carry session identity.

---

# 22. Expected Final Outcome

At the end of Phase 3, MarketPulse should have a complete historical market-data replay system.

A user should be able to:

1. Open MarketPulse.
2. Select a historical trading session.
3. Start replay.
4. Watch stock prices update over time.
5. Observe the heatmap change.
6. Watch market analytics update.
7. Observe candle aggregation.
8. Pause the replay.
9. Resume from the same point.
10. Change playback speed.
11. Reset the session.
12. Inspect event-processing diagnostics.
13. Replay the session again.

Behind the scenes, every replayed event should be traceable through:

```text
Historical Dataset
       |
       v
Replay Engine
       |
       v
Event Normalisation
       |
       v
Validation
       |
       v
MarketStore
       |
       +-------------------+
       |                   |
       v                   v
Candle Aggregator       Socket.IO
       |                   |
       v                   v
Analytics             React Context
                           |
                           v
                        Dashboard
```

For any selected instrument, the developer should be able to determine:

- Does historical data exist?
- How many observations are available?
- What is the original historical timestamp?
- Has the replay engine emitted the event?
- Did validation accept it?
- Did MarketStore update?
- Did candle aggregation receive it?
- Did analytics update?
- Was it broadcast through Socket.IO?
- Did the frontend receive it?
- Was the correct dashboard component updated?

The final dashboard should look and behave like a streaming market-intelligence application while remaining transparent about its data source.

**Final success condition:**

MarketPulse must demonstrate a complete, deterministic and diagnosable market-data processing pipeline using historical data replay, without requiring a paid live market-data subscription and without misrepresenting historical observations as genuine live market data.

The existing LIVE integration should remain available as a future extension, not a dependency for the successful completion or demonstration of Phase 3.