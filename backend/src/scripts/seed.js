const { forceReseed } = require('../services/seedService');

forceReseed()
  .then(() => {
    console.log('Seed reset complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed reset failed:', error.message);
    process.exit(1);
  });
