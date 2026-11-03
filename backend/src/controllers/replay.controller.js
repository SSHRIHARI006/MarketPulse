import { config } from '../config/env.js';
import { listSessions } from '../replay/dataset.js';
import {
  ensureSessionLoaded,
  getReplayDiagnostics,
  loadReplaySession,
  pauseReplay,
  playReplay,
  replaySnapshot,
  resetReplay,
  setReplaySpeed
} from '../replay/session.js';
import { ValidationError } from '../utils/validators.js';

/**
 * Replay control API.
 *
 * Every command returns the authoritative post-command state, so a client never has
 * to infer what happened. Conflicting transitions (playing while completed, loading
 * an unknown date) are rejected with a status code and a message.
 */

const ALLOWED_SPEEDS = config.replay.speeds;

function requireSpeed(raw) {
  if (raw === undefined || raw === null || raw === '') {
    throw new ValidationError(`speed is required and must be one of: ${ALLOWED_SPEEDS.join(', ')}`);
  }
  const speed = Number(raw);
  if (!Number.isFinite(speed) || !ALLOWED_SPEEDS.includes(speed)) {
    throw new ValidationError(`speed must be one of: ${ALLOWED_SPEEDS.join(', ')}`);
  }
  return speed;
}

export async function sessions(req, res) {
  res.json({ sessions: await listSessions(), granularity: 'ONE_MINUTE_CANDLE' });
}

export async function load(req, res) {
  const { sessionId } = req.body ?? {};
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new ValidationError('sessionId is required (for example "2026-11-02")');
  }
  res.json(await loadReplaySession(sessionId.trim()));
}

export async function play(req, res) {
  const speed = req.body?.speed;
  res.json(playReplay(speed === undefined ? undefined : requireSpeed(speed)));
}

export async function pause(req, res) {
  res.json(await pauseReplay());
}

export async function reset(req, res) {
  res.json(await resetReplay());
}

export async function speed(req, res) {
  res.json(setReplaySpeed(requireSpeed(req.body?.speed)));
}

export async function status(req, res) {
  res.json(await ensureSessionLoaded());
}

export async function diagnostics(req, res) {
  res.json(getReplayDiagnostics());
}

export async function current(req, res) {
  res.json(replaySnapshot());
}
