// Replay control API. The backend is the only authority on replay state; these calls
// send commands and return the resulting state.
const BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const text = await response.text();
  const body = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = body?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const api = {
  overview: () => request('/market/overview'),
  heatmap: ({ range = 'daily', sector = 'all', sizeBy = 'marketCap' } = {}) =>
    request(`/market/heatmap${qs({ range, sector, sizeBy })}`),
  status: () => request('/market/status'),
  snapshot: () => request('/market/snapshot'),
  diagnostics: () => request('/market/diagnostics'),
  universe: () => request('/market/universe'),
  movers: () => request('/market/movers'),
  insights: () => request('/market/insights'),

  stocks: () => request('/stocks'),
  stock: (id) => request(`/stocks/${id}`),
  history: (id, { interval = '5m', limit = 200 } = {}) =>
    request(`/stocks/${id}/history${qs({ interval, limit })}`),

  momentum: () => request('/analytics/momentum'),
  volatility: () => request('/analytics/volatility'),
  volumeSpikes: () => request('/analytics/volume-spikes'),
  sectors: () => request('/analytics/sectors'),
  activity: (limit = 50) => request(`/analytics/activity${qs({ limit })}`),
  compare: (ids, window = 60) => request(`/analytics/compare${qs({ ids: ids.join(','), window })}`),
  intelligence: () => request('/analytics/intelligence'),

  events: ({ limit = 50, stockId, type } = {}) => request(`/events${qs({ limit, stockId, type })}`),
  recentEvents: (minutes = 360) => request(`/events/recent${qs({ minutes })}`),

  watchlists: () => request('/watchlists'),
  createWatchlist: (name) => post('/watchlists', { name }),
  addToWatchlist: (id, stockId) => post(`/watchlists/${id}/stocks`, { stockId }),
  removeFromWatchlist: (id, stockId) =>
    request(`/watchlists/${id}/stocks/${stockId}`, { method: 'DELETE' }),

  // Replay
  replaySessions: () => request('/replay/sessions'),
  replayStatus: () => request('/replay/status'),
  replayDiagnostics: () => request('/replay/diagnostics'),
  replayLoad: (sessionId) => post('/replay/load', { sessionId }),
  replayPlay: (speed) => post('/replay/play', speed === undefined ? {} : { speed }),
  replayPause: () => post('/replay/pause'),
  replayReset: () => post('/replay/reset'),
  replaySpeed: (speed) => post('/replay/speed', { speed })
};
