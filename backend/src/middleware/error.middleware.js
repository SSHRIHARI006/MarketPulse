/** Wraps async route handlers so rejected promises reach the error handler. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const status = error.status || error.statusCode || 500;
  if (status >= 500) console.error('[api]', error);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : error.message,
    ...(status >= 500 && process.env.NODE_ENV !== 'production' ? { detail: error.message } : {})
  });
}
