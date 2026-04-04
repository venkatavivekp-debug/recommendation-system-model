const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const authRoutes = require('./routes/authRoutes');
const requestLogger = require('./middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

const configuredOrigins = new Set(
  String(process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isLocalDevOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    return isLocalHost && isHttp;
  } catch (_error) {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.has(origin) || isLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.use('/api/auth', authRoutes);
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
