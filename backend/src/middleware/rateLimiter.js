const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 100;

const buckets = new Map();

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function cleanupExpired(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function rateLimiter(options = {}) {
  const windowMs = toPositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, options.windowMs || DEFAULT_WINDOW_MS);
  const maxRequests = toPositiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, options.maxRequests || DEFAULT_MAX_REQUESTS);

  return function limitRequests(req, res, next) {
    if (req.method === 'OPTIONS') {
      return next();
    }

    const now = Date.now();
    cleanupExpired(now);

    const key = clientKey(req);
    const current = buckets.get(key);
    const bucket =
      current && current.resetAt > now
        ? current
        : {
            count: 0,
            resetAt: now + windowMs,
          };

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          details: null,
        },
      });
    }

    return next();
  };
}

module.exports = rateLimiter;
