-- MarketPulse reference seed data.
--
-- This file is applied on startup by the backend (idempotent) and holds the
-- complete tracked universe: the 50 NIFTY 50 constituents.
--
-- Source: NSE Indices NIFTY 50 constituent list, matched by ISIN against the
-- Upstox NSE instrument master. Reference date: 2026-11-03.
-- The machine-readable copy lives in backend/src/data/nifty50.js; the universe
-- test fails if these two drift.
--
-- market_cap is REFERENCE data used only to weight heatmap tile area. Values are
-- approximate, in INR (1,700,000 crore -> 17,000,000,000,000), and are stamped
-- with market_cap_as_of. They are NOT current market capitalisation. Refresh them
-- from a documented source and update MARKET_CAP_REFERENCE_DATE (currently
-- 2026-03-31).
--
-- Existing rows are updated in place (ON CONFLICT (symbol)), so re-running is safe.
-- Symbols that are no longer constituents are deactivated, never deleted.

BEGIN;

INSERT INTO sectors (name) VALUES
    ('Automobile'),
    ('Capital Goods'),
    ('Cement'),
    ('Consumer Durables'),
    ('Consumer Services'),
    ('Energy'),
    ('FMCG'),
    ('Financial Services'),
    ('Healthcare'),
    ('Information Technology'),
    ('Infrastructure'),
    ('Metals'),
    ('Power'),
    ('Services'),
    ('Telecommunications')
ON CONFLICT (name) DO NOTHING;

-- Retire stocks that have left the index *before* inserting the current list.
-- A demerged/renamed company can keep the old ISIN (e.g. TATAMOTORS -> TMPV), so a
-- retired row would otherwise hold an instrument_key the new constituent needs.
-- Deactivated rows keep their history but release the provider key.
UPDATE stocks
SET is_active = FALSE
WHERE is_active = TRUE
  AND symbol NOT IN ('ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJAJFINSV', 'BAJFINANCE', 'BEL', 'BHARTIARTL', 'BSE', 'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL', 'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INFY', 'ITC', 'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'MAXHEALTH', 'NESTLEIND', 'NTPC', 'ONGC', 'POWERGRID', 'RELIANCE', 'SBILIFE', 'SBIN', 'SHRIRAMFIN', 'SUNPHARMA', 'TATACONSUM', 'TATASTEEL', 'TCS', 'TECHM', 'TITAN', 'TMPV', 'TRENT', 'ULTRACEMCO');

UPDATE stocks
SET instrument_key = 'INACTIVE|' || instrument_key
WHERE is_active = FALSE
  AND instrument_key NOT LIKE 'INACTIVE|%'
  AND symbol NOT IN ('ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJAJFINSV', 'BAJFINANCE', 'BEL', 'BHARTIARTL', 'BSE', 'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL', 'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INFY', 'ITC', 'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'MAXHEALTH', 'NESTLEIND', 'NTPC', 'ONGC', 'POWERGRID', 'RELIANCE', 'SBILIFE', 'SBIN', 'SHRIRAMFIN', 'SUNPHARMA', 'TATACONSUM', 'TATASTEEL', 'TCS', 'TECHM', 'TITAN', 'TMPV', 'TRENT', 'ULTRACEMCO');

INSERT INTO stocks (symbol, company_name, instrument_key, exchange, sector_id, market_cap, market_cap_as_of, is_active)
VALUES
    ('ADANIENT'   , 'Adani Enterprises Ltd.'                        , 'NSE_EQ|INE423A01024'    , 'NSE', (SELECT id FROM sectors WHERE name='Metals'), 3000000000000, DATE '2026-03-31', TRUE),
    ('ADANIPORTS' , 'Adani Ports and Special Economic Zone Ltd.'    , 'NSE_EQ|INE742F01042'    , 'NSE', (SELECT id FROM sectors WHERE name='Services'), 2800000000000, DATE '2026-03-31', TRUE),
    ('APOLLOHOSP' , 'Apollo Hospitals Enterprise Ltd.'              , 'NSE_EQ|INE437A01024'    , 'NSE', (SELECT id FROM sectors WHERE name='Healthcare'), 1100000000000, DATE '2026-03-31', TRUE),
    ('ASIANPAINT' , 'Asian Paints Ltd.'                             , 'NSE_EQ|INE021A01026'    , 'NSE', (SELECT id FROM sectors WHERE name='Consumer Durables'), 2600000000000, DATE '2026-03-31', TRUE),
    ('AXISBANK'   , 'Axis Bank Ltd.'                                , 'NSE_EQ|INE238A01034'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 3600000000000, DATE '2026-03-31', TRUE),
    ('BAJAJ-AUTO' , 'Bajaj Auto Ltd.'                               , 'NSE_EQ|INE917I01010'    , 'NSE', (SELECT id FROM sectors WHERE name='Automobile'), 2400000000000, DATE '2026-03-31', TRUE),
    ('BAJAJFINSV' , 'Bajaj Finserv Ltd.'                            , 'NSE_EQ|INE918I01026'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 3200000000000, DATE '2026-03-31', TRUE),
    ('BAJFINANCE' , 'Bajaj Finance Ltd.'                            , 'NSE_EQ|INE296A01032'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 5500000000000, DATE '2026-03-31', TRUE),
    ('BEL'        , 'Bharat Electronics Ltd.'                       , 'NSE_EQ|INE263A01024'    , 'NSE', (SELECT id FROM sectors WHERE name='Capital Goods'), 2500000000000, DATE '2026-03-31', TRUE),
    ('BHARTIARTL' , 'Bharti Airtel Ltd.'                            , 'NSE_EQ|INE397D01024'    , 'NSE', (SELECT id FROM sectors WHERE name='Telecommunications'), 10500000000000, DATE '2026-03-31', TRUE),
    ('BSE'        , 'BSE Ltd.'                                      , 'NSE_EQ|INE118H01025'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 700000000000, DATE '2026-03-31', TRUE),
    ('CIPLA'      , 'Cipla Ltd.'                                    , 'NSE_EQ|INE059A01026'    , 'NSE', (SELECT id FROM sectors WHERE name='Healthcare'), 1300000000000, DATE '2026-03-31', TRUE),
    ('COALINDIA'  , 'Coal India Ltd.'                               , 'NSE_EQ|INE522F01014'    , 'NSE', (SELECT id FROM sectors WHERE name='Energy'), 2500000000000, DATE '2026-03-31', TRUE),
    ('DRREDDY'    , 'Dr. Reddy''s Laboratories Ltd.'                , 'NSE_EQ|INE089A01031'    , 'NSE', (SELECT id FROM sectors WHERE name='Healthcare'), 1100000000000, DATE '2026-03-31', TRUE),
    ('EICHERMOT'  , 'Eicher Motors Ltd.'                            , 'NSE_EQ|INE066A01021'    , 'NSE', (SELECT id FROM sectors WHERE name='Automobile'), 1500000000000, DATE '2026-03-31', TRUE),
    ('ETERNAL'    , 'Eternal Ltd.'                                  , 'NSE_EQ|INE758T01015'    , 'NSE', (SELECT id FROM sectors WHERE name='Consumer Services'), 2500000000000, DATE '2026-03-31', TRUE),
    ('GRASIM'     , 'Grasim Industries Ltd.'                        , 'NSE_EQ|INE047A01021'    , 'NSE', (SELECT id FROM sectors WHERE name='Cement'), 1800000000000, DATE '2026-03-31', TRUE),
    ('HCLTECH'    , 'HCL Technologies Ltd.'                         , 'NSE_EQ|INE860A01027'    , 'NSE', (SELECT id FROM sectors WHERE name='Information Technology'), 4200000000000, DATE '2026-03-31', TRUE),
    ('HDFCBANK'   , 'HDFC Bank Ltd.'                                , 'NSE_EQ|INE040A01034'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 14500000000000, DATE '2026-03-31', TRUE),
    ('HDFCLIFE'   , 'HDFC Life Insurance Company Ltd.'              , 'NSE_EQ|INE795G01014'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 1400000000000, DATE '2026-03-31', TRUE),
    ('HINDALCO'   , 'Hindalco Industries Ltd.'                      , 'NSE_EQ|INE038A01020'    , 'NSE', (SELECT id FROM sectors WHERE name='Metals'), 1800000000000, DATE '2026-03-31', TRUE),
    ('HINDUNILVR' , 'Hindustan Unilever Ltd.'                       , 'NSE_EQ|INE030A01027'    , 'NSE', (SELECT id FROM sectors WHERE name='FMCG'), 5600000000000, DATE '2026-03-31', TRUE),
    ('ICICIBANK'  , 'ICICI Bank Ltd.'                               , 'NSE_EQ|INE090A01021'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 10000000000000, DATE '2026-03-31', TRUE),
    ('INDIGO'     , 'InterGlobe Aviation Ltd.'                      , 'NSE_EQ|INE646L01027'    , 'NSE', (SELECT id FROM sectors WHERE name='Services'), 2400000000000, DATE '2026-03-31', TRUE),
    ('INFY'       , 'Infosys Ltd.'                                  , 'NSE_EQ|INE009A01021'    , 'NSE', (SELECT id FROM sectors WHERE name='Information Technology'), 6200000000000, DATE '2026-03-31', TRUE),
    ('ITC'        , 'ITC Ltd.'                                      , 'NSE_EQ|INE154A01025'    , 'NSE', (SELECT id FROM sectors WHERE name='FMCG'), 5400000000000, DATE '2026-03-31', TRUE),
    ('JIOFIN'     , 'Jio Financial Services Ltd.'                   , 'NSE_EQ|INE758E01017'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 1800000000000, DATE '2026-03-31', TRUE),
    ('JSWSTEEL'   , 'JSW Steel Ltd.'                                , 'NSE_EQ|INE019A01038'    , 'NSE', (SELECT id FROM sectors WHERE name='Metals'), 2300000000000, DATE '2026-03-31', TRUE),
    ('KOTAKBANK'  , 'Kotak Mahindra Bank Ltd.'                      , 'NSE_EQ|INE237A01036'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 4200000000000, DATE '2026-03-31', TRUE),
    ('LT'         , 'Larsen & Toubro Ltd.'                          , 'NSE_EQ|INE018A01030'    , 'NSE', (SELECT id FROM sectors WHERE name='Infrastructure'), 5000000000000, DATE '2026-03-31', TRUE),
    ('M&M'        , 'Mahindra & Mahindra Ltd.'                      , 'NSE_EQ|INE101A01026'    , 'NSE', (SELECT id FROM sectors WHERE name='Automobile'), 3800000000000, DATE '2026-03-31', TRUE),
    ('MARUTI'     , 'Maruti Suzuki India Ltd.'                      , 'NSE_EQ|INE585B01010'    , 'NSE', (SELECT id FROM sectors WHERE name='Automobile'), 4000000000000, DATE '2026-03-31', TRUE),
    ('MAXHEALTH'  , 'Max Healthcare Institute Ltd.'                 , 'NSE_EQ|INE027H01010'    , 'NSE', (SELECT id FROM sectors WHERE name='Healthcare'), 1000000000000, DATE '2026-03-31', TRUE),
    ('NESTLEIND'  , 'Nestle India Ltd.'                             , 'NSE_EQ|INE239A01024'    , 'NSE', (SELECT id FROM sectors WHERE name='FMCG'), 2300000000000, DATE '2026-03-31', TRUE),
    ('NTPC'       , 'NTPC Ltd.'                                     , 'NSE_EQ|INE733E01010'    , 'NSE', (SELECT id FROM sectors WHERE name='Power'), 3300000000000, DATE '2026-03-31', TRUE),
    ('ONGC'       , 'Oil & Natural Gas Corporation Ltd.'            , 'NSE_EQ|INE213A01029'    , 'NSE', (SELECT id FROM sectors WHERE name='Energy'), 3200000000000, DATE '2026-03-31', TRUE),
    ('POWERGRID'  , 'Power Grid Corporation of India Ltd.'          , 'NSE_EQ|INE752E01010'    , 'NSE', (SELECT id FROM sectors WHERE name='Power'), 2700000000000, DATE '2026-03-31', TRUE),
    ('RELIANCE'   , 'Reliance Industries Ltd.'                      , 'NSE_EQ|INE002A01018'    , 'NSE', (SELECT id FROM sectors WHERE name='Energy'), 17000000000000, DATE '2026-03-31', TRUE),
    ('SBILIFE'    , 'SBI Life Insurance Company Ltd.'               , 'NSE_EQ|INE123W01016'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 1600000000000, DATE '2026-03-31', TRUE),
    ('SBIN'       , 'State Bank of India'                           , 'NSE_EQ|INE062A01020'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 7000000000000, DATE '2026-03-31', TRUE),
    ('SHRIRAMFIN' , 'Shriram Finance Ltd.'                          , 'NSE_EQ|INE721A01047'    , 'NSE', (SELECT id FROM sectors WHERE name='Financial Services'), 1200000000000, DATE '2026-03-31', TRUE),
    ('SUNPHARMA'  , 'Sun Pharmaceutical Industries Ltd.'            , 'NSE_EQ|INE044A01036'    , 'NSE', (SELECT id FROM sectors WHERE name='Healthcare'), 3800000000000, DATE '2026-03-31', TRUE),
    ('TATACONSUM' , 'Tata Consumer Products Ltd.'                   , 'NSE_EQ|INE192A01025'    , 'NSE', (SELECT id FROM sectors WHERE name='FMCG'), 1100000000000, DATE '2026-03-31', TRUE),
    ('TATASTEEL'  , 'Tata Steel Ltd.'                               , 'NSE_EQ|INE081A01020'    , 'NSE', (SELECT id FROM sectors WHERE name='Metals'), 2200000000000, DATE '2026-03-31', TRUE),
    ('TCS'        , 'Tata Consultancy Services Ltd.'                , 'NSE_EQ|INE467B01029'    , 'NSE', (SELECT id FROM sectors WHERE name='Information Technology'), 12000000000000, DATE '2026-03-31', TRUE),
    ('TECHM'      , 'Tech Mahindra Ltd.'                            , 'NSE_EQ|INE669C01036'    , 'NSE', (SELECT id FROM sectors WHERE name='Information Technology'), 1600000000000, DATE '2026-03-31', TRUE),
    ('TITAN'      , 'Titan Company Ltd.'                            , 'NSE_EQ|INE280A01028'    , 'NSE', (SELECT id FROM sectors WHERE name='Consumer Durables'), 3300000000000, DATE '2026-03-31', TRUE),
    ('TMPV'       , 'Tata Motors Passenger Vehicles Ltd.'           , 'NSE_EQ|INE155A01022'    , 'NSE', (SELECT id FROM sectors WHERE name='Automobile'), 1400000000000, DATE '2026-03-31', TRUE),
    ('TRENT'      , 'Trent Ltd.'                                    , 'NSE_EQ|INE849A01020'    , 'NSE', (SELECT id FROM sectors WHERE name='Consumer Services'), 2200000000000, DATE '2026-03-31', TRUE),
    ('ULTRACEMCO' , 'UltraTech Cement Ltd.'                         , 'NSE_EQ|INE481G01011'    , 'NSE', (SELECT id FROM sectors WHERE name='Cement'), 3000000000000, DATE '2026-03-31', TRUE)
ON CONFLICT (symbol) DO UPDATE
SET company_name     = EXCLUDED.company_name,
    instrument_key   = EXCLUDED.instrument_key,
    exchange         = EXCLUDED.exchange,
    sector_id        = EXCLUDED.sector_id,
    market_cap       = EXCLUDED.market_cap,
    market_cap_as_of = EXCLUDED.market_cap_as_of,
    is_active        = EXCLUDED.is_active;

-- Single demo account. Authentication is optional in the first milestone, so every
-- watchlist belongs to this user until auth is added.
INSERT INTO users (name, email, password_hash)
VALUES ('Demo User', 'demo@marketpulse.local', NULL)
ON CONFLICT (email) DO NOTHING;

INSERT INTO watchlists (user_id, name)
SELECT id, 'My Watchlist' FROM users WHERE email = 'demo@marketpulse.local'
ON CONFLICT (user_id, name) DO NOTHING;

COMMIT;
