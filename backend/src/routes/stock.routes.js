import { Router } from 'express';
import { getHistory, getStock, listStocks } from '../controllers/stock.controller.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

router.get('/', asyncHandler(listStocks));
router.get('/:id', asyncHandler(getStock));
router.get('/:id/history', asyncHandler(getHistory));
router.get('/:id/analytics', asyncHandler(getStock));

export default router;
