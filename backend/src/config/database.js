const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

let dbMode = 'file';

async function connectDatabase() {
  if (!env.mongodbUri) {
    logger.warn('MONGODB_URI is not configured. Using file datastore fallback.');
    return dbMode;
  }

  try {
    await mongoose.connect(env.mongodbUri, {
      dbName: env.mongodbDbName,
      autoIndex: true,
    });

    dbMode = 'mongo';
    logger.info('Connected to MongoDB persistence layer', {
      dbName: env.mongodbDbName,
    });
  } catch (error) {
    dbMode = 'file';
    logger.warn('MongoDB connection failed. Falling back to file datastore.', {
      message: error.message,
    });
  }

  return dbMode;
}

function isMongoEnabled() {
  return dbMode === 'mongo' && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDatabase,
  isMongoEnabled,
};
