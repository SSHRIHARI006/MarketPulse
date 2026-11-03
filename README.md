# MarketPulse

Real-time stock market intelligence and analytics for a tracked NSE universe.

MarketPulse collects market data, decodes and validates updates, stores selected
observations in PostgreSQL, computes statistical analytics, and presents the result as
a live treemap heatmap with rankings, unusual-activity detection, sector intelligence
and per-stock analytics.

**Educational project — not investment advice.** All analytics cover only the tracked
NIFTY 50 universe (50 constituents). The platform does not execute trades.

---

## Highlights

| Area | What is implemented |
|---|---|
| Tracked universe | All 50 NIFTY 50 constituents with provider instrument keys, sectors and market-cap reference data (`backend/src/data/nifty50.js`, applied by `database/seed.sql`) |
| Live heatmap | D3 treemap grouped by sector; area = market cap / volume / equal; continuous colour gradient with configurable neutral band; per-tile drill-in; updates over WebSocket without reloads; green/red flash on a price move |
| Feed health | Backend-derived connection state (`CONNECTING` → `AUTHORIZING` → `SUBSCRIBING` → `CONNECTED` → `RECEIVING`, plus `RECONNECTING` / `AUTH_ERROR`), subscription counts and per-instrument freshness (`FRESH` / `STALE` / `UNAVAILABLE` / `CLOSED`) |
| Snapshot reconciliation | `/api/market/snapshot` every 5 s (configurable) repairs missed socket events from the backend cache; it never triggers provider requests and never fabricates movement |
| Market overview | NIFTY 50 and SENSEX cards, advancing/declining counts, average change, volatility (all labelled as tracked-universe metrics) |
| Leaders & laggards | Top performer, biggest decliner, highest relative volume, most volatile (1-minute return std-dev) |
| Stock intelligence | Momentum (5 & 20 session), relative volume, volatility, risk-adjusted score, near 52-week high/low |
| Activity detection | Volume spike, sudden price movement, volatility spike, combined 0–100 activity score, deduplicated event feed |
| Sectors | Average return, advancing/declining counts, best/worst, click-through to filter the heatmap |
| Insights | Rule-based observations, each with the measured evidence |
| Stock detail | Quote fields, price chart with SMA20/SMA50/EMA20 overlays, RSI 14, volume chart, historical statistics |
| Comparison | Two or three stocks, prices normalised to 100, return/volatility/momentum comparison |
| Watchlists | Create lists, add/remove tracked stocks, live prices (single shared demo account) |

---

## Quick start (Docker)

```bash
cp .env.example .env      # optional; defaults work for demo mode
docker compose up --build
```

- Frontend: <http://localhost:5000>
- Backend API: <http://localhost:4000/api/health>

The backend waits for PostgreSQL readiness, applies `database/schema.sql` and
`database/seed.sql` (both idempotent), seeds demo history on first boot, then starts
the market data collector, candle aggregator and event detectors.

## Quick start (local)

Requires Node.js 20+ and PostgreSQL 14+.

```bash
# 1. Database
createdb marketpulse
export DATABASE_URL=postgresql://user:pass@localhost:5432/marketpulse

# 2. Backend (port 4000)
cd backend && npm install && npm start

# 3. Frontend (port 5173, proxies /api and /socket.io to :4000)
cd frontend && npm install && npm run dev
```

---

## Data modes

`MARKET_DATA_MODE` selects the data source and the UI always shows which one is active.

- **`demo` (default)** — a simulated feed built on seeded history. Values move and the
  analytics are genuinely computed, but the data is synthetic. The UI shows a DEMO
  badge and a banner stating that values are simulated. Indices are derived from the
  weighted move of the tracked stocks.
- **`replay`** — streams previously stored one-minute bars back through the pipeline in
  chronological order, at 1x/2x/5x/10x, with play/pause/reset and a simulated market
  clock. Nothing is generated: every emitted price is a stored observation, tagged with
  its original timestamp. The UI shows a REPLAY badge, `SIMULATED LIVE · HISTORICAL
  DATA REPLAY`, the trading date and the simulated time. No provider token is needed.
- **`live`** — connects to the Upstox Market Data Feed V3. Requires
  `UPSTOX_ACCESS_TOKEN`. The adapter authorises the feed, subscribes to **all 50
  constituents plus the index instruments** in `full` mode (batched requests), decodes
  protobuf frames, validates every tick and reconnects with exponential backoff,
  resubscribing each time.

### Live setup checklist

1. Copy `.env.example` to `.env`, set `MARKET_DATA_MODE=live` and paste a valid
   `UPSTOX_ACCESS_TOKEN`. The token stays on the backend; it is never sent to the
   browser or returned by an API response.
2. `docker compose up --build` (or `cd backend && npm start`).
3. Verify the universe: `curl localhost:4000/api/market/universe` → `total: 50`.
4. Verify the feed: `curl localhost:4000/api/market/diagnostics`. A healthy live feed
   reports `connection: "RECEIVING"`, `subscribed: 50`, a recent `lastMessageAt` and
   `receivingUpdates` close to 50.
5. Open <http://localhost:5000>. The header shows `LIVE`, the feed state, the
   subscribed count and the last feed message time. The DEMO banner disappears only
   after the backend reports `RECEIVING` (valid data), never merely because live mode
   was selected.

If the market is closed, the last valid prices remain with `dataStatus: "CLOSED"` and
no new trades occur — the platform does not simulate movement in LIVE mode.

### Live-mode notes

- Instrument keys are stored per stock and must come from the provider's instrument
  master. Refresh them with `cd backend && npm run sync-instruments`. The script
  validates every symbol, reports missing/ambiguous symbols and key collisions, keeps
  the previous mapping when it cannot verify one, and exits non-zero if the universe is
  not fully verified.
- The bundled `backend/src/feed/MarketDataFeedV3.proto` mirrors the documented V3
  response shape. The provider's published file is authoritative: run
  `npm run fetch-proto`, then set `UPSTOX_PROTO_PATH` to the downloaded file.
  Decoding is driven by field names, so a revised schema does not require code changes
  as long as message names are preserved.
- Upstox access tokens expire (typically daily). An invalid or expired token moves the
  feed to `AUTH_ERROR`; the backend logs the reason (never the token) and retries with
  backoff, and the UI shows an authentication banner instead of presenting stale data
  as live. Update the token and restart. A decoded frame that fails validation is
  counted as a rejected tick and cannot overwrite a cached price.
- `LIVE_SNAPSHOT_REFRESH_MS` (default 5000) controls the reconciliation poll and
  `LIVE_STALE_THRESHOLD_MS` (default 15000) controls when a quote becomes `STALE`.
  Freshness uses message timestamps, not price equality, so an unchanged price is not
  marked stale merely because it did not move.

---

## Historical replay

```bash
# .env
MARKET_DATA_MODE=replay
```

Docker Compose and a local `npm start` both honour it; `backend/src/replay/` contains
the whole subsystem.

```text
stock_candles (1m, source='demo')     →  dataset.loadSession()   (validate, order, reject)
                                              │
                                              ▼
                                       replay engine            (cursor + elapsed-time scheduler)
                                              │  batches, chronological
                                              ▼
                              sanitizeTick() → processTick()    (the LIVE/DEMO pipeline)
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
              candle aggregator (bucketed by the historical minute)   Socket.IO
                     │                                                 │
                     ▼                                                 ▼
                 analytics                                   React context → dashboard
```

### Historical data audit (Stage 0 deliverable)

Measured against the running database, not assumed:

| Field | Finding |
|---|---|
| Data source | PostgreSQL `stock_candles` (`interval='1m'`, `source='demo'`) |
| Granularity | One-minute OHLCV bars (`ONE_MINUTE_CANDLE`) — there is no tick-level history |
| Price fields | open, high, low, close, volume per minute (volume is per-bar, accumulated into session volume by the pipeline) |
| Trading dates | 2026-10-30, 2026-11-02, 2026-11-03 (IST) |
| Instruments | 13–50 of the 50 tracked stocks, depending on the session |
| Coverage | 2026-11-03 50/50 · 2026-11-02 13/50 · 2026-10-30 13/50 |
| Event count | 17,944 · 5,640 · 5,625 usable bars respectively |
| Timestamps | Stored as `timestamptz`, validated and re-sorted on load |
| Missing data | Older sessions predate the 50-stock expansion; indexes have no stored history |
| Data-quality issues | Two retired constituents hold bars (reported as `UNKNOWN_INSTRUMENT`), and the DEMO simulator writes bars outside 09:15–15:30 IST, which are excluded from a session |

The dataset sustains the demonstration: one session covers the full universe with a
complete trading day at minute granularity.

### Controls and API

```http
GET  /api/replay/sessions      # available sessions + real coverage
POST /api/replay/load          # { "sessionId": "2026-11-03" }
POST /api/replay/play          # { "speed": 5 }
POST /api/replay/pause
POST /api/replay/reset
POST /api/replay/speed         # { "speed": 10 }
GET  /api/replay/status
GET  /api/replay/diagnostics
```

Allowed speeds are 1x, 2x, 5x, 10x; anything else is rejected with `400`. Conflicting
transitions (playing a completed or empty session) return `409`. The dashboard shows
all controls; `/diagnostics` shows the pipeline stage by stage.

### Behaviour worth knowing

- **Backend-authoritative.** The browser never runs its own scheduler; it sends
  commands and renders the state returned by the engine. One shared session exists for
  the whole backend, so every connected client observes the same play/pause/speed/reset
  (spec 16.4).
- **Timing.** Scheduling is elapsed-time based (`anchorWall + (eventTs − anchor) / speed`),
  so late timers do not accumulate drift and a speed change rebases without moving the
  cursor.
- **Provenance.** Replay writes candles with `source = 'replay'` and deletes only those
  on reset; the dataset it reads (`source = 'demo'`) is never modified. Tick sampling is
  disabled in replay because a replayed price has no meaningful wall-clock tick time.
- **Timestamps.** Each event keeps its historical timestamp; `receivedAt`/`updatedAt`
  record actual processing time. Freshness, intraday baselines and market status are all
  evaluated on the simulated clock, so a paused replay freezes instead of going stale,
  and a 10x replay does not compress "last 5 minutes" to 30 seconds.
- **Session isolation.** Every quote carries its replay `sessionId`; the frontend merge
  (`frontend/src/lib/quoteMerge.js`) drops observations from a superseded session, so a
  delayed batch from the previous session cannot corrupt the new one.

---

## Architecture

```
React + Tailwind (Vite)  ──REST /api──▶  Express controllers
        │                                   │
        └──── Socket.IO (live push) ────────┤
                                            ▼
                              services/          jobs/
                              marketStore        marketCollector (sampled ticks + retention)
                              marketData         candleAggregator (OHLCV flush + rollups)
                              heatmap            eventDetection (rule engine)
                              analytics
                              candle
                                            │
                                            ▼
                                   PostgreSQL 16
```

Data flow: provider frame → protobuf decode → `sanitizeTick` validation → in-memory
latest-price cache → candle aggregation + sampled persistence → analytics recompute →
batched Socket.IO broadcast (250 ms) → affected heatmap tiles only. In parallel, the
frontend re-reads `/api/market/snapshot` every `LIVE_SNAPSHOT_REFRESH_MS` and merges it
per stock (newest message wins) to repair anything a dropped socket missed.

### Project layout

```
backend/
  src/config/      env, PostgreSQL pool, readiness + schema bootstrap
  src/feed/        Upstox V3 adapter, protobuf decoder, demo feed, .proto schema
  src/services/    market store, market data, heatmap, analytics, candles, detection
  src/controllers/ market, stock, analytics, event, watchlist
  src/routes/      REST routing per resource
  src/websocket/   Socket.IO server + batched broadcasts
  src/jobs/        tick collector, candle aggregator
  src/utils/       indicators, validators, activity score, IST time helpers
  scripts/         instrument-master sync, proto download
  test/            node:test suites for indicators, validation, heatmap, scoring
frontend/
  src/components/  heatmap, overview, movers, rankings, activity, sectors, insights, panel
  src/pages/       dashboard, stock detail, comparison, watchlist
  src/context/     single Socket.IO connection + merged quote cache
database/          schema.sql, seed.sql
docker-compose.yml frontend + backend + PostgreSQL
```

---

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Liveness and active mode |
| GET | `/api/market/overview` | Indices, breadth, average change, volatility |
| GET | `/api/market/heatmap?range=&sector=&sizeBy=` | Heatmap tiles, sector grouping, summary |
| GET | `/api/market/status` | Connection state, subscription counts, market status, freshness |
| GET | `/api/market/snapshot` | Consolidated 50-stock snapshot from the in-memory cache (5 s reconciliation) |
| GET | `/api/market/diagnostics` | Feed state, subscribed/receiving counts, rejected ticks, decode errors, reconnects, per-instrument last update |
| GET | `/api/market/universe` | Tracked constituent list with instrument keys, sectors and data status |
| GET | `/api/market/movers` | Top performer, biggest decliner, relative volume, volatility |
| GET | `/api/market/insights` | Rule-based insights |
| GET | `/api/stocks` | Tracked universe with latest quotes |
| GET | `/api/stocks/:id` | Stock overview, metrics, indicators |
| GET | `/api/stocks/:id/history?interval=1m\|5m\|15m\|1d&limit=` | Candles + indicator overlays |
| GET | `/api/stocks/:id/analytics` | Alias of the stock analytics payload |
| GET | `/api/analytics/momentum` | Momentum ranking |
| GET | `/api/analytics/volatility` | Highest/lowest volatility, all stocks |
| GET | `/api/analytics/volume-spikes` | Stocks above the relative-volume threshold |
| GET | `/api/analytics/sectors` | Sector aggregation + members |
| GET | `/api/analytics/activity` | Events + activity scores |
| GET | `/api/analytics/compare?ids=1,2,3&window=60` | Normalised comparison |
| GET | `/api/analytics/intelligence` | All rankings in one payload |
| GET | `/api/events`, `/api/events/recent` | Event history |
| GET/POST | `/api/watchlists`, `/:id/stocks` | Watchlist CRUD |
| GET | `/api/replay/sessions` | Historical sessions with real coverage |
| POST | `/api/replay/load`, `/play`, `/pause`, `/reset`, `/speed` | Replay controls |
| GET | `/api/replay/status`, `/api/replay/diagnostics` | Replay state and pipeline trace |

`range` accepts `daily`, `session`, `5m`, `15m`, `1h`. `sizeBy` accepts `marketCap`,
`volume`, `equal`.

### Socket.IO events

Server → client: `market:snapshot` (sent first), `market:update`, `heatmap:update`,
`market:status`, `market:event`, `market:connection` (includes `state` and
`subscription`). `market:update` and `heatmap:update` carry a server-computed
`dataStatus` per quote. One shared Socket.IO connection serves the whole app; quote
updates are batched every 250 ms.

In REPLAY mode the same market events are reused, extended with a `replay` block
(`sessionId`, `tradingDate`, `state`, `clock`, `speed`), plus `replay:status` (throttled
to the 250 ms batch) and the lifecycle events `replay:loading`, `replay:loaded`,
`replay:started`, `replay:paused`, `replay:resumed`, `replay:completed`, `replay:error`
and `replay:reset` (which is followed by a fresh `market:snapshot`).
Client → server: `heatmap:subscribe`, `heatmap:unsubscribe`, `replay:client-report`
(per-client receipt acknowledgement; the backend counts those separately from
`io.emit`, which is not proof that a browser rendered anything).

---

## Analytical definitions

- **Percentage change** — daily change uses the previous close; intraday ranges use the
  first observation at or after the range start. If no baseline exists the API returns
  `changePct: null` and `available: false`, and the tile shows `n/a` rather than zero.
- **Relative volume** — session volume ÷ (20-session average daily volume × elapsed
  session fraction).
- **Momentum score** — `0.6 × 5-session return + 0.4 × 20-session return` (percent).
- **Volatility** — standard deviation of daily returns, annualised (×√252). Intraday
  volatility uses 1-minute returns.
- **Risk-adjusted score** — mean daily return ÷ standard deviation of daily returns.
  A simplified indicator, **not** a formal Sharpe ratio.
- **Activity score** — 0–100 blend of relative volume, absolute 15-minute movement and
  recent-vs-historical volatility. An internal indicator, not a financial metric.
- **52-week range** — materialised in `stock_reference` from stored daily candles.

## Data storage

- Every observation row (`market_ticks`, `stock_candles`, `stock_reference`) carries a
  `source` of `demo`, `live` or `replay`. Analytics and charts query only the active
  mode's source, and demo history is never seeded in LIVE mode, so simulated and real
  data can never be compared as one series. A replay writes under `replay` while
  reading the dataset it was configured with (`REPLAY_DATASET_SOURCE`), so it never
  alters its own source.
- `market_ticks` is sampled (one observation per stock per `TICK_SAMPLE_INTERVAL_MS`),
  not every tick, with a retention sweep (`TICK_RETENTION_HOURS`).
- `stock_candles` stores 1m buckets written by the aggregator plus 5m/15m rollups and
  daily bars, unique on `(stock_id, interval, candle_start)`.
- Candle writes are batched and upserted; a failed flush is retried on the next cycle.

## Testing

```bash
cd backend && npm test
```

Covers indicator maths (SMA/EMA/RSI/volatility/momentum), tick validation and rejection
of invalid prices, timestamps and unknown instruments, heatmap change/sector/size
filtering, unavailable intraday baselines, stale marking, request validation and
activity scoring. It also covers Phase 2 behaviour: the 50-constituent universe and
seed/reference-file consistency, instrument-master matching (missing, ambiguous,
colliding and unchanged mappings), feed lifecycle states, timestamp-based freshness,
snapshots that include untraded stocks without fabricating prices, diagnostics counters
and DEMO coverage for every constituent.

Phase 3 adds 16 backend tests (dataset normalisation and rejection reasons, chronological
ordering, duplicate/identical timestamps, caps, all engine transitions and timing at
1x/2x/5x/10x, reset, session switching, and the pipeline's historical timestamp handling
for quotes and candles) and 8 frontend tests for the quote-merge policy used by both the
snapshot and socket paths.

```bash
cd frontend && npm test        # merge policy: ordering, duplicates, session guard
cd frontend && npm run build   # production build check
```

## Known limitations

- 50 tracked stocks (NIFTY 50); rankings and breadth are universe-scoped, not the whole
  market. Index cards use the provider's index feed in LIVE mode and a weighted
  simulation in DEMO mode.
- LIVE mode has not been confirmed against a live provider session in this repository's
  test environment (no token is committed). The adapter, subscription, decoding,
  validation, state machine and diagnostics are implemented and unit-tested; run the
  checklist above with a real token to confirm provider connectivity.
- Historical analytics depend on collected data. A fresh database is backfilled with
  demo history only in DEMO mode; in LIVE mode observations start accumulating when the
  feed is enabled and insufficient history is reported as unavailable, never invented.
- Market capitalisation is approximate reference data stamped with `market_cap_as_of`
  and used only to weight heatmap tile area. It is not current market capitalisation;
  refresh it from a documented source and update the date.
- Watchlists are shared by a single demo account; authentication is an optional later
  milestone.
- Demo mode is a simulation and is labelled as such everywhere it appears.
- Replay is one-minute candle replay, not tick replay: the stored dataset has no
  individual trades, so no trades are invented. Each tile moves once per replayed
  minute, which is why 5x/10x feel closer to a live feed.
- The dataset has no index history, so the NIFTY 50 / SENSEX cards read “awaiting index
  data” during replay instead of showing a computed or carried-over level.
- Only sessions stored in `stock_candles` are replayable. Sessions with partial
  coverage (13/50 for the older dates) are listed with their real coverage and the
  missing instruments stay unavailable rather than being filled in.
- One shared replay session exists per backend; per-client playback and replaying a
  hand-picked subset of instruments are not implemented.
