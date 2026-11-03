/**
 * Demo-mode reference profiles.
 *
 * These are NOT live prices. They seed the historical series and drive the
 * simulated feed when MARKET_DATA_MODE is not 'live'. `basePrice` is an indicative
 * price around the reference revision date, `dailyVolPct` an indicative daily
 * standard deviation and `avgVolume` an indicative daily traded quantity. Every
 * value is labelled as demo data in the API (`mode: 'demo'`) and in the UI badge,
 * and demo observations are never written into a LIVE database.
 *
 * One profile exists per NIFTY 50 constituent, so DEMO mode also covers all 50.
 */
export const STOCK_PROFILES = {
  ADANIENT: { basePrice: 2400, dailyVolPct: 1.9, avgVolume: 1_800_000 },
  ADANIPORTS: { basePrice: 1400, dailyVolPct: 1.3, avgVolume: 3_200_000 },
  APOLLOHOSP: { basePrice: 7200, dailyVolPct: 1.4, avgVolume: 450_000 },
  ASIANPAINT: { basePrice: 2400, dailyVolPct: 1.0, avgVolume: 1_700_000 },
  AXISBANK: { basePrice: 1180, dailyVolPct: 1.1, avgVolume: 8_400_000 },
  'BAJAJ-AUTO': { basePrice: 8800, dailyVolPct: 1.2, avgVolume: 500_000 },
  BAJAJFINSV: { basePrice: 1950, dailyVolPct: 1.2, avgVolume: 1_100_000 },
  BAJFINANCE: { basePrice: 9200, dailyVolPct: 1.3, avgVolume: 1_200_000 },
  BEL: { basePrice: 380, dailyVolPct: 1.4, avgVolume: 6_500_000 },
  BHARTIARTL: { basePrice: 1900, dailyVolPct: 1.0, avgVolume: 5_800_000 },
  BSE: { basePrice: 2600, dailyVolPct: 2.2, avgVolume: 900_000 },
  CIPLA: { basePrice: 1550, dailyVolPct: 0.9, avgVolume: 1_500_000 },
  COALINDIA: { basePrice: 400, dailyVolPct: 1.2, avgVolume: 9_000_000 },
  DRREDDY: { basePrice: 1250, dailyVolPct: 1.1, avgVolume: 1_600_000 },
  EICHERMOT: { basePrice: 5300, dailyVolPct: 1.2, avgVolume: 600_000 },
  ETERNAL: { basePrice: 290, dailyVolPct: 2.0, avgVolume: 12_000_000 },
  GRASIM: { basePrice: 2750, dailyVolPct: 1.1, avgVolume: 700_000 },
  HCLTECH: { basePrice: 1650, dailyVolPct: 1.0, avgVolume: 2_600_000 },
  HDFCBANK: { basePrice: 1745, dailyVolPct: 0.85, avgVolume: 9_200_000 },
  HDFCLIFE: { basePrice: 750, dailyVolPct: 1.0, avgVolume: 3_000_000 },
  HINDALCO: { basePrice: 700, dailyVolPct: 1.4, avgVolume: 5_500_000 },
  HINDUNILVR: { basePrice: 2350, dailyVolPct: 0.8, avgVolume: 1_600_000 },
  ICICIBANK: { basePrice: 1382, dailyVolPct: 0.95, avgVolume: 11_500_000 },
  INDIGO: { basePrice: 5200, dailyVolPct: 1.3, avgVolume: 700_000 },
  INFY: { basePrice: 1524, dailyVolPct: 1.0, avgVolume: 6_100_000 },
  ITC: { basePrice: 412, dailyVolPct: 0.75, avgVolume: 12_500_000 },
  JIOFIN: { basePrice: 300, dailyVolPct: 1.6, avgVolume: 9_500_000 },
  JSWSTEEL: { basePrice: 1050, dailyVolPct: 1.3, avgVolume: 2_400_000 },
  KOTAKBANK: { basePrice: 1800, dailyVolPct: 0.9, avgVolume: 3_800_000 },
  LT: { basePrice: 3585, dailyVolPct: 1.1, avgVolume: 2_300_000 },
  'M&M': { basePrice: 3120, dailyVolPct: 1.2, avgVolume: 4_100_000 },
  MARUTI: { basePrice: 12480, dailyVolPct: 1.05, avgVolume: 620_000 },
  MAXHEALTH: { basePrice: 1050, dailyVolPct: 1.3, avgVolume: 1_900_000 },
  NESTLEIND: { basePrice: 2200, dailyVolPct: 0.8, avgVolume: 700_000 },
  NTPC: { basePrice: 340, dailyVolPct: 1.0, avgVolume: 11_000_000 },
  ONGC: { basePrice: 250, dailyVolPct: 1.2, avgVolume: 14_000_000 },
  POWERGRID: { basePrice: 290, dailyVolPct: 0.9, avgVolume: 9_000_000 },
  RELIANCE: { basePrice: 1420, dailyVolPct: 1.05, avgVolume: 7_800_000 },
  SBILIFE: { basePrice: 1700, dailyVolPct: 1.0, avgVolume: 1_400_000 },
  SBIN: { basePrice: 832, dailyVolPct: 1.25, avgVolume: 13_000_000 },
  SHRIRAMFIN: { basePrice: 620, dailyVolPct: 1.4, avgVolume: 2_800_000 },
  SUNPHARMA: { basePrice: 1750, dailyVolPct: 1.0, avgVolume: 2_200_000 },
  TATACONSUM: { basePrice: 1100, dailyVolPct: 1.0, avgVolume: 2_000_000 },
  TATASTEEL: { basePrice: 160, dailyVolPct: 1.5, avgVolume: 18_000_000 },
  TCS: { basePrice: 3210, dailyVolPct: 0.95, avgVolume: 2_400_000 },
  TECHM: { basePrice: 1600, dailyVolPct: 1.2, avgVolume: 2_000_000 },
  TITAN: { basePrice: 3500, dailyVolPct: 1.1, avgVolume: 900_000 },
  TMPV: { basePrice: 400, dailyVolPct: 1.6, avgVolume: 8_000_000 },
  TRENT: { basePrice: 5000, dailyVolPct: 1.2, avgVolume: 1_000_000 },
  ULTRACEMCO: { basePrice: 11500, dailyVolPct: 1.0, avgVolume: 400_000 }
};

export const profileFor = (symbol) =>
  STOCK_PROFILES[symbol] || { basePrice: 1000, dailyVolPct: 1.0, avgVolume: 1_000_000 };

/** Small deterministic PRNG so seeded history is reproducible across restarts. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller normal sample from a uniform generator. */
export function normal(random) {
  const u = Math.max(random(), 1e-9);
  const v = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
