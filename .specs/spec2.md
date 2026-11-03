# MarketPulse – Spec 2
## Live Market Integration, NIFTY 50 Expansion & Real-Time Dashboard Updates

**Project:** MarketPulse – Real-Time Stock Market Intelligence & Analytics Platform  
**Phase:** Phase 2 – Live Data & Market Coverage  
**Status:** Proposed implementation specification  
**Primary objective:** Make MarketPulse operate with verified live market data across all 50 NIFTY 50 constituents.

---

# 1. Background and Current Implementation

MarketPulse already has a functional full-stack architecture.

The current implementation includes:

- React + Tailwind frontend.
- Node.js + Express backend.
- PostgreSQL database.
- Upstox Market Data Feed V3 adapter.
- Protobuf feed decoding.
- Demo market data simulator.
- In-memory latest-price cache.
- Sampled tick persistence.
- OHLCV candle aggregation.
- Analytics and event detection.
- Socket.IO live update infrastructure.
- D3-based interactive heatmap.
- Dashboard, stock details, comparison and watchlist pages.
- Docker Compose deployment.

The existing application supports two modes:

**DEMO mode**
- Uses simulated market data.
- Generates movement based on seeded historical data.
- Computes analytics using simulated observations.
- Clearly displays the DEMO indicator.

**LIVE mode**
- Connects to Upstox Market Data Feed V3.
- Requires `UPSTOX_ACCESS_TOKEN`.
- Authorises the WebSocket connection.
- Subscribes to instruments in full mode.
- Decodes Protobuf frames.
- Reconnects using exponential backoff.

### Existing limitations

1. Only 15 stocks are currently tracked.
2. The application screenshots show DEMO mode rather than verified live data.
3. Live configuration and actual feed connectivity need end-to-end verification.
4. There is no sufficiently prominent per-instrument freshness and feed-health view.
5. The user should be able to observe price changes without manually refreshing the page.
6. The application needs a robust way to reconcile its frontend snapshot with incoming streaming updates.

**Important implementation principle:** Preserve the existing architecture and working functionality. Extend and repair existing services instead of creating duplicate collectors, WebSocket connections, analytics engines or data stores.

---

# 2. Phase 2 Objectives

The objectives of this phase are:

1. Expand the tracked universe from 15 stocks to all 50 NIFTY 50 constituents.
2. Establish a verified connection to Upstox V3 in LIVE mode.
3. Ensure all 50 instruments are correctly mapped and subscribed.
4. Display incoming price updates on the website in real time.
5. Introduce a configurable 5-second dashboard snapshot refresh as a reconciliation and fallback mechanism.
6. Display accurate connection, market and data-freshness statuses.
7. Ensure the heatmap, rankings, sector analytics and market overview use the expanded universe.
8. Preserve DEMO mode as a working alternative.
9. Provide enough diagnostics and testing evidence to demonstrate that live data is genuinely being received.

---

# 3. Requirement 1 – Expand to All 50 NIFTY 50 Stocks

## 3.1 Stock universe

Replace the existing 15-stock dataset with the complete NIFTY 50 constituent universe.

The stock universe must contain exactly the 50 constituents of the selected reference date.

The initial implementation should cover:

- All 50 constituent companies.
- Their exchange trading symbols.
- Their Upstox instrument keys.
- Their company names.
- Their sector classifications.
- Their market-cap reference values.

The implementation must not depend on manually hardcoding instrument keys throughout the application.

## 3.2 Constituent management

Create a maintainable constituent reference dataset.

Each stock should contain:

| Field | Description |
|---|---|
| id | Internal database identifier |
| symbol | Exchange trading symbol |
| company_name | Full company name |
| instrument_key | Upstox instrument identifier |
| sector_id | Associated sector |
| market_cap | Reference market capitalisation |
| market_cap_as_of | Date of market-cap reference |
| is_active | Whether the stock belongs to the active universe |
| exchange | NSE |

The constituent dataset should have a reference date or last-updated timestamp.

The system must distinguish between:

- NIFTY 50 membership.
- Provider instrument availability.
- Successfully subscribed instruments.
- Instruments currently receiving updates.

These are not necessarily identical states.

## 3.3 Instrument synchronisation

Extend the existing `sync-instruments` script.

Required behaviour:

1. Load the current NIFTY 50 constituent list from a documented source.
2. Load or access the Upstox instrument master.
3. Match each constituent with its correct provider instrument key.
4. Validate that all 50 mappings are unique and valid.
5. Update existing stock records instead of inserting duplicates.
6. Report missing or ambiguous mappings.
7. Preserve the previous valid mapping if a new mapping cannot be verified.

Do not silently substitute an incorrect instrument.

### Acceptance criteria

- All 50 constituent stocks exist in the database.
- All 50 have valid, unique instrument mappings.
- All stocks have sector assignments.
- Market-cap reference data has an as-of date.
- Synchronisation can be repeated safely.

---

# 4. Requirement 2 – Make LIVE Mode Work End-to-End

The existing Upstox V3 adapter should be audited and repaired where necessary.

Do not build a second market-data adapter if the existing implementation can be reused.

## 4.1 Environment configuration

Support the following configuration:

```env
MARKET_DATA_MODE=live

UPSTOX_ACCESS_TOKEN=your_access_token
UPSTOX_PROTO_PATH=./src/feed/MarketDataFeedV3.proto

DATABASE_URL=postgresql://user:password@postgres:5432/marketpulse

PORT=4000

LIVE_SNAPSHOT_REFRESH_MS=5000
LIVE_STALE_THRESHOLD_MS=15000
```

The exact configuration should remain compatible with the existing `.env.example`.

Requirements:

- The access token must remain on the backend.
- Never expose the token through frontend environment variables or API responses.
- Never commit credentials.
- Validate configuration at startup.
- Display a clear error when LIVE mode is selected without valid credentials.

## 4.2 Feed connection lifecycle

The feed adapter must support these states:

```text
DISCONNECTED
     |
     v
CONNECTING
     |
     v
AUTHORIZING
     |
     v
SUBSCRIBING
     |
     v
CONNECTED
     |
     v
RECEIVING UPDATES
```

Failure states:

- Authentication failure.
- Invalid or expired token.
- WebSocket disconnection.
- Subscription failure.
- Protobuf decoding failure.
- Provider timeout.

The adapter should:

1. Authorise using the documented V3 endpoint.
2. Establish the WebSocket connection.
3. Subscribe to all active NIFTY 50 instruments.
4. Receive and decode initial market snapshots.
5. Process subsequent market updates.
6. Reconnect using exponential backoff.
7. Resubscribe after reconnection.
8. Expose useful connection diagnostics.

A successful WebSocket connection alone must not be considered proof of a functioning market feed.

## 4.3 Subscription management

Subscribe to all 50 instruments using valid provider instrument keys.

Use the appropriate feed mode for the application's required data.

The initial scope requires:

- Last traded price.
- Previous close.
- Last traded timestamp.
- Open, high and low where available.
- Volume and other fields needed by existing analytics.

The application should track subscription success separately from connection success.

For example:

```json
{
  "connectionStatus": "CONNECTED",
  "mode": "LIVE",
  "totalInstruments": 50,
  "subscribedInstruments": 50,
  "instrumentsReceivingUpdates": 47,
  "lastMessageAt": "2026-11-03T07:40:00Z"
}
```

This is an illustrative response structure, not a fixed provider response.

## 4.4 Tick validation

Continue using the existing `sanitizeTick` validation layer.

Reject:

- Unknown instrument keys.
- Missing instrument identifiers.
- Invalid prices.
- Negative or non-finite values.
- Invalid timestamps.
- Malformed feed messages.

A rejected tick must not overwrite a valid cached price.

Record decoding and validation errors with sufficient context for debugging, without logging credentials.

---

# 5. Requirement 3 – Real-Time Price Updates on the Website

This is the most important user-facing requirement.

The website must visibly reflect incoming market updates without requiring a manual browser refresh.

## 5.1 Data flow

Preserve and extend the existing architecture:

```text
           UPSTOX V3
               |
          WebSocket Feed
               |
               v
       Existing Feed Adapter
               |
        Protobuf Decoding
               |
          Tick Validation
               |
               v
        In-Memory Market Store
               |
        +------+------+
        |             |
        v             v
   Analytics      PostgreSQL
   Recompute      Persistence
        |
        v
   Socket.IO Server
        |
        v
    React Frontend
        |
        v
  Update Changed UI Components
```

The existing backend already batches Socket.IO broadcasts. Preserve this mechanism and optimise it if necessary.

## 5.2 Frontend update behaviour

When a valid update arrives:

- Update the affected stock's latest price.
- Recalculate its percentage change.
- Update its heatmap tile.
- Update the stock detail quote if that stock is selected.
- Update affected rankings and movers.
- Update relevant market statistics.
- Update the latest-received timestamp.

The application should not reload the page.

The heatmap should update only affected tiles rather than rebuilding the entire interface for every tick.

## 5.3 Visible price movement

Add subtle visual feedback when a stock price changes:

- Green flash for an upward price movement.
- Red flash for a downward price movement.
- Smooth transition of the heatmap tile colour.
- Optional small upward/downward indicator next to the latest price.

The effect should disappear automatically after a short duration.

Avoid excessive animations or distracting blinking.

## 5.4 Snapshot refresh – every 5 seconds

In addition to WebSocket streaming, introduce a configurable dashboard snapshot refresh.

Default:

```env
LIVE_SNAPSHOT_REFRESH_MS=5000
```

The frontend should request a consolidated market snapshot approximately every five seconds.

The snapshot should be used for:

- Reconciling frontend state with the backend's latest-price cache.
- Recovering from missed Socket.IO events.
- Updating aggregate market statistics.
- Correcting temporary client-side inconsistencies.

The snapshot should not be treated as a replacement for the live WebSocket feed.

**Important:**

Do not make 50 independent external market-data requests every five seconds.

The backend should serve the snapshot from its in-memory cache and existing data services.

Do not fabricate price changes between refreshes.

If a stock has not traded, its last valid price should remain unchanged.

If the browser temporarily loses its connection, the next successful snapshot should restore the latest available state.

## 5.5 Snapshot API

Reuse existing endpoints where possible.

If necessary, introduce:

```http
GET /api/market/snapshot
```

Suggested response:

```json
{
  "mode": "live",
  "connectionStatus": "CONNECTED",
  "serverTime": "2026-11-03T07:40:00Z",
  "lastFeedMessageAt": "2026-11-03T07:39:59Z",
  "stocks": [
    {
      "id": 1,
      "symbol": "RELIANCE",
      "ltp": 1320.50,
      "previousClose": 1310.00,
      "changePct": 0.8015,
      "lastTradeTime": "2026-11-03T07:39:58Z",
      "receivedAt": "2026-11-03T07:39:59Z",
      "dataStatus": "FRESH"
    }
  ]
}
```

The response should include all 50 tracked stocks, including stocks whose prices have not changed.

The example contains illustrative values only.

---

# 6. Requirement 4 – Accurate Live Status and Data Freshness

The current dashboard has a DEMO badge, market-open indicator and streaming indicator.

Improve these indicators so that they reflect actual backend state.

## 6.1 Connection status

Support:

| Status | Meaning |
|---|---|
| Connected | Provider WebSocket is connected |
| Connecting | Initial connection is being established |
| Reconnecting | Connection was lost and recovery is in progress |
| Disconnected | No active provider connection |
| Authentication Error | Provider rejected authorisation |

## 6.2 Data freshness

Connection status and data freshness must be separate.

A connected WebSocket does not guarantee that every instrument is receiving updates.

Suggested states:

- FRESH: latest valid update within the configured freshness threshold.
- STALE: no recent update beyond the threshold.
- UNAVAILABLE: no valid price has been received.
- CLOSED: market is closed; last valid closing data is displayed.

Do not mark an unchanged price as stale solely because its numeric value has not changed. Use actual message timestamps and appropriate market/session context.

## 6.3 Market status

Display:

- Market open.
- Pre-open, if supported.
- Market closed.
- Market holiday, if supported.
- Market status unavailable.

Do not assume that an active WebSocket connection means the market is open.

## 6.4 DEMO and LIVE indicators

The UI must display the actual selected and active data mode.

Examples:

**LIVE**

```text
LIVE ● Connected
50 / 50 instruments subscribed
Last feed message: 13:11:05 IST
```

**DEMO**

```text
DEMO ● Simulated data
Values are not actual market activity.
```

**LIVE but disconnected**

```text
LIVE ● Reconnecting
Last valid update: 13:10:32 IST
Some displayed values may be stale.
```

Never remove the DEMO banner simply because LIVE mode has been selected in `.env`.

The banner can disappear only after the backend has confirmed a successful live feed and valid data reception.

---

# 7. Requirement 5 – Expand Existing Analytics to 50 Stocks

All existing analytics should automatically use the expanded tracked universe.

Avoid implementing a separate set of analytics for the additional stocks.

The following components must be updated:

### Market overview

- Advancing stocks.
- Declining stocks.
- Average percentage change.
- Market volatility.
- Index cards, where actual index instruments are available.

Clearly label universe-scoped statistics.

Do not imply that the tracked universe represents the entire market.

### Heatmap

- Display all 50 constituents.
- Group by sector.
- Preserve market-cap, volume and equal-size options.
- Preserve time-range filters.
- Update tiles as new prices arrive.
- Retain the existing neutral colour band.

### Movers

- Top performer.
- Biggest decliner.
- Highest relative volume.
- Most volatile stock.

### Stock intelligence

Preserve existing ranking categories:

- Momentum.
- Relative volume.
- Volatility.
- Risk-adjusted score.
- Near 52-week high.
- Near 52-week low.

### Unusual activity

Continue detecting:

- Volume spikes.
- Sudden price movements.
- Volatility increases.
- Combined activity score.

All these metrics must use actual available observations in LIVE mode.

If historical data is insufficient, return unavailable or insufficient-history states instead of inventing historical comparisons.

### Sector intelligence

Recalculate:

- Average sector movement.
- Advancing and declining stocks.
- Best and worst sector.
- Sector volatility.

The sector dashboard should include the full tracked universe.

---

# 8. Requirement 6 – Historical Data and Reference Data

The current README notes that historical analytics depend on collected data and that market-cap and 52-week references are seeded reference data.

Phase 2 should improve data quality without introducing an unnecessarily large historical-data project.

## 8.1 Live historical data

Continue using the existing:

- Sampled `market_ticks`.
- One-minute OHLCV candles.
- Five-minute rollups.
- Fifteen-minute rollups.
- Daily candles.

Ensure that newly added stocks begin collecting historical observations and candles.

## 8.2 Initial historical data

Where a documented provider source is available, import historical candles for the 50 stocks.

If historical data cannot be obtained:

- Start collecting it from the point live mode is enabled.
- Show insufficient-history indicators.
- Avoid using demo history in LIVE mode.

Never mix synthetic demo observations with real live observations without explicit provenance.

## 8.3 Reference data

Refresh the market-cap reference dataset from a documented source.

Store the reference date.

Do not infer market capitalisation from the current share price.

Do not silently use outdated seeded values as current market capitalisation.

---

# 9. Requirement 7 – Diagnostics and Observability

Add a small diagnostic section to the application or a developer-only diagnostics endpoint.

Suggested endpoint:

```http
GET /api/market/diagnostics
```

Suggested response:

```json
{
  "mode": "live",
  "provider": "upstox-v3",
  "connection": "CONNECTED",
  "lastMessageAt": "2026-11-03T07:40:00Z",
  "totalInstruments": 50,
  "subscribed": 50,
  "receivingUpdates": 47,
  "stale": 3,
  "rejectedTicks": 0,
  "decodeErrors": 0,
  "reconnectCount": 0
}
```

Include:

- Feed connection state.
- Number of configured instruments.
- Number successfully subscribed.
- Number currently receiving updates.
- Last valid feed message.
- Last successful update per instrument.
- Number of rejected ticks.
- Number of decoding errors.
- Reconnection count.

These diagnostics are particularly important for identifying whether a problem is caused by credentials, subscriptions, decoding, backend processing or frontend updates.

---

# 10. Requirement 8 – Performance and Reliability

The expanded system should remain responsive with 50 instruments.

Requirements:

1. Maintain a single shared provider WebSocket connection wherever supported.
2. Maintain a single shared frontend Socket.IO connection.
3. Do not open a separate WebSocket for every stock tile.
4. Continue batching frontend broadcasts.
5. Avoid persisting every individual tick.
6. Keep the existing sampled persistence and candle aggregation strategy.
7. Avoid recalculating every historical indicator on every individual tick.
8. Recalculate only affected data where practical.
9. Ensure reconnection restores subscriptions.
10. Ensure the application recovers from temporary browser and backend network interruptions.

The five-second snapshot endpoint should be served efficiently from cached state.

---

# 11. API and Event Changes

Preserve existing API contracts wherever possible.

Existing endpoints should continue working:

- `/api/market/overview`
- `/api/market/heatmap`
- `/api/market/status`
- `/api/market/movers`
- `/api/market/insights`
- `/api/stocks`
- `/api/analytics/intelligence`
- `/api/analytics/sectors`
- `/api/analytics/activity`

Potential additions:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/market/snapshot` | Consolidated market snapshot |
| GET | `/api/market/diagnostics` | Feed and instrument diagnostics |
| GET | `/api/market/universe` | Current tracked constituent list |

Existing Socket.IO events should be preserved:

- `market:snapshot`
- `market:update`
- `heatmap:update`
- `market:status`
- `market:event`
- `market:connection`

Extend event payloads only where necessary.

The frontend must continue supporting the existing DEMO mode.

---

# 12. Frontend Improvements

Keep the current visual design, layout, colour scheme and component structure.

The existing dashboard UI is already satisfactory.

Do not redesign the product.

Focus on these improvements:

### Top navigation/status area

Display:

- LIVE or DEMO.
- Provider connection state.
- Market state.
- Number of subscribed instruments.
- Last feed update time.

### Heatmap

- Show all 50 stocks.
- Animate tile colour transitions.
- Update individual tiles on incoming data.
- Show stale or unavailable states.
- Preserve sector grouping and filters.

### Market overview

- Recalculate advancing and declining counts.
- Update average movement.
- Update volatility when sufficient data exists.
- Show the scope of tracked-universe statistics.

### Stock detail

- Update current price and percentage movement.
- Update the intraday chart as new data arrives.
- Preserve historical chart behaviour.

### Error states

Display clear messages for:

- Provider disconnection.
- Expired access token.
- Missing instrument mapping.
- No available market data.
- Stale price data.
- Insufficient historical observations.

Avoid showing empty or misleading cards.

---

# 13. Testing Requirements

Testing must demonstrate that the application works with real and simulated feeds.

## 13.1 Instrument tests

- Exactly 50 constituents loaded.
- All 50 instrument keys are valid.
- No duplicate mappings.
- All stocks have sector classifications.
- Re-running the synchronisation script does not duplicate stocks.

## 13.2 Live feed tests

- Valid access token.
- Invalid access token.
- Expired access token.
- Successful authorisation.
- WebSocket disconnection.
- Automatic reconnection.
- Successful resubscription.
- Valid Protobuf frames.
- Invalid Protobuf frames.
- Unknown instruments.
- Invalid price data.

## 13.3 Real-time frontend tests

Simulate a valid price update for a stock.

Verify that:

1. The backend cache changes.
2. The corresponding Socket.IO event is emitted.
3. React receives the event.
4. The stock's price changes.
5. Its percentage movement is recalculated.
6. Its heatmap tile colour changes.
7. The latest update timestamp changes.
8. The page does not reload.

Repeat for multiple stocks.

## 13.4 Snapshot tests

- Snapshot returns all 50 stocks.
- Snapshot reflects the latest backend cache.
- Snapshot works when some stocks have not traded.
- Snapshot reconciles missed frontend updates.
- Snapshot does not generate artificial price movement.
- Snapshot remains available during temporary provider disconnection using the last valid cached values.

## 13.5 Analytics tests

Verify that:

- Advancing + declining + unchanged = available tracked stocks.
- Rankings include all eligible stocks.
- Sector statistics include all relevant members.
- Relative volume handles insufficient historical data.
- Volatility handles insufficient observations.
- Heatmap size and colour are calculated correctly.
- Unavailable values are not converted to zero.

## 13.6 Demo regression tests

DEMO mode must continue working exactly as intended.

Verify:

- Demo values move.
- DEMO banner remains visible.
- All 50 stocks are available in demo mode.
- Existing dashboard analytics work.
- LIVE credentials are not required.

---

# 14. Implementation Plan

Implement in small, independently verifiable stages.

## Stage 0 – Audit Existing Implementation

Inspect the existing code before changing it.

Verify:

- Upstox V3 adapter.
- Protobuf decoder.
- Environment configuration.
- Instrument synchronisation script.
- Subscription handling.
- Socket.IO events.
- Frontend quote cache.
- Existing market status endpoint.

Identify why the application currently runs in DEMO mode.

**Deliverable:** A concise implementation audit listing existing working components, defects and required changes.

## Stage 1 – NIFTY 50 Universe

1. Obtain a reliable NIFTY 50 constituent dataset.
2. Extend the stock database.
3. Map all 50 instruments.
4. Assign sectors.
5. Refresh market-cap references.
6. Update demo seed data.
7. Validate the complete universe.

**Deliverable:** 50 correctly mapped stocks in both DEMO and LIVE configurations.

## Stage 2 – Live Feed Verification

1. Configure Upstox credentials.
2. Establish V3 connection.
3. Verify authorisation.
4. Subscribe to all 50 stocks.
5. Verify Protobuf decoding.
6. Confirm valid price updates.
7. Verify reconnection and resubscription.
8. Add useful diagnostics.

**Deliverable:** Backend receiving and processing genuine market data.

## Stage 3 – Real-Time Dashboard

1. Verify existing Socket.IO update flow.
2. Connect the frontend to the live snapshot.
3. Confirm incremental quote updates.
4. Add five-second snapshot reconciliation.
5. Update heatmap tiles.
6. Update overview and rankings.
7. Add price movement animations.
8. Add freshness and connection indicators.

**Deliverable:** A dashboard that visibly responds to actual incoming market data without reloading.

## Stage 4 – Analytics and Reliability

1. Update all analytics to include 50 stocks.
2. Validate historical data requirements.
3. Verify sector intelligence.
4. Improve error handling.
5. Test provider disconnection.
6. Test recovery and stale-data behaviour.
7. Run performance checks.

**Deliverable:** Reliable full-universe market analytics.

## Stage 5 – Final Verification and Documentation

1. Run backend tests.
2. Run frontend tests.
3. Verify DEMO mode.
4. Verify LIVE mode.
5. Verify Docker deployment.
6. Update README.
7. Document environment variables.
8. Prepare screenshots and a short demonstration.

**Deliverable:** A reproducible, documented MarketPulse Phase 2 release.

---

# 15. Acceptance Criteria

Phase 2 is considered complete only when the following requirements are satisfied.

| ID | Acceptance criterion | Priority |
|---|---|---|
| AC-01 | All 50 NIFTY 50 constituents are present | P0 |
| AC-02 | All 50 have valid provider instrument mappings | P0 |
| AC-03 | LIVE mode successfully connects to Upstox V3 | P0 |
| AC-04 | Backend receives and validates real market updates | P0 |
| AC-05 | All eligible instruments are subscribed | P0 |
| AC-06 | The dashboard displays real LIVE data | P0 |
| AC-07 | Incoming updates change the relevant heatmap tiles | P0 |
| AC-08 | No manual browser refresh is needed | P0 |
| AC-09 | Five-second snapshot reconciliation works | P0 |
| AC-10 | LIVE, DEMO and connection states are accurate | P0 |
| AC-11 | Stale and unavailable prices are identified correctly | P0 |
| AC-12 | Market overview and rankings cover all 50 stocks | P0 |
| AC-13 | Sector analytics cover the expanded universe | P1 |
| AC-14 | Reconnection restores instrument subscriptions | P0 |
| AC-15 | Existing DEMO functionality continues working | P0 |
| AC-16 | Historical analytics handle insufficient data correctly | P1 |
| AC-17 | Docker deployment works with the updated configuration | P0 |
| AC-18 | README documents the complete LIVE setup | P0 |

### Final demonstration criteria

A successful demonstration should show:

1. MarketPulse running in LIVE mode.
2. All 50 NIFTY 50 stocks listed.
3. A connected Upstox feed.
4. Successful subscription information.
5. Real market prices displayed.
6. A stock price changing when a new update arrives.
7. The corresponding heatmap tile changing automatically.
8. The latest update timestamp advancing.
9. No page reload.
10. Correct behaviour when the provider disconnects.

If the market is closed during the demonstration, show the last available real market data and explain that no new trades are occurring. Do not manufacture movement to simulate a live market.

---

# 16. Out of Scope

The following are deliberately excluded from Phase 2:

- Trading functionality.
- Brokerage integration.
- Buy/sell recommendations.
- Portfolio management.
- AI-based stock predictions.
- Kafka or Redis introduction.
- Microservice migration.
- Kubernetes deployment.
- Mobile application.
- User authentication redesign.
- Advanced fundamental analysis.

These features are not necessary to achieve the objectives of this phase.

---

# 17. Important Technical Decisions

1. **Reuse the existing Upstox V3 integration.** Repair it rather than creating a second provider adapter.
2. **Use WebSocket streaming for live movement.** Five-second snapshots are for reconciliation, not the primary data source.
3. **Use one shared frontend Socket.IO connection.** Do not create per-stock connections.
4. **Use the backend cache for snapshots.** Do not poll the external provider separately for every stock.
5. **Maintain data provenance.** LIVE and DEMO observations must never be confused.
6. **Do not fabricate updates.** A stock with no new trade retains its last valid price.
7. **Keep historical data honest.** Missing history must result in unavailable metrics, not invented comparisons.
8. **Preserve the existing UI.** Focus engineering effort on correctness, reliability and data coverage.
9. **Keep credentials secure.** The Upstox token must never reach the browser.
10. **Verify each stage before proceeding.** Do not assume a connected WebSocket means the entire application is live.

---

# 18. Expected Final Outcome

At the end of Phase 2, MarketPulse should become a genuine 50-stock market monitoring platform rather than a 15-stock demonstration.

The finished application should provide:

- Full NIFTY 50 coverage.
- Genuine Upstox V3 market data in LIVE mode.
- Automatic price updates.
- An interactive real-time heatmap.
- Updated rankings and sector analytics.
- Reliable five-second snapshot reconciliation.
- Accurate connection and data-freshness indicators.
- Working DEMO mode as a fallback.
- Clear diagnostics and reproducible deployment.

**The defining success condition is simple:**

When a valid market-data update arrives for a subscribed stock, its price, percentage change and heatmap tile must update on the website automatically, without refreshing the browser.

MarketPulse should clearly distinguish between actual live data, simulated data, stale data and unavailable data at every stage.