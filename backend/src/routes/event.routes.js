import { Router } from 'express';
import { listEvents, recentEvents } from '../controllers/event.controller.js';
import { asyncHandler } from '../middleware/error.middleware.js';

const router = Router();

router.get('/', asyncHandler(listEvents));
router.get('/recent', asyncHandler(recentEvents));

export default router;
