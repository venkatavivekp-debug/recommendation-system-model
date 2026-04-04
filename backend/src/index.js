const env = require('./config/env');
const { connectDatabase } = require('./config/database');
const app = require('./app');
const logger = require('./utils/logger');
const { seedIfNeeded } = require('./services/seedService');

const MAX_PORT_FALLBACK_TRIES = 5;

function listenWithFallback(initialPort, maxRetries = MAX_PORT_FALLBACK_TRIES) {
  return new Promise((resolve, reject) => {
    const tryPort = (port, attempt) => {
      const server = app.listen(port);

      server.once('listening', () => {
        resolve({ server, port });
      });

      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' && attempt < maxRetries) {
          const nextPort = port + 1;
          logger.warn(`Port ${port} busy, trying ${nextPort}`);
          setImmediate(() => tryPort(nextPort, attempt + 1));
          return;
        }

        reject(error);
      });
    };

    tryPort(initialPort, 0);
  });
}

async function start() {
  await connectDatabase();
  await seedIfNeeded();

  const { server, port } = await listenWithFallback(env.port);
  process.env.PORT = String(port);

  logger.info(`Server running on port ${port}`, {
    nodeEnv: env.nodeEnv,
  });

  const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}. Shutting down server gracefully.`);
    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(0);
    }, 5000).unref();
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  server.on('error', (error) => {
    logger.error('Server failed to bind port', {
      message: error.message,
      code: error.code,
      port,
      nodeEnv: env.nodeEnv,
    });
    process.exit(1);
  });
}

start().catch((error) => {
  logger.error('Failed to start server', {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
