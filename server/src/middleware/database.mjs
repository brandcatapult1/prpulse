/** API routes that work without a database connection. */
const OPEN_API_PATHS = new Set(['/health', '/health/ready', '/auth/status', '/auth/me']);

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function requireDatabase(req, res, next) {
  if (OPEN_API_PATHS.has(req.path)) return next();
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error: 'Database not configured. Add DATABASE_URL in Render environment settings.',
    });
  }
  next();
}
