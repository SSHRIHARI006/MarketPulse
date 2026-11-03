import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import protobuf from 'protobufjs';
import { config } from '../config/env.js';
import { sanitizeTick } from '../utils/validators.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundledProto = path.join(here, 'MarketDataFeedV3.proto');

let rootPromise = null;

async function loadRoot() {
  if (rootPromise) return rootPromise;
  rootPromise = (async () => {
    const file = config.upstox.protoPath || bundledProto;
    try {
      await fs.access(file);
      return await protobuf.load(file);
    } catch (error) {
      console.warn(`[feed] proto not readable at ${file} (${error.message}); falling back to bundled schema`);
      return protobuf.load(bundledProto);
    }
  })();
  return rootPromise;
}

const pick = (value, key) => (value && typeof value === 'object' ? value[key] : undefined);

/**
 * Normalises a decoded protobuf FeedResponse into ticks the market store accepts.
 * Fields absent from the chosen feed mode stay null instead of being invented.
 */
export function ticksFromFeedResponse(decoded) {
  const feeds = pick(decoded, 'feeds') || {};
  const ticks = [];

  for (const [instrumentKey, feed] of Object.entries(feeds)) {
    const ltpc =
      pick(feed, 'ltpc') ||
      pick(pick(feed, 'fullFeed'), 'marketFF')?.ltpc ||
      pick(pick(feed, 'fullFeed'), 'indexFF')?.ltpc ||
      pick(feed, 'firstLevelWithGreeks')?.ltpc;

    if (!ltpc) continue;

    const marketFF = pick(pick(feed, 'fullFeed'), 'marketFF');
    const ohlc = marketFF?.marketOHLC?.ohlc || [];
    const dayBar = ohlc.find((bar) => bar.interval === '1d') || null;
    const extended = marketFF?.eFeedDetails || null;
    const volume = extended?.vtt ?? pick(feed, 'firstLevelWithGreeks')?.vtt ?? dayBar?.vol ?? null;

    const tick = sanitizeTick({
      instrumentKey,
      lastPrice: ltpc.ltp,
      previousClose: ltpc.cp,
      lastTradedAt: Number(ltpc.ltt),
      lastQuantity: ltpc.ltq,
      volume,
      open: dayBar?.open,
      high: dayBar?.high,
      low: dayBar?.low,
      averagePrice: extended?.atp
    });

    if (tick) ticks.push(tick);
  }

  return ticks;
}

/** Decodes a binary feed frame. Returns { type, marketInfo, ticks }. */
export async function decodeFeedMessage(buffer) {
  // Some provider deployments deliver the initial control frame as JSON text.
  const asText = buffer.toString('utf8').trim();
  if (asText.startsWith('{')) {
    try {
      const parsed = JSON.parse(asText);
      return {
        type: parsed.type || 'live_feed',
        marketInfo: parsed.marketInfo ? { segmentStatus: parsed.marketInfo.segmentStatus } : null,
        ticks: []
      };
    } catch {
      /* fall through to protobuf */
    }
  }

  const root = await loadRoot();
  const FeedResponse = root.lookupType('FeedResponse');
  const decoded = FeedResponse.toObject(FeedResponse.decode(buffer), {
    longs: Number,
    enums: String,
    defaults: false,
    arrays: true,
    objects: true
  });

  return {
    type: decoded.type || 'live_feed',
    marketInfo: decoded.marketInfo || null,
    currentTs: decoded.currentTs || null,
    ticks: ticksFromFeedResponse(decoded)
  };
}
