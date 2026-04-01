const { randomUUID } = require('crypto');
const dataStore = require('../models/dataStore');
const { isMongoEnabled } = require('../config/database');
const userModel = require('../models/userModel');
const ResetTokenDocument = require('../models/mongo/resetTokenDocument');
const SearchHistoryDocument = require('../models/mongo/searchHistoryDocument');
const ActivityDocument = require('../models/mongo/activityDocument');
const MealDocument = require('../models/mongo/mealDocument');
const CommunityRecipeDocument = require('../models/mongo/communityRecipeDocument');
const RecipeReviewDocument = require('../models/mongo/recipeReviewDocument');
const CalendarPlanDocument = require('../models/mongo/calendarPlanDocument');
const ExerciseSessionDocument = require('../models/mongo/exerciseSessionDocument');
const WearableConnectionDocument = require('../models/mongo/wearableConnectionDocument');
const FriendRequestDocument = require('../models/mongo/friendRequestDocument');
const FriendDocument = require('../models/mongo/friendDocument');
const DietShareDocument = require('../models/mongo/dietShareDocument');
const { hashPassword } = require('../utils/password');
const logger = require('../utils/logger');
const { createDefaultPreferences } = require('./userDefaultsService');

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
      role: 'admin',
      address: '100 Admin Plaza, New York, NY',
      paymentCards: [],
      favorites: [],
      favoriteRestaurants: ['Fitness Grill Midtown'],
      favoriteFoods: ['Grilled Salmon Bowl'],
      allergies: ['shellfish'],
      savedRecipeIds: [],
      preferences: {
        ...createDefaultPreferences(),
        dailyCalorieGoal: 2100,
        proteinGoal: 150,
        carbsGoal: 210,
        fatsGoal: 70,
        fiberGoal: 35,
        preferredDiet: 'non-veg',
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
      role: 'user',
      address: '225 Madison Ave, New York, NY',
      paymentCards: [],
      favorites: [],
      favoriteRestaurants: ['Green Pulse Kitchen', 'Fit Fuel Cafe'],
      favoriteFoods: ['Brownie Protein Bowl'],
      allergies: ['dairy', 'peanuts'],
      savedRecipeIds: [],
      preferences: {
        ...createDefaultPreferences(),
        dailyCalorieGoal: 1850,
        proteinGoal: 145,
        carbsGoal: 170,
        fatsGoal: 55,
        fiberGoal: 30,
        preferredDiet: 'non-veg',
        macroPreference: 'protein',
        preferredCuisine: 'american',
        fitnessGoal: 'lose-weight',
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
      role: 'user',
      address: '90 Broadway, New York, NY',
      paymentCards: [],
      favorites: ['Brownie Protein Bowl'],
      favoriteRestaurants: ['Downtown Wrap Lab'],
      favoriteFoods: ['Brownie Protein Bowl', 'Avocado Toast'],
      allergies: ['soy'],
      savedRecipeIds: [],
      preferences: {
        ...createDefaultPreferences(),
        dailyCalorieGoal: 2400,
        proteinGoal: 165,
        carbsGoal: 280,
        fatsGoal: 78,
        fiberGoal: 33,
        preferredDiet: 'veg',
        macroPreference: 'carb',
        preferredCuisine: 'italian',
        fitnessGoal: 'gain-muscle',
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
    await MealDocument.deleteMany({});
    await CommunityRecipeDocument.deleteMany({});
    await RecipeReviewDocument.deleteMany({});
    await CalendarPlanDocument.deleteMany({});
    await ExerciseSessionDocument.deleteMany({});
    await WearableConnectionDocument.deleteMany({});
    await FriendRequestDocument.deleteMany({});
    await FriendDocument.deleteMany({});
    await DietShareDocument.deleteMany({});
    return;
  }

  await dataStore.writeData({
    users,
    passwordResetTokens: [],
    searchHistory: [],
    activities: [],
    meals: [],
    communityRecipes: [],
    recipeReviews: [],
    calendarPlans: [],
    exerciseSessions: [],
    wearableConnections: [],
    friendRequests: [],
    friends: [],
    dietShares: [],
    evaluationMetrics: [],
    restaurants: [],
  });
}

module.exports = {
  seedIfNeeded,
  forceReseed,
};
