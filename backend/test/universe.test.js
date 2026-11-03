import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKET_CAP_REFERENCE_DATE,
  NIFTY50_CONSTITUENTS,
  NIFTY50_SECTORS,
  NIFTY50_SYMBOLS
} from '../src/data/nifty50.js';
import { STOCK_PROFILES } from '../src/data/stockProfiles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedSql = fs.readFileSync(path.join(here, '../../database/seed.sql'), 'utf8');
const schemaSql = fs.readFileSync(path.join(here, '../../database/schema.sql'), 'utf8');

const seedRowFor = (symbol) =>
  seedSql
    .split('\n')
    .find((line) => line.trimStart().startsWith(`('${symbol.replace(/'/g, "''")}'`));

test('the tracked universe is exactly the 50 NIFTY 50 constituents', () => {
  assert.equal(NIFTY50_CONSTITUENTS.length, 50);
  assert.equal(new Set(NIFTY50_SYMBOLS).size, 50, 'symbols must be unique');
  assert.equal(new Set(NIFTY50_SECTORS).size >= 10, true, 'constituents span multiple sectors');
});

test('every constituent has a valid, unique provider instrument mapping and sector', () => {
  const keys = NIFTY50_CONSTITUENTS.map((row) => row.instrumentKey);
  assert.equal(new Set(keys).size, 50, 'instrument keys must be unique');

  for (const row of NIFTY50_CONSTITUENTS) {
    assert.match(row.instrumentKey, /^NSE_EQ\|[A-Z0-9]+$/, `${row.symbol} instrument key`);
    assert.ok(row.sector && row.sector.length > 1, `${row.symbol} needs a sector`);
    assert.ok(row.companyName.length > 2, `${row.symbol} needs a company name`);
    assert.ok(row.marketCap > 0, `${row.symbol} needs a reference market cap`);
    assert.match(MARKET_CAP_REFERENCE_DATE, /^\d{4}-\d{2}-\d{2}$/, 'market cap reference date');
  }
});

test('database/seed.sql applies the same universe as the reference dataset', () => {
  const seedKeys = seedSql.match(/'NSE_EQ\|[A-Z0-9]+'/g) || [];
  assert.equal(seedKeys.length, 50, 'seed.sql must contain exactly 50 instrument keys');
  assert.equal(new Set(seedKeys).size, 50, 'seed.sql instrument keys must be unique');

  for (const row of NIFTY50_CONSTITUENTS) {
    const line = seedRowFor(row.symbol);
    assert.ok(line, `${row.symbol} missing from seed.sql`);
    assert.ok(line.includes(row.instrumentKey), `${row.symbol} instrument key mismatch in seed.sql`);
    assert.ok(line.includes(row.sector), `${row.symbol} sector mismatch in seed.sql`);
    assert.ok(line.includes(String(row.marketCap)), `${row.symbol} market cap mismatch in seed.sql`);
  }

  assert.match(seedSql, /ON CONFLICT \(symbol\) DO UPDATE/, 're-running the seed must not duplicate stocks');
  assert.match(seedSql, /market_cap_as_of/, 'market cap reference date must be stored');
});

test('schema stores the market-cap reference date', () => {
  assert.match(schemaSql, /market_cap_as_of DATE/);
  assert.match(schemaSql, /ALTER TABLE stocks ADD COLUMN IF NOT EXISTS market_cap_as_of DATE/);
});

test('DEMO mode has a profile for every constituent', () => {
  for (const symbol of NIFTY50_SYMBOLS) {
    assert.ok(STOCK_PROFILES[symbol], `${symbol} needs a demo profile so demo covers all 50`);
    const profile = STOCK_PROFILES[symbol];
    assert.ok(profile.basePrice > 0 && profile.dailyVolPct > 0 && profile.avgVolume > 0);
  }
});
