const { randomUUID } = require('crypto');
const dataStore = require('../models/dataStore');
const { isMongoEnabled } = require('../config/database');
const userModel = require('../models/userModel');
const ResetTokenDocument = require('../models/mongo/resetTokenDocument');
const SearchHistoryDocument = require('../models/mongo/searchHistoryDocument');
const ActivityDocument = require('../models/mongo/activityDocument');
const { hashPassword } = require('../utils/password');
const { encrypt } = require('../utils/crypto');
const logger = require('../utils/logger');
const { createDefaultPreferences } = require('./userDefaultsService');

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
      favoriteRestaurants: ['Fitness Grill Midtown'],
      favoriteFoods: ['Grilled Salmon Bowl'],
      preferences: {
        ...createDefaultPreferences(),
        dailyCalorieGoal: 2100,
        preferredDiet: 'balanced',
        macroPreference: 'protein',
        preferredCuisine: 'mediterranean',
        fitnessGoal: 'maintain',
      },
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
      favoriteRestaurants: ['Green Pulse Kitchen', 'Fit Fuel Cafe'],
      favoriteFoods: ['Brownie Protein Bowl'],
      preferences: {
        ...createDefaultPreferences(),
        dailyCalorieGoal: 1850,
        preferredDiet: 'high-protein',
        macroPreference: 'protein',
        preferredCuisine: 'american',
        fitnessGoal: 'weight-loss',
      },
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
      favoriteRestaurants: ['Downtown Wrap Lab'],
      favoriteFoods: ['Brownie Protein Bowl', 'Avocado Toast'],
      preferences: {
        ...createDefaultPreferences(),
        dailyCalorieGoal: 2400,
        preferredDiet: 'balanced',
        macroPreference: 'carb',
        preferredCuisine: 'italian',
        fitnessGoal: 'muscle-gain',
      },
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function seedIfNeeded() {
  const existingUsers = await userModel.getAllUsers();
  if ((existingUsers || []).length > 0) {
    return false;
  }

  const users = await buildSeedUsers();
  await persistSeed(users);

  logger.info('Seed data created', {
    users: users.map((user) => ({ email: user.email, role: user.role })),
  });

  return true;
}

async function forceReseed() {
  const users = await buildSeedUsers();
  await persistSeed(users);

  logger.info('Seed data force-reset completed');
}

async function persistSeed(users) {
  if (isMongoEnabled()) {
    await userModel.replaceAllUsers(users);
    await ResetTokenDocument.deleteMany({});
    await SearchHistoryDocument.deleteMany({});
    await ActivityDocument.deleteMany({});
    return;
  }

  await dataStore.writeData({
    users,
    passwordResetTokens: [],
    searchHistory: [],
    activities: [],
  });
}

module.exports = {
  seedIfNeeded,
  forceReseed,
};
