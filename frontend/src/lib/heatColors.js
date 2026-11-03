/**
 * Continuous heatmap gradient. Colour is a smooth function of percentage change so
 * adjacent tiles never jump between discrete buckets; movement inside the neutral
 * band is rendered neutral to prevent flicker around zero.
 */
const STOPS = {
  neutral: '#2b3546',
  downSoft: '#4b2430',
  downMid: '#8b1f2d',
  downStrong: '#d92d43',
  upSoft: '#16382c',
  upMid: '#12704b',
  upStrong: '#1fbf75'
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

const rgbCache = new Map(Object.entries(STOPS).map(([key, hex]) => [key, hexToRgb(hex)]));

function mix(fromKey, toKey, t) {
  const from = rgbCache.get(fromKey);
  const to = rgbCache.get(toKey);
  const ratio = Math.min(1, Math.max(0, t));
  const channel = (a, b) => Math.round(a + (b - a) * ratio);
  return `rgb(${channel(from.r, to.r)}, ${channel(from.g, to.g)}, ${channel(from.b, to.b)})`;
}

export function heatColor(changePct, { neutralBand = 0.05, maxPct = 5 } = {}) {
  if (changePct === null || changePct === undefined || !Number.isFinite(Number(changePct))) {
    return STOPS.neutral;
  }
  const value = Number(changePct);
  if (Math.abs(value) <= neutralBand) return STOPS.neutral;

  const t = Math.min(1, (Math.abs(value) - neutralBand) / Math.max(0.01, maxPct - neutralBand));
  if (value > 0) {
    return t < 0.5 ? mix('upSoft', 'upMid', t / 0.5) : mix('upMid', 'upStrong', (t - 0.5) / 0.5);
  }
  return t < 0.5 ? mix('downSoft', 'downMid', t / 0.5) : mix('downMid', 'downStrong', (t - 0.5) / 0.5);
}

/** Text colour that stays readable on the tile gradient. */
export function heatTextColor(changePct, options) {
  if (changePct === null || changePct === undefined) return 'text-slate-300';
  const color = heatColor(changePct, options);
  const match = color.match(/(\d+), (\d+), (\d+)/);
  if (!match) return 'text-slate-100';
  const [, r, g, b] = match.map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? 'text-slate-900' : 'text-slate-50';
}
