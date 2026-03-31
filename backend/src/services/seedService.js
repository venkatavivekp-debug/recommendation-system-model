const { randomUUID } = require('crypto');
const dataStore = require('../models/dataStore');
const { hashPassword } = require('../utils/password');
const { encrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

function seedCard(cardNumber, expiry, cardHolderName) {
  return {
    id: randomUUID(),
    cardNumberEncrypted: encrypt(cardNumber),
    expiry,
    cardHolderName,
    createdAt: new Date().toISOString(),
  };
}

async function buildSeedUsers() {
  const now = new Date().toISOString();

  const adminPassword = await hashPassword('Admin123!');
  const demoPassword = await hashPassword('Demo123!');

  return [
    {
      id: randomUUID(),
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@foodfitness.local',
      passwordHash: adminPassword,
      promotionOptIn: false,
      status: 'ACTIVE',
      role: 'ADMIN',
      address: '100 Admin Plaza, New York, NY',
      paymentCards: [],
      favorites: [],
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya.verified@foodfitness.local',
      passwordHash: demoPassword,
      promotionOptIn: true,
      status: 'ACTIVE',
      role: 'USER',
      address: '225 Madison Ave, New York, NY',
      paymentCards: [
        seedCard('4111111111111111', '10/29', 'Priya Shah'),
        seedCard('5555555555554444', '07/28', 'Priya Shah'),
        seedCard('4000056655665556', '01/30', 'Priya Shah'),
      ],
      favorites: [],
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      firstName: 'Marcus',
      lastName: 'Lee',
      email: 'marcus.favorite@foodfitness.local',
      passwordHash: demoPassword,
      promotionOptIn: false,
      status: 'ACTIVE',
      role: 'USER',
      address: '90 Broadway, New York, NY',
      paymentCards: [seedCard('4242424242424242', '11/27', 'Marcus Lee')],
      favorites: ['Brownie Protein Bowl'],
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function seedIfNeeded() {
  const data = await dataStore.readData();
  if ((data.users || []).length > 0) {
    return false;
  }

  const users = await buildSeedUsers();

  await dataStore.writeData({
    users,
    passwordResetTokens: [],
    searchHistory: [],
  });

  logger.info('Seed data created', {
    users: users.map((user) => ({ email: user.email, role: user.role })),
  });

  return true;
}

async function forceReseed() {
  const users = await buildSeedUsers();

  await dataStore.writeData({
    users,
    passwordResetTokens: [],
    searchHistory: [],
  });

  logger.info('Seed data force-reset completed');
}

module.exports = {
  seedIfNeeded,
  forceReseed,
};
