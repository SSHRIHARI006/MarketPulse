/**
 * Instrument-master matching for `npm run sync-instruments`.
 *
 * Rules (spec §3.3):
 *  - only NSE cash-equity instruments are candidates;
 *  - a symbol must resolve to exactly one instrument key, otherwise it is ambiguous;
 *  - two stocks must never end up sharing an instrument key;
 *  - an unresolved symbol keeps its previous mapping and is reported;
 *  - nothing is silently substituted.
 */

/** Groups the provider master by upper-case trading symbol (NSE_EQ only). */
export function indexInstrumentMaster(instruments = []) {
  const bySymbol = new Map();

  for (const instrument of instruments) {
    const segment = String(instrument.segment || '').toUpperCase();
    if (segment !== 'NSE_EQ') continue;
    const type = String(instrument.instrument_type || '').toUpperCase();
    if (type && type !== 'EQ') continue;

    const symbol = String(instrument.trading_symbol || instrument.symbol || '').trim().toUpperCase();
    const key = instrument.instrument_key || instrument.instrumentKey;
    if (!symbol || !key) continue;
    if (!/^NSE_EQ\|[A-Z0-9]+$/.test(String(key))) continue;

    const list = bySymbol.get(symbol) || [];
    list.push({
      instrumentKey: String(key),
      isin: instrument.isin || null,
      name: instrument.name || null
    });
    bySymbol.set(symbol, list);
  }

  return bySymbol;
}

/**
 * Resolves a stock list against an indexed master.
 * Returns the updates to apply plus everything that could not be verified.
 */
export function resolveInstrumentMappings(stocks = [], master = new Map()) {
  const updates = [];
  const missing = [];
  const ambiguous = [];
  const unchanged = [];

  for (const stock of stocks) {
    const symbol = String(stock.symbol || '').toUpperCase();
    const candidates = master.get(symbol) || [];
    const uniqueKeys = [...new Set(candidates.map((candidate) => candidate.instrumentKey))];

    if (uniqueKeys.length === 0) {
      missing.push({ symbol, reason: 'no NSE_EQ instrument for this symbol', kept: stock.instrument_key });
      continue;
    }
    if (uniqueKeys.length > 1) {
      ambiguous.push({
        symbol,
        reason: 'symbol maps to multiple instrument keys',
        candidates: uniqueKeys,
        kept: stock.instrument_key
      });
      continue;
    }

    const instrumentKey = uniqueKeys[0];
    if (instrumentKey === stock.instrument_key) {
      unchanged.push({ symbol, instrumentKey });
    } else {
      updates.push({ id: stock.id, symbol, instrumentKey, previous: stock.instrument_key });
    }
  }

  // A key may not be assigned to two stocks; drop both sides rather than guess.
  const owners = new Map();
  for (const update of updates) {
    owners.set(update.instrumentKey, [...(owners.get(update.instrumentKey) || []), update]);
  }

  const conflicts = [];
  for (const [instrumentKey, claimants] of owners) {
    if (claimants.length < 2) continue;
    conflicts.push({
      instrumentKey,
      symbols: claimants.map((claimant) => claimant.symbol),
      reason: 'instrument key resolved for more than one tracked stock'
    });
  }
  const conflictedSymbols = new Set(conflicts.flatMap((conflict) => conflict.symbols));
  const safeUpdates = updates.filter((update) => !conflictedSymbols.has(update.symbol));
  for (const update of updates) {
    if (conflictedSymbols.has(update.symbol)) {
      ambiguous.push({ symbol: update.symbol, reason: 'resolved key collides with another stock', kept: update.previous });
    }
  }

  return {
    updates: safeUpdates,
    unchanged,
    missing,
    ambiguous,
    conflicts,
    resolved: safeUpdates.length + unchanged.length,
    total: stocks.length
  };
}

/** Applies verified mappings. Never touches a row it could not verify. */
export async function applyInstrumentUpdates(updates, runQuery) {
  let applied = 0;
  for (const update of updates) {
    await runQuery('UPDATE stocks SET instrument_key = $1 WHERE id = $2', [update.instrumentKey, update.id]);
    applied += 1;
  }
  return applied;
}
