import WebSocket from 'ws';
import { config } from '../config/env.js';
import { decodeFeedMessage } from './feedDecoder.js';
import { CONNECTION_STATES } from '../services/marketStore.js';

const MAX_BACKOFF_MS = 30_000;
const AUTHORIZE_TIMEOUT_MS = 15_000;

/**
 * LIVE MODE adapter for the Upstox Market Data Feed V3.
 *
 * Upstox requires an authorised WebSocket URI per session, so we first call the
 * authorize endpoint with the bearer token, then open the returned `wss://` URI.
 * Both failures and dropped sockets retry with exponential backoff, and every
 * lifecycle step is reported so the UI and diagnostics endpoint can distinguish
 * "socket open" from "market data actually arriving".
 *
 * The access token never leaves this module: it is used only in the backend
 * Authorization header and is never included in connection reports or logs.
 */
export function createUpstoxFeed({ instrumentKeys = [], onTicks, onConnection, onMarketInfo, onError, onDecodeError }) {
  let socket = null;
  let stopped = false;
  let attempt = 0;
  let reconnectCount = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let authorizedUri = null;

  const keys = [...new Set(instrumentKeys.filter(Boolean))];

  function report(state, extra = {}) {
    onConnection?.({
      state,
      connected: state === CONNECTION_STATES.CONNECTED || state === CONNECTION_STATES.RECEIVING,
      subscribed: extra.subscribed ?? (state === CONNECTION_STATES.CONNECTED || state === CONNECTION_STATES.RECEIVING ? keys.length : 0),
      total: keys.length,
      reconnectCount,
      ...extra
    });
  }

  async function authorize() {
    const response = await fetch(config.upstox.authorizeUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.upstox.accessToken}`
      },
      signal: AbortSignal.timeout(AUTHORIZE_TIMEOUT_MS)
    });

    if (response.status === 401 || response.status === 403) {
      const error = new Error(
        `authorization rejected (HTTP ${response.status}); the access token is invalid or expired`
      );
      error.authError = true;
      throw error;
    }
    if (!response.ok) {
      throw new Error(`authorization failed (HTTP ${response.status})`);
    }

    const body = await response.json().catch(() => null);
    const uri = body?.data?.authorizedRedirectUri;
    if (!uri || !/^wss?:\/\//i.test(uri)) {
      const error = new Error('authorization response did not include a usable authorizedRedirectUri');
      error.authError = true;
      throw error;
    }
    return uri;
  }

  function subscribe(ws) {
    const batchSize = Math.max(1, Math.min(500, config.live.subscriptionBatchSize));
    const mode = config.live.subscriptionMode === 'ltpc' ? 'ltpc' : 'full';
    for (let index = 0; index < keys.length; index += batchSize) {
      const batch = keys.slice(index, index + batchSize);
      const request = {
        guid: `marketpulse-${Date.now()}-${index}`,
        method: 'sub',
        data: { mode, instrumentKeys: batch }
      };
      // The V3 feed expects control frames as binary, not text.
      ws.send(Buffer.from(JSON.stringify(request)));
    }
    console.log(`[live] subscribed ${keys.length} instruments in ${mode} mode`);
  }

  function scheduleReconnect(reason, { authError = false } = {}) {
    if (stopped) return;
    attempt += 1;
    reconnectCount += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1));
    const state = authError ? CONNECTION_STATES.AUTH_ERROR : CONNECTION_STATES.RECONNECTING;
    report(state, { error: reason, subscribed: 0 });
    console.warn(`[live] ${authError ? 'authentication problem' : 'disconnected'} (${reason}); retrying in ${delay}ms`);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
  }

  function clearSocket() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (socket) {
      socket.removeAllListeners();
      try {
        socket.terminate();
      } catch {
        /* already closed */
      }
      socket = null;
    }
  }

  async function connect() {
    if (stopped) return;
    clearSocket();

    try {
      if (!config.upstox.accessToken) {
        const error = new Error('UPSTOX_ACCESS_TOKEN is not set');
        error.authError = true;
        throw error;
      }
      if (!keys.length) {
        throw new Error('no instrument keys to subscribe; is the universe loaded?');
      }

      report(CONNECTION_STATES.CONNECTING, { error: null, subscribed: 0 });
      report(CONNECTION_STATES.AUTHORIZING, { error: null, subscribed: 0 });
      authorizedUri = await authorize();

      report(CONNECTION_STATES.SUBSCRIBING, { error: null, subscribed: 0 });
      socket = new WebSocket(authorizedUri, {
        followRedirects: true,
        headers: {
          Authorization: `Bearer ${config.upstox.accessToken}`,
          Accept: '*/*'
        }
      });
      socket.binaryType = 'arraybuffer';

      socket.on('open', () => {
        attempt = 0;
        console.log('[live] websocket open');
        subscribe(socket);
        // CONNECTED means the socket is open and the subscription was sent. The
        // store promotes the feed to RECEIVING only after a valid tick arrives.
        report(CONNECTION_STATES.CONNECTED, { error: null });
        heartbeatTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.ping();
        }, 25_000);
      });

      socket.on('message', async (data) => {
        try {
          const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
          const decoded = await decodeFeedMessage(buffer);
          if (decoded.marketInfo) onMarketInfo?.(decoded.marketInfo);
          if (decoded.ticks?.length) onTicks?.(decoded.ticks);
        } catch (error) {
          // A single malformed frame must not tear down the feed.
          onDecodeError?.(error);
          console.warn('[live] could not decode frame:', error.message);
        }
      });

      socket.on('close', (code, reason) => {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        const detail = `closed ${code} ${reason?.toString?.() || ''}`.trim();
        scheduleReconnect(detail);
      });

      socket.on('error', (error) => {
        onError?.(error);
        if (socket?.readyState !== WebSocket.CLOSED) socket?.terminate();
      });
    } catch (error) {
      onError?.(error);
      scheduleReconnect(error.message, { authError: Boolean(error.authError) });
    }
  }

  return {
    start() {
      stopped = false;
      return connect();
    },
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      clearSocket();
      report(CONNECTION_STATES.DISCONNECTED, { error: null, subscribed: 0 });
    },
    getInstrumentKeys() {
      return [...keys];
    }
  };
}
