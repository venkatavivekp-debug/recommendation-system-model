const env = require('../config/env');
const { seedIfNeeded } = require('./seedService');
const { ensureSyntheticDataset } = require('./syntheticDatasetService');

const DEMO_ACCOUNTS = [
  {
    role: 'admin',
    email: 'pangulurivenkatavivek@gmail.com',
    password: 'App@2026',
  },
  {
    role: 'admin',
    email: 'admin@bfit.com',
    password: 'admin123',
  },
  {
    role: 'user',
    email: 'user@bfit.com',
    password: 'user123',
  },
  {
    role: 'user',
    email: 'fitness_user@contextfit.com',
    password: 'fitness123',
  },
  {
    role: 'user',
    email: 'weekend_spike_user@contextfit.com',
    password: 'weekend123',
  },
];

async function ensureSeededDataOnStartup() {
  const seededNow = await seedIfNeeded();
  const shouldForceSynthetic = Boolean(env.demoMode);
  let syntheticSummary = null;

  if (shouldForceSynthetic) {
    syntheticSummary = await ensureSyntheticDataset();
  }

  return {
    seededNow,
    syntheticSummary,
    demoMode: Boolean(env.demoMode),
  };
}

function getDemoAccounts() {
  return DEMO_ACCOUNTS;
}

module.exports = {
  ensureSeededDataOnStartup,
  getDemoAccounts,
};
