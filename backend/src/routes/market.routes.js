import { Router } from 'express';
import { diagnostics, heatmap, movers, overview, snapshot, status, universe } from '../controllers/market.controller.js';
import { insights } from '../controllers/analytics.controller.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

router.get('/overview', asyncHandler(overview));
router.get('/heatmap', asyncHandler(heatmap));
router.get('/status', asyncHandler(status));
router.get('/snapshot', asyncHandler(snapshot));
router.get('/diagnostics', asyncHandler(diagnostics));
router.get('/universe', asyncHandler(universe));
router.get('/movers', asyncHandler(movers));
router.get('/insights', asyncHandler(insights));

export default router;
