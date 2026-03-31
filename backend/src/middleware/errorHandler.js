const AppError = require('../utils/appError');
const logger = require('../utils/logger');

function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  logger.error(err.message, {
    code,
    statusCode,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.message || 'Unexpected server error',
      details: err.details || null,
    },
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
