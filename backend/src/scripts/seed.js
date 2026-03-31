const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { forceReseed } = require('../services/seedService');

connectDatabase()
  .then(() => forceReseed())
  .then(() => {
    console.log('Seed reset complete.');
    if (mongoose.connection.readyState === 1) {
      return mongoose.disconnect();
    }

    return null;
  })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed reset failed:', error.message);
    process.exit(1);
  });
