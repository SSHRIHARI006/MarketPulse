import { query } from '../config/database.js';
import { mapEventRow } from '../services/analytics.service.js';
import { toInt, validateLimit } from '../utils/validators.js';

const EVENT_TYPES = ['VOLUME_SPIKE', 'PRICE_SURGE', 'PRICE_DROP', 'VOLATILITY_SPIKE', 'UNUSUAL_ACTIVITY'];

export async function listEvents(req, res) {
  const limit = validateLimit(req.query.limit, 50);
  const stockId = toInt(req.query.stockId, null);
  const type = EVENT_TYPES.includes(req.query.type) ? req.query.type : null;

  const conditions = [];
  const params = [];
  if (stockId !== null) {
    params.push(stockId);
    conditions.push(`e.stock_id = $${params.length}`);
  }
  if (type) {
    params.push(type);
    conditions.push(`e.event_type = $${params.length}`);
  }
  params.push(limit);

  const { rows } = await query(
    `SELECT e.id, e.stock_id, s.symbol, s.company_name, e.event_type, e.severity,
            e.activity_score, e.description, e.detected_at
     FROM market_events e
     JOIN stocks s ON s.id = e.stock_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY e.detected_at DESC
     LIMIT $${params.length}`,
    params
  );

  res.json({ events: rows.map(mapEventRow), types: EVENT_TYPES });
}

export async function recentEvents(req, res) {
  const limit = validateLimit(req.query.limit, 20);
  const minutes = validateLimit(req.query.minutes, 360, 10_080);

  const { rows } = await query(
    `SELECT e.id, e.stock_id, s.symbol, s.company_name, e.event_type, e.severity,
            e.activity_score, e.description, e.detected_at
     FROM market_events e
     JOIN stocks s ON s.id = e.stock_id
     WHERE e.detected_at > now() - ($1 || ' minutes')::interval
     ORDER BY e.detected_at DESC
     LIMIT $2`,
    [String(minutes), limit]
  );

  res.json({ events: rows.map(mapEventRow), windowMinutes: minutes });
}
