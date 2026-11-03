import { Router } from 'express';
import {
  current,
  diagnostics,
  load,
  pause,
  play,
  reset,
  sessions,
  speed,
  status
} from '../controllers/replay.controller.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

router.get('/sessions', asyncHandler(sessions));
router.post('/load', asyncHandler(load));
router.post('/play', asyncHandler(play));
router.post('/pause', asyncHandler(pause));
router.post('/reset', asyncHandler(reset));
router.post('/speed', asyncHandler(speed));
router.get('/status', asyncHandler(status));
router.get('/current', asyncHandler(current));
router.get('/diagnostics', asyncHandler(diagnostics));

export default router;
