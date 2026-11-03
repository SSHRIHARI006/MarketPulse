import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const databaseDir = process.env.DATABASE_DIR || path.resolve(backendRoot, '../database');

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (error) => {
  // A dropped idle client must never crash the API; the pool reconnects on demand.
  console.error('[db] idle client error:', error.message);
});

export const query = (text, params) => pool.query(text, params);

async function executeSqlFile(filePath) {
  const sql = await fs.readFile(filePath, 'utf8');
  await pool.query(sql);
}

/**
 * Waits for PostgreSQL to accept connections. Docker Compose starts Postgres and
 * Node concurrently, and the backend must not run database-dependent jobs early.
 */
export async function waitForDatabase({ attempts = 30, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`[db] not ready (${error.message}); retrying ${attempt}/${attempts}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

/** Applies schema.sql + seed.sql. Both are written to be idempotent. */
export async function ensureSchema() {
  await executeSqlFile(path.join(databaseDir, 'schema.sql'));
  await executeSqlFile(path.join(databaseDir, 'seed.sql'));
}

export async function closePool() {
  await pool.end();
}
