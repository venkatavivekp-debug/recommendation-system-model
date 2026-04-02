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
const MessageDocument = require('../models/mongo/messageDocument');
const RecommendationInteractionDocument = require('../models/mongo/recommendationInteractionDocument');
const { hashPassword } = require('../utils/password');
const logger = require('../utils/logger');
const { createDefaultPreferences } = require('./userDefaultsService');

async function buildSeedUsers() {
  const now = new Date().toISOString();

  const adminPassword = await hashPassword('admin123');
  const demoPassword = await hashPassword('user123');
  const samplePassword = await hashPassword('Demo123!');

  return [
    {
      id: randomUUID(),
      firstName: 'Admin',
      lastName: 'BFIT',
      email: 'admin@bfit.com',
      passwordHash: adminPassword,
      promotionOptIn: false,
      status: 'ACTIVE',
      role: 'admin',
      address: '100 College Ave, Athens, GA',
      paymentCards: [],
      favorites: [],
      favoriteRestaurants: ['The Place'],
      favoriteFoods: ['Grilled Chicken Bowl'],
      allergies: [],
      savedRecipeIds: [],
      preferences: {
        ...createDefaultPreferences(),
        dailyCalorieGoal: 2200,
        proteinGoal: 155,
        carbsGoal: 220,
        fatsGoal: 68,
        fiberGoal: 34,
        preferredDiet: 'non-veg',
        macroPreference: 'protein',
        preferredCuisine: 'american',
        fitnessGoal: 'maintain',
      },
      userPreferenceWeights: {},
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      firstName: 'Demo',
      lastName: 'User',
      email: 'user@bfit.com',
      passwordHash: demoPassword,
      promotionOptIn: true,
      status: 'ACTIVE',
      role: 'user',
      address: '490 S Milledge Ave, Athens, GA',
      paymentCards: [],
      favorites: [],
      favoriteRestaurants: ['Mamma\'s Boy', 'Taqueria Tsunami'],
      favoriteFoods: ['Chicken Rice Bowl', 'Greek Yogurt Parfait'],
      allergies: ['peanuts'],
      savedRecipeIds: [],
      preferences: {
        ...createDefaultPreferences(),
        dailyCalorieGoal: 2000,
        proteinGoal: 145,
        carbsGoal: 190,
        fatsGoal: 58,
        fiberGoal: 30,
        preferredDiet: 'non-veg',
        macroPreference: 'protein',
        preferredCuisine: 'mediterranean',
        fitnessGoal: 'lose-weight',
      },
      userPreferenceWeights: {},
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
      passwordHash: samplePassword,
      promotionOptIn: false,
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
      userPreferenceWeights: {},
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
      passwordHash: samplePassword,
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
      userPreferenceWeights: {},
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
    await ensureSystemUsers();
    return false;
  }

  const users = await buildSeedUsers();
  await persistSeed(users);

  logger.info('Seed data created', {
    users: users.map((user) => ({ email: user.email, role: user.role })),
  });

  await ensureDemoHistoryByEmail('user@bfit.com');
  return true;
}

async function forceReseed() {
  const users = await buildSeedUsers();
  await persistSeed(users);

  logger.info('Seed data force-reset completed');
  await ensureDemoHistoryByEmail('user@bfit.com');
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
    await MessageDocument.deleteMany({});
    await RecommendationInteractionDocument.deleteMany({});
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
    chatMessages: [],
    recommendationInteractions: [],
    evaluationMetrics: [],
    restaurants: [],
  });
}

async function upsertSystemUser({ email, password, firstName, lastName, role, preferences, allergies = [] }) {
  const existing = await userModel.findUserByEmail(email);
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);

  if (existing) {
    await userModel.updateUserById(existing.id, {
      firstName,
      lastName,
      role,
      status: 'ACTIVE',
      passwordHash,
      preferences: {
        ...(existing.preferences || {}),
        ...preferences,
      },
      allergies,
      updatedAt: now,
    });
    return existing.id;
  }

  const created = await userModel.createUser({
    id: randomUUID(),
    firstName,
    lastName,
    email,
    passwordHash,
    promotionOptIn: true,
    status: 'ACTIVE',
    role,
    address: 'Athens, GA',
    paymentCards: [],
    favorites: [],
    favoriteRestaurants: [],
    favoriteFoods: [],
    allergies,
    savedRecipeIds: [],
    preferences: {
      ...createDefaultPreferences(),
      ...preferences,
    },
    userPreferenceWeights: {},
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return created.id;
}

async function ensureDemoHistoryByEmail(email) {
  const user = await userModel.findUserByEmail(email);
  if (!user) {
    return;
  }

  const userId = user.id;
  if (isMongoEnabled()) {
    const hasMeals = await MealDocument.exists({ userId });
    if (!hasMeals) {
      const now = new Date();
      const breakfastAt = new Date(now);
      breakfastAt.setHours(8, 20, 0, 0);
      const lunchAt = new Date(now);
      lunchAt.setHours(13, 10, 0, 0);

      await MealDocument.insertMany([
        {
          id: randomUUID(),
          userId,
          foodName: 'Greek yogurt parfait',
          brand: null,
          calories: 320,
          protein: 24,
          carbs: 34,
          fats: 8,
          fiber: 6,
          source: 'recipe',
          sourceType: 'recipe',
          mealType: 'breakfast',
          portion: 1,
          ingredients: ['greek yogurt', 'berries', 'oats'],
          allergyWarnings: [],
          createdAt: breakfastAt.toISOString(),
        },
        {
          id: randomUUID(),
          userId,
          foodName: 'Grilled chicken bowl',
          brand: null,
          calories: 560,
          protein: 46,
          carbs: 52,
          fats: 16,
          fiber: 7,
          source: 'restaurant',
          sourceType: 'restaurant',
          mealType: 'lunch',
          portion: 1,
          ingredients: ['chicken', 'rice', 'vegetables'],
          allergyWarnings: [],
          createdAt: lunchAt.toISOString(),
        },
      ]);
    }

    const hasExercise = await ExerciseSessionDocument.exists({ userId });
    if (!hasExercise) {
      const sessionAt = new Date();
      sessionAt.setHours(18, 0, 0, 0);
      await ExerciseSessionDocument.create({
        id: randomUUID(),
        userId,
        workoutType: 'walking',
        durationMinutes: 35,
        bodyWeightKg: 70,
        intensity: 'moderate',
        caloriesBurned: 170,
        steps: 4300,
        distanceMiles: 2.1,
        wearableSource: null,
        notes: 'Demo seed walk session',
        exercises: [
          {
            name: 'walking',
            sets: 0,
            reps: 0,
            weightKg: 0,
            durationMinutes: 35,
            intensity: 'moderate',
            metValue: 3.6,
            caloriesBurned: 170,
          },
        ],
        createdAt: sessionAt.toISOString(),
        updatedAt: sessionAt.toISOString(),
      });
    }
    return;
  }

  await dataStore.updateData((data) => {
    data.meals = data.meals || [];
    data.exerciseSessions = data.exerciseSessions || [];

    const hasMeals = data.meals.some((row) => row.userId === userId);
    const hasExercise = data.exerciseSessions.some((row) => row.userId === userId);

    if (!hasMeals) {
      const now = new Date();
      const breakfastAt = new Date(now);
      breakfastAt.setHours(8, 20, 0, 0);
      const lunchAt = new Date(now);
      lunchAt.setHours(13, 10, 0, 0);

      data.meals.push(
        {
          id: randomUUID(),
          userId,
          foodName: 'Greek yogurt parfait',
          brand: null,
          calories: 320,
          protein: 24,
          carbs: 34,
          fats: 8,
          fiber: 6,
          source: 'recipe',
          sourceType: 'recipe',
          mealType: 'breakfast',
          portion: 1,
          ingredients: ['greek yogurt', 'berries', 'oats'],
          allergyWarnings: [],
          createdAt: breakfastAt.toISOString(),
        },
        {
          id: randomUUID(),
          userId,
          foodName: 'Grilled chicken bowl',
          brand: null,
          calories: 560,
          protein: 46,
          carbs: 52,
          fats: 16,
          fiber: 7,
          source: 'restaurant',
          sourceType: 'restaurant',
          mealType: 'lunch',
          portion: 1,
          ingredients: ['chicken', 'rice', 'vegetables'],
          allergyWarnings: [],
          createdAt: lunchAt.toISOString(),
        }
      );
    }

    if (!hasExercise) {
      const sessionAt = new Date();
      sessionAt.setHours(18, 0, 0, 0);
      data.exerciseSessions.push({
        id: randomUUID(),
        userId,
        workoutType: 'walking',
        durationMinutes: 35,
        bodyWeightKg: 70,
        intensity: 'moderate',
        caloriesBurned: 170,
        steps: 4300,
        distanceMiles: 2.1,
        wearableSource: null,
        notes: 'Demo seed walk session',
        exercises: [
          {
            name: 'walking',
            sets: 0,
            reps: 0,
            weightKg: 0,
            durationMinutes: 35,
            intensity: 'moderate',
            metValue: 3.6,
            caloriesBurned: 170,
          },
        ],
        createdAt: sessionAt.toISOString(),
        updatedAt: sessionAt.toISOString(),
      });
    }
    return data;
  });
}

async function ensureSystemUsers() {
  const adminId = await upsertSystemUser({
    email: 'admin@bfit.com',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'BFIT',
    role: 'admin',
    preferences: {
      dailyCalorieGoal: 2200,
      proteinGoal: 155,
      carbsGoal: 220,
      fatsGoal: 68,
      fiberGoal: 34,
      preferredDiet: 'non-veg',
      macroPreference: 'protein',
      preferredCuisine: 'american',
      fitnessGoal: 'maintain',
    },
  });

  const demoId = await upsertSystemUser({
    email: 'user@bfit.com',
    password: 'user123',
    firstName: 'Demo',
    lastName: 'User',
    role: 'user',
    allergies: ['peanuts'],
    preferences: {
      dailyCalorieGoal: 2000,
      proteinGoal: 145,
      carbsGoal: 190,
      fatsGoal: 58,
      fiberGoal: 30,
      preferredDiet: 'non-veg',
      macroPreference: 'protein',
      preferredCuisine: 'mediterranean',
      fitnessGoal: 'lose-weight',
    },
  });

  await ensureDemoHistoryByEmail('user@bfit.com');

  logger.info('System users ensured', {
    adminId,
    demoUserId: demoId,
  });
}

module.exports = {
  seedIfNeeded,
  forceReseed,
};
