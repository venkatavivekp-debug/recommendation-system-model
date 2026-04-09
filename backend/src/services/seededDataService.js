const env = require('../config/env');
const { seedIfNeeded } = require('./seedService');
const { ensureSyntheticDataset } = require('./syntheticDatasetService');

const SEEDED_ACCOUNTS = [
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
    email: 'fitness_user@recommendation-model.local',
    password: 'fitness123',
  },
  {
    role: 'user',
    email: 'weekend_spike_user@recommendation-model.local',
    password: 'weekend123',
  },
];

async function ensureSeededDataOnStartup() {
  const seededNow = await seedIfNeeded();
  const shouldForceSynthetic = Boolean(env.fallbackMode);
  let syntheticSummary = null;

  if (shouldForceSynthetic) {
    syntheticSummary = await ensureSyntheticDataset();
  }

  return {
    seededNow,
    syntheticSummary,
    fallbackMode: Boolean(env.fallbackMode),
  };
}

function getSeededAccounts() {
  return SEEDED_ACCOUNTS;
}

module.exports = {
  ensureSeededDataOnStartup,
  getSeededAccounts,
};
