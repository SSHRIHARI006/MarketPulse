/** Shared validation helpers for market data and request input. */

export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function toInt(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Round helpers keep NUMERIC(14,4) values and JSON payloads consistent. */
export const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function percentChange(current, base) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}

/** Optional numeric field that must not be negative when present. */
const nonNegative = (value) => {
  const parsed = toNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

/** Accepts epoch milliseconds, a Date, or an ISO string. Returns null when absent. */
function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : Number.NaN;
  const numeric = toNumber(value);
  if (numeric !== null) return numeric;
  return Date.parse(String(value));
}

/**
 * A market update is only accepted when it carries a usable instrument key, a
 * strictly positive finite price and, when present, a plausible timestamp.
 *
 * Missing optional fields are tolerated (they are absent from some feed modes);
 * invalid ones are not. A rejected tick is dropped before it reaches the cache, so
 * it can never overwrite a valid last price.
 */
export function sanitizeTick(raw, now = () => new Date()) {
  if (!raw || typeof raw !== 'object') return null;
  const instrumentKey = typeof raw.instrumentKey === 'string' ? raw.instrumentKey.trim() : '';
  if (!instrumentKey) return null;

  const price = toNumber(raw.lastPrice);
  if (price === null || !Number.isFinite(price) || price <= 0 || price > 5_000_000) return null;

  const previousClose = toNumber(raw.previousClose);
  const volume = toInt(raw.volume, null);
  const lastQuantity = toInt(raw.lastQuantity, null);

  // A malformed or implausibly future trade time means the frame cannot be trusted.
  const nowMs = now().getTime();
  const tradedAtMs = parseTimestamp(raw.lastTradedAt);
  if (tradedAtMs !== null && (!Number.isFinite(tradedAtMs) || tradedAtMs <= 0 || tradedAtMs > nowMs + 24 * 60 * 60 * 1000)) {
    return null;
  }

  return {
    instrumentKey,
    lastPrice: round(price, 4),
    previousClose: previousClose !== null && previousClose > 0 ? round(previousClose, 4) : null,
    lastQuantity: lastQuantity !== null && lastQuantity >= 0 ? lastQuantity : null,
    volume: volume !== null && volume >= 0 ? volume : null,
    open: nonNegative(raw.open),
    high: nonNegative(raw.high),
    low: nonNegative(raw.low),
    averagePrice: nonNegative(raw.averagePrice),
    lastTradedAt: tradedAtMs !== null ? new Date(tradedAtMs) : null,
    receivedAt: now()
  };
}

export function validateStockId(raw) {
  const id = toInt(raw, null);
  if (id === null || id <= 0) throw new ValidationError('A valid numeric stock id is required');
  return id;
}

const SORT_KEYS = new Set(['changePct', 'price', 'volume', 'marketCap', 'symbol']);
const TIME_RANGES = new Set(['daily', '5m', '15m', '1h', 'session']);

export function validateRange(raw) {
  const value = (raw || 'daily').toString().toLowerCase();
  if (!TIME_RANGES.has(value)) {
    throw new ValidationError(`range must be one of: ${[...TIME_RANGES].join(', ')}`);
  }
  return value;
}

export function validateSizeBy(raw) {
  const value = (raw || 'marketCap').toString();
  if (!['marketCap', 'volume', 'equal'].includes(value)) {
    throw new ValidationError('sizeBy must be one of: marketCap, volume, equal');
  }
  return value;
}

export function validateLimit(raw, fallback = 50, max = 500) {
  const value = toInt(raw, fallback);
  if (value === null || value <= 0) return fallback;
  return Math.min(value, max);
}

export function validateSortKey(raw, fallback = 'changePct') {
  return SORT_KEYS.has(raw) ? raw : fallback;
}
