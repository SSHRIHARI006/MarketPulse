import { Router } from 'express';
import {
  addStock,
  createWatchlist,
  listWatchlists,
  removeStock
} from '../controllers/watchlist.controller.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

router.get('/', asyncHandler(listWatchlists));
router.post('/', asyncHandler(createWatchlist));
router.post('/:id/stocks', asyncHandler(addStock));
router.delete('/:id/stocks/:stockId', asyncHandler(removeStock));

export default router;
