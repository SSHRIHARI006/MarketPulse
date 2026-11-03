import { query } from '../config/database.js';
import { marketStore } from '../services/marketStore.js';
import { getStockAnalytics, getStockHistory } from '../services/analytics.service.js';
import { validateStockId } from '../utils/validators.js';

export async function listStocks(req, res) {
  const { rows } = await query(
    `SELECT s.id, s.symbol, s.company_name, s.instrument_key, s.exchange,
            s.market_cap, s.is_active, s.sector_id, COALESCE(sec.name, 'Unclassified') AS sector
     FROM stocks s
     LEFT JOIN sectors sec ON sec.id = s.sector_id
     WHERE s.is_active = TRUE
     ORDER BY s.symbol`
  );

  res.json(
    rows.map((row) => {
      const quote = marketStore.getQuote(row.id);
      return {
        id: row.id,
        symbol: row.symbol,
        companyName: row.company_name,
        instrumentKey: row.instrument_key,
        exchange: row.exchange,
        sector: row.sector,
        marketCap: Number(row.market_cap || 0),
        price: quote?.price ?? null,
        changePct: quote?.changePct ?? null,
        updatedAt: quote?.updatedAt ?? null,
        stale: quote?.stale ?? true
      };
    })
  );
}

export async function getStock(req, res) {
  const id = validateStockId(req.params.id);
  res.json(await getStockAnalytics(id));
}

export async function getHistory(req, res) {
  const id = validateStockId(req.params.id);
  const interval = (req.query.interval || '5m').toString();
  res.json(await getStockHistory(id, { interval, limit: req.query.limit }));
}
