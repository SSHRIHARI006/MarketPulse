# MARKETPULSE
## Real-Time Stock Market Intelligence & Analytics Platform

**Course:** Tools and Practices for Data Science – III (CSP 301)  
**Project Type:** Full-Stack Data Analytics Web Application  
**Primary Market:** Indian Equity Market (NSE)  
**Primary Data Provider:** Upstox Market Data API V3

---

# 1. PROJECT VISION

## 1.1 Overview

MarketPulse is a real-time stock market intelligence platform that collects financial market data, processes incoming price updates, performs statistical analysis, and presents actionable market insights through an interactive web dashboard.

Unlike conventional stock market applications that primarily display stock prices and charts, MarketPulse focuses on identifying interesting market behaviour.

The platform will help users understand:

- Which stocks are performing exceptionally well or poorly?
- Which stocks are experiencing unusual trading activity?
- Which stocks demonstrate strong price momentum?
- Which sectors are outperforming the market?
- Which stocks are experiencing unusually high volatility?
- How is the market behaving in real time?

The primary interface will feature a continuously updating stock market heatmap that visually represents the performance of tracked stocks.

## 1.2 Core Concept

MarketPulse will consist of five primary analytical components:

1. Live Market Heatmap.
2. Market Leaders and Laggards.
3. Stock Intelligence and Rankings.
4. Unusual Market Activity Detection.
5. Sector Performance and Market Insights.

The application will also provide detailed analytics pages for individual stocks.

## 1.3 Project Objectives

1. Collect real-time stock market data using external APIs.
2. Process and normalize incoming market updates.
3. Store historical market information in PostgreSQL.
4. Develop interactive visualizations and analytical dashboards.
5. Identify unusual market behaviour through statistical techniques.
6. Build a responsive frontend with real-time updates.
7. Deploy the complete application using Docker.

---

# 2. TECHNOLOGY STACK

| Layer | Technology |
|---|---|
| Frontend | React.js |
| Language | JavaScript |
| Styling | Tailwind CSS |
| Backend | Node.js |
| Framework | Express.js |
| Database | PostgreSQL |
| Real-time communication | Socket.IO |
| External market data | Upstox API V3 |
| Heatmap visualization | D3.js / React-compatible treemap library |
| Charts | Recharts / Lightweight Charts |
| Data processing | JavaScript |
| API testing | Postman |
| Version control | Git + GitHub |
| Containerization | Docker + Docker Compose |

## 2.1 Architectural Principles

- Monolithic backend architecture.
- REST APIs for application data retrieval.
- WebSockets for live market updates.
- PostgreSQL as the persistent storage layer.
- Event-driven frontend updates.
- Separation of data acquisition, processing, analytics and presentation.

Redis, Kafka and Kubernetes are explicitly excluded from the initial implementation.

---

# 3. DATA ACQUISITION

## 3.1 External Data Provider

Primary provider: Upstox Market Data Feed V3.

Documentation:

https://upstox.com/developer/api-documentation/v3/get-market-data-feed/

The application will establish an authenticated WebSocket connection with the provider.

The backend will subscribe to selected NSE equity instruments and receive market updates.

The feed uses Protocol Buffers (Protobuf) encoding.

The backend must decode incoming binary messages before processing them.

## 3.2 Initial Stock Universe

The initial application will track approximately 15 stocks.

Suggested stock universe:

| Company | Sector |
|---|---|
| Reliance Industries | Energy |
| TCS | Information Technology |
| Infosys | Information Technology |
| HDFC Bank | Banking |
| ICICI Bank | Banking |
| State Bank of India | Banking |
| ITC | FMCG |
| Hindustan Unilever | FMCG |
| Tata Motors | Automobile |
| Mahindra & Mahindra | Automobile |
| Bharti Airtel | Telecommunications |
| Larsen & Toubro | Infrastructure |
| Wipro | Information Technology |
| Axis Bank | Banking |
| Maruti Suzuki | Automobile |

The actual instrument identifiers must be obtained from the provider's instrument master.

Stock symbols and company names must not be used as substitutes for provider instrument keys.

## 3.3 Required Data Fields

The application should collect the following fields wherever available through the selected feed mode:

| Field | Description |
|---|---|
| Instrument Key | Unique provider instrument identifier |
| LTP | Last traded price |
| Previous Close | Previous session closing price |
| Last Traded Time | Time of the latest trade |
| Last Traded Quantity | Quantity in latest trade |
| Total Traded Volume | Accumulated trading volume |
| Open | Opening price |
| High | Highest price |
| Low | Lowest price |
| Average Traded Price | Average traded price |

The backend should retain the provider timestamp and its own receipt timestamp.

This allows the application to distinguish exchange data time from application processing time.

## 3.4 Data Collection Modes

Two modes must be supported.

### LIVE MODE

- Authenticated external API connection.
- Actual market data.
- Real-time price updates.
- Live heatmap.
- Live analytics.

### DEMO MODE

- Previously collected market data or seeded sample data.
- Simulated updates for demonstration.
- No representation of simulated data as actual market activity.

The interface must clearly identify which mode is active.

---

# 4. LIVE MARKET HEATMAP

## 4.1 Purpose

The heatmap is the primary feature of MarketPulse.

It provides a visual representation of stock market performance using a treemap visualization.

Each rectangle represents an individual stock.

The rectangle's:

- Colour represents percentage price movement.
- Area represents market capitalization.
- Text displays company symbol and percentage movement.

This allows users to understand both market performance and the relative size of companies.

## 4.2 Heatmap Design

The visualization must contain:

- Stock symbol.
- Company name.
- Latest traded price.
- Percentage change.
- Market capitalization represented by tile size.

Colour scheme:

| Percentage Change | Colour Classification |
|---|---|
| Greater than +3% | Strong positive |
| +1% to +3% | Positive |
| 0% to +1% | Slight positive |
| Approximately 0% | Neutral |
| -1% to 0% | Slight negative |
| -3% to -1% | Negative |
| Below -3% | Strong negative |

The colour scale must use a continuous gradient rather than abrupt colour transitions.

A suitable neutral band should be configurable to avoid excessive flickering around zero.

## 4.3 Heatmap Layout

The main dashboard should feature a large heatmap occupying a significant portion of the available screen.

Stocks should be grouped by sector.

Example:

- Banking
- IT
- Automobile
- Energy
- FMCG
- Telecommunications

The treemap should allow users to identify sector-level patterns visually.

## 4.4 Real-Time Updating

The heatmap must update without refreshing the webpage.

Workflow:

1. Receive an external market update.
2. Decode the incoming message.
3. Identify the corresponding stock.
4. Validate the received price.
5. Update the in-memory latest-price cache.
6. Calculate percentage movement.
7. Broadcast the updated stock information through Socket.IO.
8. Update the corresponding frontend tile.
9. Recalculate rankings and analytical indicators when necessary.

Only the affected tile should be updated when its underlying data changes.

The entire treemap should not be unnecessarily reconstructed for every incoming tick.

## 4.5 Heatmap Filters

The heatmap must support:

### Time Range

- Current session.
- Last 5 minutes.
- Last 15 minutes.
- Last 1 hour.
- Daily performance.

Daily performance is calculated relative to the previous closing price.

Shorter intervals are calculated relative to the first available price observation at or after the selected interval's starting time.

If sufficient historical observations are unavailable, the interface must indicate that the selected comparison is unavailable.

### Sector Filter

Allow users to select:

- All sectors.
- Banking.
- IT.
- Automobile.
- Energy.
- FMCG.
- Telecommunications.

### Tile Size

Allow the user to change the tile sizing metric:

- Market capitalization.
- Trading volume.
- Equal-sized tiles.

Market capitalization should come from a separately maintained reference dataset, not be inferred from live price alone.

## 4.6 Interactive Tiles

When a user clicks a tile, display a stock information panel.

The panel should contain:

- Company name.
- Current price.
- Daily percentage change.
- Trading volume.
- Day high.
- Day low.
- Sector.
- Last updated timestamp.

Provide a button:

VIEW STOCK ANALYTICS

This should navigate to the detailed stock analytics page.

## 4.7 Heatmap Behaviour

- Smooth colour transitions.
- Clearly distinguish positive and negative movement.
- Highlight recently updated stocks subtly.
- Display loading state while initial data is fetched.
- Display stale-data indicators when updates stop.
- Preserve the last valid values during temporary disconnections.
- Show market closure status.
- Never interpret missing updates as zero price movement.

---

# 5. MAIN DASHBOARD

The homepage should be designed around analytical insights.

## 5.1 Market Overview

The top section displays important market indicators.

Cards:

1. NIFTY 50.
2. SENSEX.
3. Advancing Stocks.
4. Declining Stocks.
5. Average Percentage Change.
6. Market Volatility.

Each card should display the latest available value and its change.

Important: Market breadth and market-wide averages must be labelled as metrics of the tracked stock universe unless the application obtains a broader market dataset.

## 5.2 Market Leaders and Laggards

Four analytical cards:

### A. Top Performer

The stock with the highest positive daily percentage change.

Display:
- Company name.
- Current price.
- Daily percentage change.
- Volume.

### B. Biggest Decliner

The stock with the lowest daily percentage change.

Display:
- Company name.
- Current price.
- Daily percentage change.
- Volume.

### C. Highest Relative Volume

The stock with the highest trading volume relative to its historical average.

Formula:

Relative Volume = Current Session Volume / Average Historical Session Volume

Use comparable completed or elapsed trading-session periods.

### D. Most Volatile Stock

The stock with the highest intraday volatility.

Use standard deviation of periodic returns.

All four cards must be calculated from actual stored or incoming data.

---

# 6. STOCK INTELLIGENCE ENGINE

This module will rank stocks based on analytical indicators.

The initial implementation will include six rankings.

## 6.1 Momentum Ranking

Identify stocks exhibiting strong positive price momentum.

Use:

- Five-session return.
- Twenty-session return.

Calculate a momentum score using normalized returns.

The ranking should clearly distinguish short-term and medium-term momentum.

## 6.2 Relative Volume Ranking

Identify stocks experiencing unusual trading activity.

Formula:

Relative Volume = Current Volume / Historical Average Volume

A higher value indicates greater-than-normal trading activity.

## 6.3 Volatility Ranking

Calculate the standard deviation of periodic returns over a selected historical period.

Display:

- Highest volatility.
- Lowest volatility.
- Stock-wise volatility comparison.

## 6.4 Risk-Adjusted Performance

Calculate a simplified risk-adjusted return score.

Formula:

Risk-Adjusted Score = Average Periodic Return / Standard Deviation of Periodic Returns

Use a consistent return frequency and historical window.

This is a simplified analytical indicator and must not be presented as a formal investment recommendation or a complete Sharpe ratio.

## 6.5 Near 52-Week High

Calculate:

Distance from 52-Week High (%) =
((Current Price - 52-Week High) / 52-Week High) × 100

Rank stocks approaching their yearly highs.

## 6.6 Near 52-Week Low

Calculate:

Distance from 52-Week Low (%) =
((Current Price - 52-Week Low) / 52-Week Low) × 100

Rank stocks approaching their yearly lows.

Yearly high and low data must come from an appropriate historical data source.

---

# 7. UNUSUAL MARKET ACTIVITY DETECTION

This module identifies unusual price and volume behaviour.

It will initially contain four detectors.

## 7.1 Volume Spike Detection

Detect stocks with significantly higher-than-normal trading activity.

Initial rule:

Relative Volume >= 2

Generate an event when the stock's current trading volume is at least twice its comparable historical average.

## 7.2 Sudden Price Movement

Detect unusually large price changes within short periods.

Initial configurable thresholds:

- Price movement >= 2% within 15 minutes.
- Price movement <= -2% within 15 minutes.

These thresholds should be configurable.

## 7.3 Volatility Spike

Compare recent short-term volatility with the stock's historical volatility.

Generate an event when recent volatility exceeds a configurable multiple of historical volatility.

## 7.4 Combined Activity Score

Generate an activity score using:

- Relative volume.
- Absolute short-term price movement.
- Recent volatility relative to historical volatility.

The score should be normalized to a 0–100 scale.

Display activity categories:

| Score | Classification |
|---|---|
| 0–29 | Normal |
| 30–59 | Moderate |
| 60–79 | High |
| 80–100 | Very High |

The score is an internally defined indicator, not an established financial metric.

## 7.5 Activity Feed

Display detected events in a chronological feed.

Example:

| Stock | Event | Severity |
|---|---|---|
| Reliance | Volume spike | High |
| Infosys | Sudden price decline | High |
| TCS | Volatility increase | Moderate |

Each event should contain:

- Stock identifier.
- Event type.
- Detection time.
- Relevant measured values.
- Severity.

Duplicate events should be suppressed within a configurable cooldown period.

---

# 8. SECTOR INTELLIGENCE

The platform will group stocks into predefined sectors.

## 8.1 Sector Performance

Calculate average daily percentage change for each sector.

Display:

- Best-performing sector.
- Worst-performing sector.
- Sector-wise average returns.
- Number of advancing stocks.
- Number of declining stocks.

## 8.2 Sector Comparison

Provide an interactive bar chart.

Allow users to compare sector performance across selected periods.

## 8.3 Sector Drilldown

Clicking a sector should:

1. Filter the heatmap.
2. Display stocks within the selected sector.
3. Show sector-wise rankings.
4. Display average returns and volatility.

---

# 9. MARKET INSIGHTS GENERATOR

Generate rule-based observations using the application's analytical data.

Examples:

- Automobile is the strongest-performing tracked sector.
- Three stocks are experiencing trading volumes above twice their historical averages.
- IT stocks have negative average returns.
- Market breadth is strongly positive.
- Two stocks have experienced significant intraday volatility.

Insights should be generated from predefined analytical rules.

No external LLM or paid AI API is required.

Each insight must be supported by actual calculated data.

---

# 10. INDIVIDUAL STOCK ANALYTICS

Each stock should have a dedicated detail page.

## 10.1 Stock Overview

Display:

- Company name.
- Symbol.
- Sector.
- Latest price.
- Previous close.
- Daily percentage change.
- Open.
- High.
- Low.
- Volume.

## 10.2 Price Chart

Provide interactive historical price visualization.

Supported intervals:

- 1 minute.
- 5 minutes.
- 15 minutes.
- 1 day.

Available intervals depend on the historical data collected or obtained from the provider.

## 10.3 Technical Indicators

Implement:

### SMA 20

Average closing price over the previous 20 periods.

### SMA 50

Average closing price over the previous 50 periods.

### EMA 20

Exponentially weighted moving average over 20 periods.

### RSI 14

Relative Strength Index calculated using a 14-period window.

Display indicator values and corresponding chart overlays.

## 10.4 Volume Chart

Display trading volume over time.

Identify:

- Highest-volume interval.
- Average interval volume.
- Recent volume spikes.

---

# 11. STOCK COMPARISON

Users can select two or three stocks.

The comparison page should display:

1. Normalized price movement.
2. Historical returns.
3. Volatility.
4. Relative trading volume.
5. Momentum scores.

Normalize prices to a common starting value of 100.

Formula:

Normalized Price = (Current Price / Starting Price) × 100

This allows users to compare stocks with different nominal share prices.

---

# 12. DATABASE DESIGN

Database: PostgreSQL.

The database should contain the following tables.

## 12.1 users

| Column | Type |
|---|---|
| id | SERIAL PRIMARY KEY |
| name | VARCHAR |
| email | VARCHAR UNIQUE |
| password_hash | VARCHAR |
| created_at | TIMESTAMPTZ |

Authentication is optional in the first demonstration milestone.

## 12.2 sectors

| Column | Type |
|---|---|
| id | SERIAL PRIMARY KEY |
| name | VARCHAR UNIQUE |

## 12.3 stocks

| Column | Type |
|---|---|
| id | SERIAL PRIMARY KEY |
| symbol | VARCHAR UNIQUE |
| company_name | VARCHAR |
| instrument_key | VARCHAR UNIQUE |
| exchange | VARCHAR |
| sector_id | INTEGER REFERENCES sectors(id) |
| market_cap | NUMERIC |
| is_active | BOOLEAN |

Market capitalization must be maintained as reference data with a documented source and as-of date.

## 12.4 market_ticks

| Column | Type |
|---|---|
| id | BIGSERIAL PRIMARY KEY |
| stock_id | INTEGER REFERENCES stocks(id) |
| last_price | NUMERIC(14,4) |
| previous_close | NUMERIC(14,4) |
| last_quantity | BIGINT |
| traded_at | TIMESTAMPTZ |
| received_at | TIMESTAMPTZ |

Selected market observations should be retained for historical calculations.

Do not persist every tick indefinitely.

## 12.5 stock_candles

| Column | Type |
|---|---|
| id | BIGSERIAL PRIMARY KEY |
| stock_id | INTEGER REFERENCES stocks(id) |
| interval | VARCHAR |
| candle_start | TIMESTAMPTZ |
| open | NUMERIC(14,4) |
| high | NUMERIC(14,4) |
| low | NUMERIC(14,4) |
| close | NUMERIC(14,4) |
| volume | BIGINT |

Unique constraint:

(stock_id, interval, candle_start)

## 12.6 market_events

| Column | Type |
|---|---|
| id | BIGSERIAL PRIMARY KEY |
| stock_id | INTEGER REFERENCES stocks(id) |
| event_type | VARCHAR |
| severity | VARCHAR |
| activity_score | NUMERIC |
| description | TEXT |
| detected_at | TIMESTAMPTZ |

## 12.7 watchlists

| Column | Type |
|---|---|
| id | SERIAL PRIMARY KEY |
| user_id | INTEGER REFERENCES users(id) |
| name | VARCHAR |
| created_at | TIMESTAMPTZ |

## 12.8 watchlist_stocks

| Column | Type |
|---|---|
| id | SERIAL PRIMARY KEY |
| watchlist_id | INTEGER REFERENCES watchlists(id) |
| stock_id | INTEGER REFERENCES stocks(id) |
| added_at | TIMESTAMPTZ |

Unique constraint:

(watchlist_id, stock_id)

## 12.9 Database Requirements

- Proper foreign keys.
- Appropriate indexes.
- Unique constraints.
- Data validation.
- Transactions where required.
- Cascading behaviour where appropriate.
- Efficient historical queries.

Important indexes:

- market_ticks(stock_id, traded_at)
- stock_candles(stock_id, interval, candle_start)
- market_events(detected_at)
- stocks(sector_id)

---

# 13. BACKEND ARCHITECTURE

The backend will use Express.js.

## 13.1 Directory Structure

backend/

    src/

        config/
            database.js

        controllers/
            stock.controller.js
            analytics.controller.js
            market.controller.js
            watchlist.controller.js

        routes/
            stock.routes.js
            analytics.routes.js
            market.routes.js
            watchlist.routes.js

        services/
            marketData.service.js
            heatmap.service.js
            analytics.service.js
            candle.service.js
            eventDetection.service.js

        websocket/
            marketSocket.js

        jobs/
            marketCollector.js
            candleAggregator.js

        middleware/
            error.middleware.js

        utils/
            indicators.js
            validators.js

        app.js
        server.js

## 13.2 REST API Endpoints

### Market

GET /api/market/overview

GET /api/market/heatmap

GET /api/market/status

GET /api/market/movers

### Stocks

GET /api/stocks

GET /api/stocks/:id

GET /api/stocks/:id/history

GET /api/stocks/:id/analytics

### Analytics

GET /api/analytics/momentum

GET /api/analytics/volatility

GET /api/analytics/volume-spikes

GET /api/analytics/sectors

GET /api/analytics/activity

GET /api/analytics/compare

### Events

GET /api/events

GET /api/events/recent

### Watchlists

GET /api/watchlists

POST /api/watchlists

POST /api/watchlists/:id/stocks

DELETE /api/watchlists/:id/stocks/:stockId

## 13.3 Socket.IO Events

Server-to-client:

- market:snapshot
- market:update
- heatmap:update
- market:status
- market:event
- market:connection

Client-to-server:

- heatmap:subscribe
- heatmap:unsubscribe

The client should receive an initial snapshot before processing subsequent incremental updates.

---

# 14. FRONTEND ARCHITECTURE

## 14.1 Main Pages

### Page 1: Dashboard

Contains:

1. Market overview.
2. Live market heatmap.
3. Market leaders and laggards.
4. Stock intelligence rankings.
5. Unusual activity feed.
6. Sector performance.
7. Market insights.

This is the primary demonstration page.

### Page 2: Stock Details

Contains:

- Stock overview.
- Price chart.
- Technical indicators.
- Volume chart.
- Historical performance.

### Page 3: Stock Comparison

Contains:

- Stock selection.
- Normalized price comparison.
- Return comparison.
- Volatility comparison.

### Page 4: Watchlist (Optional)

Contains:

- Selected stocks.
- Current prices.
- Percentage changes.

## 14.2 Design Requirements

- Professional dark theme.
- Clean financial dashboard layout.
- Responsive interface.
- Consistent typography.
- Reusable components.
- Minimal animations.
- Loading states.
- Error handling.
- Clear live/demo indicators.

---

# 15. REAL-TIME DATA FLOW

The following sequence defines the complete data lifecycle.

1. Backend starts.
2. PostgreSQL connection is established.
3. Stock universe is loaded.
4. Upstox authorization is requested.
5. WebSocket connection is established.
6. Stock instruments are subscribed.
7. Initial market snapshot is received.
8. Protobuf messages are decoded.
9. Market data is validated.
10. Latest-price cache is updated.
11. Percentage changes are calculated.
12. Selected observations are persisted.
13. OHLCV candles are updated.
14. Analytics are recalculated.
15. Socket.IO broadcasts relevant changes.
16. Frontend updates the dashboard.
17. Heatmap tiles change their colours and displayed values.

## 15.1 Data Reliability

The application must handle:

- API authentication failure.
- WebSocket disconnection.
- Automatic reconnection.
- Missing updates.
- Invalid market data.
- Market closure.
- Duplicate messages.
- Database failures.

The application must not display old data as current live data.

Each stock should maintain a last-updated timestamp.

---

# 16. DEPLOYMENT

Use Docker Compose.

Initial services:

1. React frontend.
2. Express backend.
3. PostgreSQL database.

Project structure:

marketpulse/

    frontend/

    backend/

    database/
        schema.sql
        seed.sql

    docker-compose.yml

    .env.example

    README.md

Required environment variables:

DATABASE_URL=
PORT=
UPSTOX_ACCESS_TOKEN=
MARKET_DATA_MODE=

Sensitive credentials must never be committed to GitHub.

The application should start using:

docker compose up --build

The backend must wait for database readiness before starting database-dependent processes.

---

# 17. TESTING REQUIREMENTS

## 17.1 Data Acquisition

- Valid market update.
- Invalid price.
- Unknown instrument.
- Missing fields.
- Disconnected feed.
- Successful reconnection.

## 17.2 Heatmap

- Positive percentage change.
- Negative percentage change.
- Zero movement.
- Extreme price movement.
- Missing price data.
- Sector filtering.
- Time-range filtering.
- Tile size changes.
- Live update propagation.

## 17.3 Analytics

- Percentage change.
- Relative volume.
- SMA.
- EMA.
- RSI.
- Volatility.
- Momentum.
- Sector aggregation.

## 17.4 Database

- Foreign key validation.
- Duplicate stock prevention.
- Duplicate candle prevention.
- Historical data retrieval.
- Invalid stock references.

## 17.5 Frontend

- Initial loading.
- API failure.
- WebSocket disconnection.
- Reconnection.
- Empty data.
- Responsive layout.

## 17.6 Performance

Measure:

- API response time.
- Time from market update receipt to frontend display.
- Initial dashboard loading time.
- Database query performance.

Record actual measurements in the final report.

---

# 18. TPDS SYLLABUS MAPPING

| Module | Syllabus Topic | MarketPulse Implementation |
|---|---|---|
| Module 1 | Data acquisition | External stock market API |
| Module 1 | Data processing | Market update processing |
| Module 1 | Dashboard design | Market intelligence dashboard |
| Module 1 | Charts | Stock charts, sector charts, volatility charts |
| Module 1 | Data mapping | Live stock market heatmap |
| Module 1 | Deployment of dashboards | Deployed React dashboard |
| Module 2 | Responsive UI | React and Tailwind |
| Module 2 | UI controls | Filters, selectors, interactive tiles |
| Module 2 | Web application development | Dashboard and analytics pages |
| Module 3 | Web servers | Node.js and Express |
| Module 3 | HTTP requests | REST APIs |
| Module 3 | SQL databases | PostgreSQL |
| Module 3 | SQL queries | Joins, aggregations, grouping and filtering |
| Module 3 | Backend development | Express services and controllers |
| Module 4 | Git | GitHub |
| Module 4 | Deployment | Cloud/VPS deployment |
| Module 4 | Dockerization | Docker Compose |

---

# 19. DEVELOPMENT PRIORITIES

## P0 – Essential MVP

These features are mandatory.

1. Project setup.
2. PostgreSQL integration.
3. External market data connection.
4. Data decoding and processing.
5. Live stock price cache.
6. Market overview.
7. Live market heatmap.
8. Interactive heatmap tiles.
9. Top performer and biggest decliner.
10. Sector performance.
11. Docker deployment.

## P1 – Core Analytics

1. Historical price storage.
2. OHLCV candle aggregation.
3. Stock detail page.
4. SMA and EMA.
5. RSI.
6. Relative volume.
7. Volatility ranking.
8. Unusual activity detection.
9. Market insights.
10. Stock comparison.

## P2 – Optional Improvements

1. Authentication.
2. Watchlists.
3. Advanced activity scoring.
4. Additional stocks.
5. Advanced historical analytics.
6. More detailed financial metrics.

The project is considered demonstrable once all P0 requirements are completed.

---

# 20. DEVELOPMENT TIMELINE

Target: 7–10 working days.

| Phase | Tasks |
|---|---|
| Day 1 | Project setup, database schema, API access |
| Day 2 | Market data integration |
| Day 3 | Data processing, database persistence |
| Day 4 | Dashboard and live heatmap |
| Day 5 | Heatmap interactions and market leaders |
| Day 6 | Sector analytics and stock intelligence |
| Day 7 | Historical charts and technical indicators |
| Day 8 | Testing and bug fixes |
| Day 9 | Docker and deployment |
| Day 10 | Documentation and presentation |

This is an aggressive target. API access and feed decoding are the primary schedule risks.

---

# 21. ACCEPTANCE CRITERIA

The project will be considered successfully implemented when:

1. The backend can connect to the external market data provider.
2. At least 10 tracked stocks can be subscribed to.
3. Market updates can be decoded and processed.
4. The latest market data is available through backend APIs.
5. The PostgreSQL database stores selected market observations.
6. The dashboard displays the tracked stock universe.
7. The heatmap displays stocks with size and colour based on defined metrics.
8. Heatmap tiles update without a webpage refresh.
9. Users can filter the heatmap by sector and time range.
10. Users can open detailed stock information.
11. Market rankings are calculated from actual data.
12. Sector performance is visualized.
13. The application handles disconnections and stale data.
14. The complete application can be started through Docker Compose.
15. The application can be demonstrated using LIVE or clearly labelled DEMO MODE.

---

# 22. PROJECT LIMITATIONS

The initial project has the following limitations:

- The tracked stock universe is limited.
- Live data depends on external provider availability.
- Historical analytics depend on collected or accessible historical data.
- Some fundamental metrics require separate data sources.
- The platform does not execute trades.
- The platform does not provide investment recommendations.
- The analytical rankings are limited to the tracked stock universe.

MarketPulse is an educational data analytics application.

---

# 23. FUTURE SCOPE

Potential future enhancements:

- Expanded NSE stock coverage.
- BSE market support.
- Fundamental company analysis.
- Financial news integration.
- Stock correlation matrix.
- Portfolio simulation.
- Advanced market activity detection.
- Additional analytical indicators.
- Historical market replay.

These features are outside the initial implementation scope.

---

# FINAL PRODUCT DEFINITION

MarketPulse is a full-stack, real-time stock market intelligence platform that combines external financial data acquisition, event-driven backend processing, relational database management, statistical analytics and interactive data visualization.

Its primary differentiating feature is a live stock market heatmap that allows users to visually explore market performance, identify unusual activity and navigate directly into detailed stock analytics.

The project demonstrates the complete data science application lifecycle, from external data acquisition to processing, storage, analysis, visualization and deployment.