import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import marketRoutes from './routes/market.routes.js';
import stockRoutes from './routes/stock.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import eventRoutes from './routes/event.routes.js';
import watchlistRoutes from './routes/watchlist.routes.js';
import replayRoutes from './routes/replay.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: config.marketDataMode }));

  app.use('/api/market', marketRoutes);
  app.use('/api/stocks', stockRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/watchlists', watchlistRoutes);
  app.use('/api/replay', replayRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
