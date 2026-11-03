/**
 * Refreshes `stocks.instrument_key` from the provider's instrument master.
 *
 * Run `npm run sync-instruments` after setting UPSTOX_INSTRUMENTS_URL (a direct
 * JSON URL, or leave the default .gz). NSE equity ISINs are the `instrument_key`.
 *
 * The script never guesses: a symbol with no match, several matches or a key that
 * collides with another tracked stock keeps its previous valid mapping and is
 * reported. Exit code is 1 when the universe could not be fully verified, so a CI
 * run notices a broken mapping.
 */
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { config } from '../src/config/env.js';
import { closePool, query } from '../src/config/database.js';
import {
  applyInstrumentUpdates,
  indexInstrumentMaster,
  resolveInstrumentMappings
} from '../src/services/instrumentSync.js';

const gunzip = promisify(zlib.gunzip);

async function loadInstruments() {
  const response = await fetch(config.upstox.instrumentMasterUrl, {
    headers: { Accept: '*/*', 'Accept-Encoding': 'gzip' }
  });
  if (!response.ok) throw new Error(`instrument master request failed: HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
  const text = isGzip ? (await gunzip(buffer)).toString('utf8') : buffer.toString('utf8');
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed.data || [];
}

function reportLines(title, entries, describe) {
  if (!entries.length) return;
  console.warn(`[instruments] ${title} (${entries.length}):`);
  for (const entry of entries) console.warn(`  - ${describe(entry)}`);
}

async function main() {
  const stocks = (await query('SELECT id, symbol, instrument_key FROM stocks WHERE is_active = TRUE ORDER BY id')).rows;
  if (!stocks.length) throw new Error('no active stocks found; apply database/seed.sql first');

  const instruments = await loadInstruments();
  const master = indexInstrumentMaster(instruments);
  console.log(`[instruments] provider master: ${instruments.length} rows, ${master.size} NSE_EQ symbols`);

  const result = resolveInstrumentMappings(stocks, master);
  const applied = await applyInstrumentUpdates(result.updates, query);

  for (const update of result.updates) {
    console.log(`[instruments] ${update.symbol}: ${update.previous} -> ${update.instrumentKey}`);
  }
  reportLines('unresolved symbols (previous mapping kept)', result.missing, (entry) => `${entry.symbol}: ${entry.reason}`);
  reportLines('ambiguous symbols (previous mapping kept)', result.ambiguous, (entry) => `${entry.symbol}: ${entry.reason}`);
  reportLines('key collisions (not applied)', result.conflicts, (entry) =>
    `${entry.instrumentKey} claimed by ${entry.symbols.join(', ')}`
  );

  console.log(
    `[instruments] verified ${result.resolved}/${result.total} mappings (${applied} updated, ` +
      `${result.unchanged.length} already correct)`
  );

  if (result.resolved !== result.total) {
    console.error('[instruments] universe is not fully verified; review the report above');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[instruments] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());
