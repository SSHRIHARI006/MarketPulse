/**
 * Quote reconciliation policy, shared by the Socket.IO path and the REST snapshot.
 *
 * Keeping one function for both matters in REPLAY mode: a snapshot requested before
 * a session switch can arrive after the new session's first events, and the two
 * sources must not disagree about which observation wins.
 *
 * Rules:
 *  - an observation tagged with a replay session that is no longer active is dropped
 *  - an identical event id is a duplicate
 *  - an observation older (by historical time, then receipt time) than the cached one
 *    is ignored
 *  - a missing field never erases a known value
 */

/** Historical timestamp when present, otherwise the observation's receipt time. */
export function quoteTime(quote) {
  const value = quote?.candleAt ?? quote?.updatedAt ?? quote?.receivedAt ?? null;
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function mergeQuote(existing, incoming, activeSessionId = null) {
  if (!incoming) return existing;
  if (incoming.sessionId && activeSessionId && incoming.sessionId !== activeSessionId) return existing;
  if (!existing) return incoming;

  if (incoming.eventId && existing.eventId && incoming.eventId === existing.eventId) return existing;

  const nextTs = quoteTime(incoming);
  const previousTs = quoteTime(existing);
  if (nextTs !== null && previousTs !== null && nextTs < previousTs) return existing;

  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (value === null && merged[key] !== null && merged[key] !== undefined) continue;
    merged[key] = value;
  }
  return merged;
}

/** Merges a list of quotes into a `{ [stockId]: quote }` cache. */
export function mergeQuoteList(cache, quotes, activeSessionId = null) {
  const next = { ...cache };
  for (const quote of quotes || []) {
    next[quote.stockId] = mergeQuote(next[quote.stockId], quote, activeSessionId);
  }
  return next;
}
