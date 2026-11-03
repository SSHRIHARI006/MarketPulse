import { query } from '../config/database.js';
import { config, dataSource, isDemoMode, validateConfig } from '../config/env.js';
import { createDemoFeed } from '../feed/demoFeed.js';
import { createUpstoxFeed } from '../feed/upstoxFeed.js';
import { CONNECTION_STATES, marketStore } from './marketStore.js';
import { MARKET_CAP_REFERENCE_DATE, NIFTY50_CONSTITUENT_DATE } from '../data/nifty50.js';
import { ingestQuote } from './candle.service.js';
import { percentChange, round, sanitizeTick } from '../utils/validators.js';
import { latestSessionStart } from '../utils/time.js';

let feed = null;
let started = false;

/**
 * Loads the stock universe and hydrates the in-memory store from PostgreSQL so the
 * dashboard has a previous close and intraday history before the feed's first tick.
 */
export async function loadUniverse() {
  const { rows } = await query(
    `SELECT s.id, s.symbol, s.company_name, s.instrument_key, s.exchange,
            s.market_cap, s.market_cap_as_of, s.sector_id,
            COALESCE(sec.name, 'Unclassified') AS sector
     FROM stocks s
     LEFT JOIN sectors sec ON sec.id = s.sector_id
     WHERE s.is_active = TRUE
     ORDER BY s.id`
  );
  marketStore.registerStocks(rows);
  return rows;
}

/** Latest stored prices: previous daily close plus today's intraday bars. */
async function hydrateFromDatabase() {
  const previousCloses = new Map();
  const source = dataSource();

  // Only this mode's own observations hydrate the cache. Switching DEMO -> LIVE
  // must not turn simulated history into "last prices".
  const daily = await query(
    `SELECT DISTINCT ON (stock_id) stock_id, close, candle_start
     FROM stock_candles
     WHERE interval = '1d' AND source = $1
     ORDER BY stock_id, candle_start DESC`,
    [source]
  );
  for (const row of daily.rows) {
    previousCloses.set(row.stock_id, Number(row.close));
  }

  const sessionStart = latestSessionStart(new Date());
  const intraday = await query(
    `SELECT stock_id, candle_start, open, high, low, close, volume
     FROM stock_candles
     WHERE interval = '1m' AND candle_start >= $1 AND source = $2
     ORDER BY stock_id, candle_start`,
    [sessionStart.toISOString(), source]
  );

  const perStock = new Map();
  for (const row of intraday.rows) {
    const list = perStock.get(row.stock_id) || [];
    list.push(row);
    perStock.set(row.stock_id, list);
  }

  for (const [stockId, bars] of perStock) {
    const quote = marketStore.getQuote(stockId);
    if (!quote) continue;

    const history = marketStore.getHistory(stockId);
    history.length = 0;
    for (const bar of bars) {
      history.push({
        ts: new Date(bar.candle_start).getTime(),
        price: Number(bar.close),
        volume: Number(bar.volume || 0)
      });
    }

    const latest = bars[bars.length - 1];
    const previousClose = previousCloses.get(stockId) ?? null;
    const price = Number(latest.close);
    const changePct = previousClose ? percentChange(price, previousClose) : null;
    const sessionBars = bars;
    const priced = sessionBars.length ? sessionBars : [latest];

    marketStore.quotes.set(stockId, {
      ...quote,
      price: round(price, 4),
      previousClose,
      changePct: changePct === null ? null : round(changePct, 4),
      changeAbs: changePct === null ? null : round(price - previousClose, 4),
      volume: sessionBars.reduce((sum, bar) => sum + Number(bar.volume || 0), 0),
      open: Number(priced[0].open),
      high: Math.max(...priced.map((bar) => Number(bar.high))),
      low: Math.min(...priced.map((bar) => Number(bar.low))),
      averagePrice: null,
      tradedAt: new Date(latest.candle_start),
      receivedAt: new Date(latest.candle_start),
      // Hydrated prices are historical, so they are marked stale until a live tick
      // arrives. The UI must not present them as current market data.
      updatedAt: null,
      stale: true,
      sources: 0
    });
  }

  return previousCloses;
}

/** Applies a tick to the store and the candle aggregator (sockets listen to the store). */
export function processTick(tick) {
  if (!tick || typeof tick.instrumentKey !== 'string') return false;

  // Index instruments feed the overview cards, not the stock universe.
  if (config.indices.some((index) => index.key === tick.instrumentKey)) {
    return marketStore.applyIndexTick(tick.instrumentKey, tick);
  }

  const stock = marketStore.getStockByKey(tick.instrumentKey);
  if (!stock) {
    marketStore.recordRejectedTick();
    return false;
  }
  if (!marketStore.applyTick(tick)) return false;
  const quote = marketStore.getQuote(stock.id);
  if (quote) ingestQuote(quote);
  return true;
}

export function handleTicks(ticks) {
  let accepted = 0;
  for (const tick of ticks) if (processTick(tick)) accepted += 1;
  return accepted;
}

/** Current tracked constituent list with live quote status (for /api/market/universe). */
export function getUniverse() {
  const now = Date.now();
  return {
    mode: marketStore.connection.mode,
    source: 'NSE NIFTY 50',
    referenceDate: NIFTY50_CONSTITUENT_DATE,
    marketCapReferenceDate: MARKET_CAP_REFERENCE_DATE,
    total: marketStore.listStocks().length,
    stocks: marketStore.listStocks().map((stock) => {
      const quote = marketStore.getQuote(stock.id);
      return {
        id: stock.id,
        symbol: stock.symbol,
        companyName: stock.companyName,
        instrumentKey: stock.instrumentKey,
        exchange: stock.exchange,
        sector: stock.sector,
        marketCap: stock.marketCap,
        marketCapAsOf: stock.marketCapAsOf,
        isActive: stock.isActive,
        price: quote?.price ?? null,
        dataStatus: marketStore.getDataStatus(quote, now)
      };
    })
  };
}

export async function startMarketData() {
  if (started) return { mode: config.marketDataMode };
  started = true;

  const { errors, warnings } = validateConfig();
  for (const warning of warnings) console.warn(`[config] ${warning}`);
  for (const error of errors) console.error(`[config] ${error}`);

  const stocks = await loadUniverse();
  const previousCloses = await hydrateFromDatabase();

  const demo = isDemoMode();
  marketStore.setConnection({
    mode: demo ? 'demo' : 'live',
    state: demo ? CONNECTION_STATES.DISCONNECTED : CONNECTION_STATES.CONNECTING,
    connected: false,
    error: null
  });

  if (demo) {
    // The simulator "subscribes" to the whole universe, so the UI reports 50/50.
    marketStore.setSubscription({ subscribed: stocks.length, total: stocks.length });

    feed = createDemoFeed({
      stocks: stocks.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        instrumentKey: row.instrument_key,
        marketCap: Number(row.market_cap || 0)
      })),
      previousCloses,
      onTicks: handleTicks,
      onConnection: (connection) => marketStore.setConnection(connection),
      onMarketInfo: (info) => marketStore.setMarketInfo(info)
    });
    feed.start({
      onIndexTick: (indexTicks) => {
        for (const tick of indexTicks) {
          marketStore.applyIndexTick(
            tick.instrumentKey,
            sanitizeTick({
              instrumentKey: tick.instrumentKey,
              lastPrice: tick.lastPrice,
              previousClose: tick.previousClose,
              lastTradedAt: Date.now()
            })
          );
        }
      }
    });
  } else {
    feed = createUpstoxFeed({
      // Every tracked stock plus the index instruments: the previous adapter only
      // subscribed to the indices, which is why LIVE mode never produced stock data.
      instrumentKeys: marketStore.getInstrumentKeys(),
      onTicks: handleTicks,
      onConnection: ({ subscribed, total, ...connection }) => {
        marketStore.setConnection(connection);
        if (Number.isFinite(subscribed) || Number.isFinite(total)) {
          marketStore.setSubscription({ subscribed, total });
        }
      },
      onMarketInfo: (info) => marketStore.setMarketInfo(info),
      onDecodeError: () => marketStore.recordDecodeError(),
      onError: (error) => console.warn('[live] error:', error.message)
    });
    await feed.start();
  }

  console.log(`[market] data source started in ${demo ? 'DEMO (simulated)' : 'LIVE'} mode`);
  return { mode: demo ? 'demo' : 'live', stocks: stocks.length };
}

export async function stopMarketData() {
  feed?.stop();
  feed = null;
  started = false;
  marketStore.setConnection({ connected: false });
}

export const getMode = () => (isDemoMode() ? 'demo' : 'live');
