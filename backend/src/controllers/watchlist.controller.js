import { query } from '../config/database.js';
import { marketStore } from '../services/marketStore.js';
import { toInt, ValidationError } from '../utils/validators.js';

const DEMO_USER_EMAIL = 'demo@marketpulse.local';

/**
 * Watchlists are owned by the single demo user until authentication (P2) is added.
 * Requests therefore never take a user id from the client.
 */
async function demoUserId() {
  const { rows } = await query('SELECT id FROM users WHERE email = $1', [DEMO_USER_EMAIL]);
  if (!rows.length) throw new ValidationError('Demo user missing; database seed did not run', 500);
  return rows[0].id;
}

export async function listWatchlists(req, res) {
  const userId = await demoUserId();
  const { rows } = await query(
    `SELECT w.id, w.name, w.created_at,
            COALESCE(
              json_agg(
                json_build_object('stockId', s.id, 'symbol', s.symbol,
                                  'companyName', s.company_name, 'sector', sec.name)
                ORDER BY s.symbol
              ) FILTER (WHERE s.id IS NOT NULL), '[]'
            ) AS stocks
     FROM watchlists w
     LEFT JOIN watchlist_stocks ws ON ws.watchlist_id = w.id
     LEFT JOIN stocks s ON s.id = ws.stock_id
     LEFT JOIN sectors sec ON sec.id = s.sector_id
     WHERE w.user_id = $1
     GROUP BY w.id
     ORDER BY w.created_at`,
    [userId]
  );

  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      stocks: (row.stocks || []).map((stock) => {
        const quote = marketStore.getQuote(stock.stockId);
        return {
          ...stock,
          price: quote?.price ?? null,
          changePct: quote?.changePct ?? null,
          updatedAt: quote?.updatedAt ?? null
        };
      })
    }))
  );
}

export async function createWatchlist(req, res) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) throw new ValidationError('Watchlist name is required');
  if (name.length > 120) throw new ValidationError('Watchlist name is too long');

  const userId = await demoUserId();
  const { rows } = await query(
    `INSERT INTO watchlists (user_id, name) VALUES ($1, $2)
     ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, created_at`,
    [userId, name]
  );
  res.status(201).json({ id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at, stocks: [] });
}

export async function addStock(req, res) {
  const watchlistId = toInt(req.params.id, null);
  const stockId = toInt(req.body?.stockId, null);
  if (watchlistId === null) throw new ValidationError('Invalid watchlist id');
  if (stockId === null) throw new ValidationError('stockId is required');

  const userId = await demoUserId();
  const owner = await query('SELECT id FROM watchlists WHERE id = $1 AND user_id = $2', [watchlistId, userId]);
  if (!owner.rows.length) throw new ValidationError('Watchlist not found', 404);

  const stock = await query('SELECT id FROM stocks WHERE id = $1', [stockId]);
  if (!stock.rows.length) throw new ValidationError('Stock not found', 404);

  await query(
    `INSERT INTO watchlist_stocks (watchlist_id, stock_id) VALUES ($1, $2)
     ON CONFLICT (watchlist_id, stock_id) DO NOTHING`,
    [watchlistId, stockId]
  );
  res.status(201).json({ ok: true, watchlistId, stockId });
}

export async function removeStock(req, res) {
  const watchlistId = toInt(req.params.id, null);
  const stockId = toInt(req.params.stockId, null);
  if (watchlistId === null || stockId === null) throw new ValidationError('Invalid watchlist or stock id');

  const userId = await demoUserId();
  const owner = await query('SELECT id FROM watchlists WHERE id = $1 AND user_id = $2', [watchlistId, userId]);
  if (!owner.rows.length) throw new ValidationError('Watchlist not found', 404);

  await query('DELETE FROM watchlist_stocks WHERE watchlist_id = $1 AND stock_id = $2', [watchlistId, stockId]);
  res.json({ ok: true });
}
