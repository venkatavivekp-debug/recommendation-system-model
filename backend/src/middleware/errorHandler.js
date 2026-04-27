const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const env = require('../config/env');
const { getGenericFallbackData } = require('../utils/fallbackData');

function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
}

function safePath(value = '') {
  return String(value || '').split('?')[0].replace(/[\r\n\t]/g, ' ');
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || (err.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'INTERNAL_ERROR');
  const safeMessage =
    code === 'INVALID_JSON'
      ? 'Malformed JSON request body'
      : statusCode >= 500
        ? 'Request failed'
        : err.message || 'Request failed';

  const logMeta = {
    code,
    statusCode,
    path: safePath(req.originalUrl),
    method: req.method,
    requestId: req.requestId || null,
    timestamp: req.requestTimestamp || new Date().toISOString(),
  };

  if (statusCode >= 500) {
    logger.error(err.message, {
      ...logMeta,
      stack: err.stack,
    });
  } else {
    logger.warn(err.message, logMeta);
  }

  if (env.fallbackMode) {
    return res.status(200).json({
      success: true,
      message: 'Fallback response returned after runtime error',
      data: getGenericFallbackData(req.originalUrl),
      error: {
        code,
        message: safeMessage,
      },
      fallbackUsed: true,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: safeMessage,
      details: err.details || null,
    },
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
