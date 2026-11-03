import { Router } from 'express';
import {
  activity,
  compare,
  insights,
  intelligence,
  momentum,
  sectors,
  volatility,
  volumeSpikes
} from '../controllers/analytics.controller.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

router.get('/momentum', asyncHandler(momentum));
router.get('/volatility', asyncHandler(volatility));
router.get('/volume-spikes', asyncHandler(volumeSpikes));
router.get('/sectors', asyncHandler(sectors));
router.get('/activity', asyncHandler(activity));
router.get('/compare', asyncHandler(compare));
router.get('/insights', asyncHandler(insights));
router.get('/intelligence', asyncHandler(intelligence));

export default router;
