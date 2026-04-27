const logger = require('../utils/logger');

function createRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safePath(value = '') {
  return String(value || '').split('?')[0].replace(/[\r\n\t]/g, ' ');
}

function requestLogger(req, res, next) {
  const start = Date.now();
  req.requestId = createRequestId();
  req.requestTimestamp = new Date().toISOString();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const path = safePath(req.originalUrl);
    logger.info(`[${req.requestId}] ${req.method} ${path} ${res.statusCode} ${durationMs}ms`, {
      requestId: req.requestId,
      timestamp: req.requestTimestamp,
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}

module.exports = requestLogger;
