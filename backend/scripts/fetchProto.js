/**
 * Downloads the provider's official Market Data Feed proto file.
 *
 * The bundled schema in src/feed/MarketDataFeedV3.proto mirrors the documented V3
 * response shape. Upstox's published file is authoritative; set UPSTOX_PROTO_PATH
 * to use the downloaded copy without changing code.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.env.UPSTOX_PROTO_PATH || path.resolve(here, '../src/feed/MarketDataFeedV3.official.proto');

const candidates = [
  'https://assets.upstox.com/market-data-feed/MarketDataFeedV3.proto',
  'https://assets.upstox.com/market-data-feed/market-data-feed.proto',
  'https://upstox.com/developer/api-documentation/assets/MarketDataFeedV3.proto'
];

async function main() {
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[proto] ${url} -> HTTP ${response.status}`);
        continue;
      }
      const text = await response.text();
      if (!text.includes('syntax = "proto3"') && !text.includes('syntax="proto3"')) {
        console.warn(`[proto] ${url} did not return a proto file`);
        continue;
      }
      await fs.writeFile(target, text);
      console.log(`[proto] saved ${target}\n[proto] set UPSTOX_PROTO_PATH=${target} to use it`);
      return;
    } catch (error) {
      console.warn(`[proto] ${url} failed: ${error.message}`);
    }
  }
  console.error(
    '[proto] could not download automatically. Download the proto linked from\n' +
      '        https://upstox.com/developer/api-documentation/v3/get-market-data-feed/\n' +
      `        and save it to ${target}, then set UPSTOX_PROTO_PATH.`
  );
  process.exitCode = 1;
}

main();
