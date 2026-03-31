const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');
const { seedIfNeeded } = require('./services/seedService');

async function start() {
  await seedIfNeeded();

  const server = app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`, {
      nodeEnv: env.nodeEnv,
    });
  });

  server.on('error', (error) => {
    logger.error('Server failed to bind port', {
      message: error.message,
      code: error.code,
      port: env.port,
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
