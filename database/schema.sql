-- MarketPulse database schema
-- PostgreSQL 14+
--
-- The backend executes this file on startup (idempotent) so that `docker compose up`
-- and a plain `npm start` both produce a schema-correct database.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sectors (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS stocks (
    id             SERIAL PRIMARY KEY,
    symbol         VARCHAR(32) NOT NULL UNIQUE,
    company_name   VARCHAR(160) NOT NULL,
    instrument_key VARCHAR(80) NOT NULL UNIQUE,
    exchange       VARCHAR(16) NOT NULL DEFAULT 'NSE',
    sector_id      INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
    market_cap     NUMERIC(20, 2),
    -- The date the reference market cap was published. Never present the value as
    -- current market capitalisation without this date.
    market_cap_as_of DATE,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- CREATE TABLE IF NOT EXISTS does not alter an existing table, so older installs
-- need the column added explicitly. Both statements are idempotent.
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS market_cap_as_of DATE;

CREATE INDEX IF NOT EXISTS idx_stocks_sector_id ON stocks (sector_id);
CREATE INDEX IF NOT EXISTS idx_stocks_active ON stocks (is_active);

-- Selected observations only. The collector samples ticks instead of persisting every
-- incoming update, and old rows are pruned by a retention job.
CREATE TABLE IF NOT EXISTS market_ticks (
    id             BIGSERIAL PRIMARY KEY,
    stock_id       INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    last_price     NUMERIC(14, 4) NOT NULL,
    previous_close NUMERIC(14, 4),
    last_quantity  BIGINT,
    traded_at      TIMESTAMPTZ NOT NULL,
    received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Provenance: 'demo' rows are simulated and must never be presented as live.
    source         VARCHAR(12) NOT NULL DEFAULT 'demo'
);

ALTER TABLE market_ticks ADD COLUMN IF NOT EXISTS source VARCHAR(12) NOT NULL DEFAULT 'demo';

CREATE INDEX IF NOT EXISTS idx_market_ticks_stock_traded_at ON market_ticks (stock_id, traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_ticks_received_at ON market_ticks (received_at DESC);

CREATE TABLE IF NOT EXISTS stock_candles (
    id           BIGSERIAL PRIMARY KEY,
    stock_id     INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    interval     VARCHAR(8) NOT NULL,
    candle_start TIMESTAMPTZ NOT NULL,
    open         NUMERIC(14, 4) NOT NULL,
    high         NUMERIC(14, 4) NOT NULL,
    low          NUMERIC(14, 4) NOT NULL,
    close        NUMERIC(14, 4) NOT NULL,
    volume       BIGINT NOT NULL DEFAULT 0,
    -- Provenance: DEMO history and LIVE observations are stored side by side but
    -- are never mixed in one comparison. Rows default to 'demo' because that is
    -- what pre-existing databases contain.
    source       VARCHAR(12) NOT NULL DEFAULT 'demo',
    CONSTRAINT stock_candles_unique UNIQUE (stock_id, interval, candle_start, source)
);

ALTER TABLE stock_candles ADD COLUMN IF NOT EXISTS source VARCHAR(12) NOT NULL DEFAULT 'demo';

-- Legacy databases have a unique key without `source`; replace it so a demo bar
-- and a live bar can share a bucket instead of overwriting each other.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'stock_candles'
      AND c.conname = 'stock_candles_unique'
      AND pg_get_constraintdef(c.oid) LIKE '%source%'
  ) THEN
    ALTER TABLE stock_candles DROP CONSTRAINT IF EXISTS stock_candles_unique;
    ALTER TABLE stock_candles
      ADD CONSTRAINT stock_candles_unique UNIQUE (stock_id, interval, candle_start, source);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_candles_lookup ON stock_candles (stock_id, interval, candle_start DESC);

CREATE TABLE IF NOT EXISTS market_events (
    id             BIGSERIAL PRIMARY KEY,
    stock_id       INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    event_type     VARCHAR(48) NOT NULL,
    severity       VARCHAR(16) NOT NULL,
    activity_score NUMERIC(6, 2),
    description    TEXT,
    detected_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_events_detected_at ON market_events (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_events_stock ON market_events (stock_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS watchlists (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT watchlists_user_name_unique UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS watchlist_stocks (
    id           SERIAL PRIMARY KEY,
    watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    stock_id     INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT watchlist_stocks_unique UNIQUE (watchlist_id, stock_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_watchlist ON watchlist_stocks (watchlist_id);

-- Reference data: yearly high / low used by the 52-week rankings and by the
-- instrument reference page. Derivable from stock_candles(interval='1d'), but
-- materialised so ranking queries stay cheap.
CREATE TABLE IF NOT EXISTS stock_reference (
    stock_id       INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
    source         VARCHAR(12) NOT NULL DEFAULT 'demo',
    high_52w       NUMERIC(14, 4),
    low_52w        NUMERIC(14, 4),
    avg_daily_vol  BIGINT,
    reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (stock_id, source)
);

ALTER TABLE stock_reference ADD COLUMN IF NOT EXISTS source VARCHAR(12) NOT NULL DEFAULT 'demo';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'stock_reference'
      AND c.conname = 'stock_reference_pkey'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%source%'
  ) THEN
    ALTER TABLE stock_reference DROP CONSTRAINT stock_reference_pkey;
    ALTER TABLE stock_reference ADD PRIMARY KEY (stock_id, source);
  END IF;
END $$;

COMMIT;
