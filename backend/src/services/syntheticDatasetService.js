const { randomUUID, createHash } = require('crypto');
const syntheticProfiles = require('../data/syntheticUserProfiles.json');
const { isMongoEnabled } = require('../config/database');
const dataStore = require('../models/dataStore');
const userModel = require('../models/userModel');
const MealDocument = require('../models/mongo/mealDocument');
const ExerciseSessionDocument = require('../models/mongo/exerciseSessionDocument');
const RecommendationInteractionDocument = require('../models/mongo/recommendationInteractionDocument');
const SearchHistoryDocument = require('../models/mongo/searchHistoryDocument');
const UserContentInteractionDocument = require('../models/mongo/userContentInteractionDocument');
const WearableConnectionDocument = require('../models/mongo/wearableConnectionDocument');
const EvaluationMetricDocument = require('../models/mongo/evaluationMetricDocument');
const { hashPassword, comparePassword } = require('../utils/password');
const logger = require('../utils/logger');
const {
  createDefaultPreferences,
  createDefaultContentPreferences,
} = require('./userDefaultsService');

const SYNTHETIC_DAYS = 30;
const ATHENS_LAT = 33.9519;
const ATHENS_LNG = -83.3576;

const BREAKFAST_OPTIONS = [
  { name: 'Greek Yogurt Berry Bowl', ingredients: ['greek yogurt', 'berries', 'oats'] },
  { name: 'Protein Oatmeal', ingredients: ['oats', 'milk', 'banana'] },
  { name: 'Egg Veggie Scramble', ingredients: ['eggs', 'spinach', 'tomato'] },
];

const LUNCH_OPTIONS = [
  { name: 'Grilled Chicken Bowl', ingredients: ['chicken', 'rice', 'broccoli'] },
  { name: 'Tofu Rice Bowl', ingredients: ['tofu', 'rice', 'vegetables'] },
  { name: 'Turkey Wrap', ingredients: ['whole wheat wrap', 'turkey', 'lettuce'] },
];

const DINNER_OPTIONS = [
  { name: 'Salmon Quinoa Plate', ingredients: ['salmon', 'quinoa', 'greens'] },
  { name: 'Chicken Burrito Bowl', ingredients: ['chicken', 'beans', 'rice'] },
  { name: 'Veggie Pasta Bowl', ingredients: ['whole wheat pasta', 'tomato sauce', 'vegetables'] },
];

function stableId(prefix, ...parts) {
  const value = parts.map((item) => String(item)).join('|');
  return `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 20)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 2) {
  return Number(Number(value || 0).toFixed(decimals));
}

function hashToInt(seed) {
  const digest = createHash('sha256').update(String(seed)).digest('hex').slice(0, 8);
  return parseInt(digest, 16);
}

function createSeededRandom(seedText) {
  let seed = hashToInt(seedText) || 123456789;
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalRandom(random, mean, stdDev) {
  const u1 = Math.max(random(), 1e-8);
  const u2 = Math.max(random(), 1e-8);
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function dayOffsetFromToday(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ref = new Date(date);
  ref.setHours(0, 0, 0, 0);
  const diff = today.getTime() - ref.getTime();
  return Math.round(diff / 86400000);
}

function anomalySetForDay(anomalyPlan = [], dayOffset = 0) {
  return new Set(
    (anomalyPlan || [])
      .filter((item) => Number(item.dayOffset) === dayOffset)
      .map((item) => String(item.type || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

function pickByIndex(options, random) {
  if (!options.length) {
    return { name: 'Balanced Meal', ingredients: ['protein', 'carbs', 'vegetables'] };
  }
  const index = Math.floor(random() * options.length);
  return options[index];
}

function determineMealContext(behavior = {}, random, anomalies = new Set()) {
  const eatInRate = clamp(toNumber(behavior.eatInRate, 0.35), 0, 1);
  const eatOutRate = clamp(toNumber(behavior.eatOutRate, 0.35), 0, 1);
  const deliveryRate = clamp(toNumber(behavior.deliveryRate, 0.3), 0, 1);

  let roll = random();
  if (anomalies.has('behavior_shift')) {
    roll = Math.min(0.99, roll + 0.2);
  }

  if (roll <= eatInRate) {
    return { mealContext: 'eat_in', mode: 'eat_in' };
  }

  if (roll <= eatInRate + eatOutRate) {
    if (random() <= deliveryRate) {
      return { mealContext: 'eat_out', mode: 'delivery' };
    }
    return { mealContext: 'walking', mode: 'pickup' };
  }

  return random() < 0.5
    ? { mealContext: 'eat_out', mode: 'delivery' }
    : { mealContext: 'walking', mode: 'pickup' };
}

function buildMacroRatios(behavior = {}, anomalies = new Set()) {
  let proteinRatio = toNumber(behavior.proteinRatio, 0.27);
  let carbRatio = toNumber(behavior.carbRatio, 0.48);
  let fatRatio = toNumber(behavior.fatRatio, 0.25);

  if (anomalies.has('macro_imbalance')) {
    proteinRatio = 0.15;
    carbRatio = 0.6;
    fatRatio = 0.25;
  }

  const ratioSum = Math.max(0.1, proteinRatio + carbRatio + fatRatio);
  return {
    proteinRatio: proteinRatio / ratioSum,
    carbRatio: carbRatio / ratioSum,
    fatRatio: fatRatio / ratioSum,
  };
}

function computeDailyTargets(profile, date, random, anomalies = new Set()) {
  const behavior = profile.behavior || {};
  const baseCalories = toNumber(behavior.baseCalories, 2200);
  const calorieVariance = Math.max(20, toNumber(behavior.calorieVariance, 120));
  const weekendBonus = isWeekend(date) ? toNumber(behavior.weekendBonusCalories, 0) : 0;

  let calories = Math.max(1200, normalRandom(random, baseCalories + weekendBonus, calorieVariance));
  if (anomalies.has('calorie_spike')) {
    calories = Math.max(calories + 900, 3200 + Math.floor(random() * 300));
  }
  if (anomalies.has('low_activity_high_intake')) {
    calories = Math.max(calories, 3000 + Math.floor(random() * 220));
  }

  const ratios = buildMacroRatios(behavior, anomalies);
  const protein = Math.max(35, (calories * ratios.proteinRatio) / 4);
  const carbs = Math.max(70, (calories * ratios.carbRatio) / 4);
  const fats = Math.max(20, (calories * ratios.fatRatio) / 9);
  const fiber = Math.max(10, toNumber(behavior.fiberBase, 26) + normalRandom(random, 0, 3));

  return {
    calories: round(calories, 0),
    protein: round(protein, 1),
    carbs: round(carbs, 1),
    fats: round(fats, 1),
    fiber: round(fiber, 1),
  };
}

function computeDailyActivity(profile, date, random, anomalies = new Set()) {
  const behavior = profile.behavior || {};
  const stepMean = toNumber(behavior.stepMean, 7000);
  const stepStd = Math.max(300, toNumber(behavior.stepStd, 1500));
  const workoutProbability = clamp(toNumber(behavior.workoutProbability, 0.3), 0, 1);

  let steps = Math.max(500, normalRandom(random, stepMean, stepStd));
  if (anomalies.has('low_activity_high_intake')) {
    steps = Math.min(1800, steps);
  }
  if (anomalies.has('behavior_shift')) {
    steps *= 0.82;
  }
  if (isWeekend(date)) {
    steps *= 0.94;
  }

  const hasWorkout = !anomalies.has('low_activity_high_intake') && random() < workoutProbability;
  const workoutType = hasWorkout ? (random() < 0.45 ? 'strength' : 'running') : 'walking';
  const durationMinutes = hasWorkout
    ? round(32 + random() * 26, 0)
    : round(Math.max(18, steps / 115), 0);
  const workoutCalories = hasWorkout ? (workoutType === 'running' ? 280 : 210) : 0;
  const caloriesBurned = round(steps * 0.042 + workoutCalories, 1);
  const distanceMiles = round(steps / 2250, 2);
  const activityLevelNormalized = round(
    clamp((Math.min(steps / 9000, 1) * 0.6) + (Math.min(caloriesBurned / 650, 1) * 0.4), 0, 1),
    4
  );

  return {
    steps: Math.round(steps),
    caloriesBurned,
    workoutType,
    hasWorkout,
    durationMinutes,
    distanceMiles,
    activityLevelNormalized,
  };
}

function buildMealEntries(userId, date, dayNutrition, random, profile, anomalies = new Set()) {
  const mealPlan = [
    { key: 'breakfast', ratio: 0.28, hour: 8, minute: 10, options: BREAKFAST_OPTIONS },
    { key: 'lunch', ratio: 0.34, hour: 13, minute: 5, options: LUNCH_OPTIONS },
    { key: 'dinner', ratio: 0.38, hour: 19, minute: 15, options: DINNER_OPTIONS },
  ];

  return mealPlan.map((mealConfig, index) => {
    const dateTime = new Date(date);
    dateTime.setHours(mealConfig.hour, mealConfig.minute, 0, 0);
    const food = pickByIndex(mealConfig.options, random);

    const ratioJitter = 1 + normalRandom(random, 0, 0.06);
    const splitRatio = clamp(mealConfig.ratio * ratioJitter, 0.2, 0.5);
    const mealCalories = dayNutrition.calories * splitRatio;
    const mealProtein = dayNutrition.protein * splitRatio;
    const mealCarbs = dayNutrition.carbs * splitRatio;
    const mealFats = dayNutrition.fats * splitRatio;
    const mealFiber = dayNutrition.fiber * splitRatio;
    const context = determineMealContext(profile.behavior, random, anomalies);
    const sourceType =
      context.mealContext === 'eat_in'
        ? 'recipe'
        : context.mealContext === 'walking'
          ? 'restaurant'
          : 'restaurant';

    return {
      id: stableId(
        'meal',
        userId,
        dateTime.toISOString().slice(0, 10),
        mealConfig.key,
        profile.key
      ),
      userId,
      foodName: food.name,
      brand: '',
      calories: round(mealCalories, 0),
      protein: round(mealProtein, 1),
      carbs: round(mealCarbs, 1),
      fats: round(mealFats, 1),
      fiber: round(mealFiber, 1),
      source: sourceType,
      sourceType,
      mealType: mealConfig.key,
      portion: 1,
      ingredients: food.ingredients,
      allergyWarnings: [],
      createdAt: dateTime.toISOString(),
      _context: context,
      _mealIndex: index,
    };
  });
}

function computeFeatureBundle({
  candidateRank,
  acceptanceRate,
  context,
  activity,
  random,
  historyScore,
  anomalies,
}) {
  const contextFitBase =
    context.mealContext === 'eat_in'
      ? 0.9
      : context.mode === 'delivery'
        ? 0.82
        : 0.74;
  const proteinMatch = clamp(0.8 - candidateRank * 0.13 + normalRandom(random, 0, 0.05), 0.05, 0.98);
  const calorieFit = clamp(0.85 - candidateRank * 0.12 + normalRandom(random, 0, 0.05), 0.05, 0.98);
  const preferenceMatch = clamp(0.78 - candidateRank * 0.09 + normalRandom(random, 0, 0.06), 0.05, 0.98);
  const distanceScore = clamp(
    context.mealContext === 'eat_in'
      ? 0.93
      : context.mode === 'delivery'
        ? 0.72 + normalRandom(random, 0, 0.06)
        : 0.66 + normalRandom(random, 0, 0.08),
    0.05,
    0.98
  );
  const allergySafe = 1;
  const timeOfDay =
    context.timeOfDay === 'morning' ? 0.2 : context.timeOfDay === 'lunch' ? 0.45 : 0.78;
  const dayOfWeek = context.dayOfWeek;
  const mealContextFit = clamp(contextFitBase - candidateRank * 0.06, 0.05, 0.99);
  const recentBehaviorTrend = clamp(0.74 - (anomalies.has('behavior_shift') ? 0.22 : 0) + normalRandom(random, 0, 0.05), 0.05, 0.98);
  const macroGapFit = clamp(0.82 - candidateRank * 0.11 + normalRandom(random, 0, 0.05), 0.05, 0.98);
  const activityLevel = clamp(activity.activityLevelNormalized, 0, 1);
  const interactionAffinity = clamp(historyScore + normalRandom(random, 0, 0.05), 0.05, 0.99);

  const score =
    proteinMatch * 0.15 +
    calorieFit * 0.15 +
    preferenceMatch * 0.1 +
    distanceScore * 0.09 +
    mealContextFit * 0.12 +
    macroGapFit * 0.12 +
    recentBehaviorTrend * 0.08 +
    interactionAffinity * 0.08 +
    activityLevel * 0.06 +
    allergySafe * 0.05;

  const probability = clamp(score + (acceptanceRate - 0.5) * 0.18, 0.05, 0.96);

  return {
    score,
    probability,
    features: {
      proteinMatch: round(proteinMatch, 4),
      calorieFit: round(calorieFit, 4),
      preferenceMatch: round(preferenceMatch, 4),
      distanceScore: round(distanceScore, 4),
      historySimilarity: round(interactionAffinity, 4),
      allergySafe: round(allergySafe, 4),
      timeOfDay: round(timeOfDay, 4),
      dayOfWeek: round(dayOfWeek, 4),
      mealContextFit: round(mealContextFit, 4),
      recentBehaviorTrend: round(recentBehaviorTrend, 4),
      macroGapFit: round(macroGapFit, 4),
      activityLevel: round(activityLevel, 4),
      interactionAffinity: round(interactionAffinity, 4),
    },
  };
}

function buildRecommendationInteractions({
  userId,
  meal,
  dayNutrition,
  activity,
  profile,
  random,
  dayOffset,
  foodHistory,
}) {
  const behavior = profile.behavior || {};
  let acceptanceRate = clamp(toNumber(behavior.acceptanceRate, 0.58), 0.05, 0.98);
  if (dayOffset <= 6 && (profile.key === 'irregular_user' || profile.key === 'sedentary_user')) {
    acceptanceRate = clamp(acceptanceRate - 0.22, 0.05, 0.98);
  }
  if (dayOffset <= 3 && profile.key === 'fitness_user') {
    acceptanceRate = clamp(acceptanceRate + 0.08, 0.05, 0.98);
  }

  const candidateNames = [
    meal.foodName,
    meal.mealType === 'breakfast' ? 'Protein Smoothie Bowl' : 'Turkey Power Wrap',
    meal.mealType === 'dinner' ? 'Veggie Grain Plate' : 'Chicken Salad Bowl',
  ];

  const shownRows = [];
  const chosenRows = [];
  const context = meal._context || { mealContext: 'eat_in', mode: 'eat_in' };
  const timeOfDay = meal.mealType === 'breakfast' ? 'morning' : meal.mealType === 'lunch' ? 'lunch' : 'evening';
  const dayOfWeek = isWeekend(new Date(meal.createdAt)) ? 1 : 0;

  const ranked = candidateNames.map((candidateName, idx) => {
    const historyCount = toNumber(foodHistory.get(candidateName), 0);
    const historyScore = clamp(historyCount / 12, 0.1, 0.95);
    const featureBundle = computeFeatureBundle({
      candidateRank: idx,
      acceptanceRate,
      context: {
        ...context,
        timeOfDay,
        dayOfWeek,
      },
      activity,
      random,
      historyScore,
      anomalies: anomalySetForDay(profile.behavior?.anomalyPlan || [], dayOffset),
    });

    return {
      candidateName,
      rank: idx + 1,
      score: featureBundle.score,
      probability: featureBundle.probability,
      features: featureBundle.features,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  const chooseRoll = random();
  let selected = null;
  if (chooseRoll <= acceptanceRate) {
    selected = ranked[0];
    if (random() < 0.18) {
      selected = ranked[Math.min(1, ranked.length - 1)];
    }
  }

  ranked.forEach((candidate) => {
    const shownId = stableId(
      'recshown',
      userId,
      meal.createdAt,
      meal.mealType,
      candidate.candidateName,
      candidate.rank
    );
    const shownRow = {
      id: shownId,
      userId,
      eventType: 'shown',
      itemName: candidate.candidateName,
      sourceType: context.mode || context.mealContext,
      recommendationScore: round(candidate.score * 100, 2),
      predictedProbability: round(candidate.probability, 4),
      modelVariant: 'ml',
      experimentGroup: 'B',
      winnerMode: context.mealContext,
      candidateRank: candidate.rank,
      chosen: selected && selected.candidateName === candidate.candidateName ? 1 : 0,
      features: candidate.features,
      context: {
        mode: context.mode,
        mealContext: context.mealContext,
        keyword: meal.foodName.toLowerCase(),
        distance: round(context.mode === 'eat_in' ? 0.2 : 1.8 + random() * 3.2, 2),
        cuisine: profile.preferences?.preferredCuisine || 'balanced',
        recommendationReason: 'synthetic-seed-generated',
        mealType: meal.mealType,
        timeOfDay: candidate.features.timeOfDay,
        dayOfWeek: candidate.features.dayOfWeek,
      },
      nutrition: {
        calories: Math.round(dayNutrition.calories / 3),
        protein: round(dayNutrition.protein / 3, 1),
        carbs: round(dayNutrition.carbs / 3, 1),
        fats: round(dayNutrition.fats / 3, 1),
        fiber: round(dayNutrition.fiber / 3, 1),
      },
      createdAt: meal.createdAt,
    };
    shownRows.push(shownRow);

    if (selected && selected.candidateName === candidate.candidateName) {
      chosenRows.push({
        ...shownRow,
        id: stableId(
          'recchosen',
          userId,
          meal.createdAt,
          meal.mealType,
          candidate.candidateName,
          candidate.rank
        ),
        eventType: 'chosen',
        chosen: 1,
      });
    }
  });

  if (selected) {
    foodHistory.set(selected.candidateName, toNumber(foodHistory.get(selected.candidateName), 0) + 1);
  }

  return {
    shownRows,
    chosenRows,
    selectedName: selected ? selected.candidateName : null,
  };
}

function buildContentInteraction(userId, profile, date, random, activityLevel) {
  if (random() < 0.4) {
    return null;
  }

  const movie = random() < 0.52;
  const contextType = activityLevel > 0.55 ? 'workout' : 'eat_in';
  const selected = random() < clamp(toNumber(profile.behavior?.acceptanceRate, 0.6), 0.1, 0.95);

  return {
    id: stableId('content', userId, profile.key, new Date(date).toISOString().slice(0, 10)),
    userId,
    contentType: movie ? 'movie' : 'song',
    itemId: movie ? `movie-${profile.key}-seed` : `song-${profile.key}-seed`,
    title: movie ? 'Chef\'s Table Episode' : 'Walking Beat Mix',
    contextType,
    timeOfDay: contextType === 'workout' ? 'evening' : 'dinner',
    dayOfWeek: new Date(date).getDay(),
    selected,
    action: selected ? 'selected' : 'shown',
    score: round(70 + random() * 20, 1),
    confidence: round(0.65 + random() * 0.3, 3),
    features: {
      genreMatch: round(0.55 + random() * 0.4, 4),
      moodMatch: round(0.55 + random() * 0.4, 4),
      durationFit: round(0.5 + random() * 0.45, 4),
      contextFit: round(0.6 + random() * 0.35, 4),
      timeOfDayFit: round(0.5 + random() * 0.4, 4),
      historySimilarity: round(0.45 + random() * 0.45, 4),
      activityFit: round(clamp(activityLevel + random() * 0.2, 0.2, 0.98), 4),
    },
    metadata: {
      source: 'synthetic_seed',
      profile: profile.key,
    },
    createdAt: new Date(date).toISOString(),
  };
}

function buildSyntheticSeriesForUser(user, profile) {
  const random = createSeededRandom(`contextfit:${profile.key}:v1`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const meals = [];
  const exerciseSessions = [];
  const recommendationInteractions = [];
  const searchHistory = [];
  const userContentInteractions = [];
  const foodHistory = new Map();

  let latestActivity = {
    steps: 0,
    caloriesBurned: 0,
    activityLevelNormalized: 0.5,
  };

  for (let dayOffset = SYNTHETIC_DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const anomalies = anomalySetForDay(profile.behavior?.anomalyPlan || [], dayOffset);
    const nutrition = computeDailyTargets(profile, date, random, anomalies);
    const activity = computeDailyActivity(profile, date, random, anomalies);
    latestActivity = activity;

    const dayMeals = buildMealEntries(user.id, date, nutrition, random, profile, anomalies);
    dayMeals.forEach((meal) => {
      const context = meal._context || { mealContext: 'eat_in', mode: 'eat_in' };
      searchHistory.push({
        id: stableId(
          'search',
          user.id,
          new Date(meal.createdAt).toISOString().slice(0, 16),
          meal.foodName
        ),
        userId: user.id,
        keyword: meal.foodName.toLowerCase(),
        lat: ATHENS_LAT + normalRandom(random, 0, 0.015),
        lng: ATHENS_LNG + normalRandom(random, 0, 0.015),
        radius: 6,
        resultCount: 3 + Math.floor(random() * 6),
        createdAt: meal.createdAt,
      });

      const interactions = buildRecommendationInteractions({
        userId: user.id,
        meal,
        dayNutrition: nutrition,
        activity,
        profile,
        random,
        dayOffset,
        foodHistory,
      });
      recommendationInteractions.push(...interactions.shownRows, ...interactions.chosenRows);

      const { _context, _mealIndex, ...persistableMeal } = meal;
      meals.push(persistableMeal);
    });

    const sessionTime = new Date(date);
    sessionTime.setHours(18, 5, 0, 0);
    const session = {
      id: stableId('exercise', user.id, profile.key, sessionTime.toISOString().slice(0, 10)),
      userId: user.id,
      workoutType: activity.workoutType,
      source: toNumber(profile.behavior?.workoutProbability, 0) > 0.55 ? 'wearable-sync' : 'manual',
      provider: toNumber(profile.behavior?.workoutProbability, 0) > 0.55 ? 'fitbit' : 'manual',
      bodyWeightKg: profile.key === 'sedentary_user' ? 86 : profile.key === 'fitness_user' ? 74 : 79,
      durationMinutes: activity.durationMinutes,
      exercises: activity.hasWorkout
        ? [
            {
              name: activity.workoutType === 'strength' ? 'bench press' : 'running',
              sets: activity.workoutType === 'strength' ? 4 : 0,
              reps: activity.workoutType === 'strength' ? 10 : 0,
              weightKg: activity.workoutType === 'strength' ? 55 : 0,
              durationMinutes: activity.durationMinutes,
              intensity: activity.workoutType === 'strength' ? 'moderate' : 'intense',
              met: activity.workoutType === 'strength' ? 5 : 9.8,
              caloriesBurned: round(activity.caloriesBurned * 0.7, 1),
            },
          ]
        : [
            {
              name: 'walking',
              sets: 0,
              reps: 0,
              weightKg: 0,
              durationMinutes: activity.durationMinutes,
              intensity: 'moderate',
              met: 3.5,
              caloriesBurned: round(activity.caloriesBurned, 1),
            },
          ],
      steps: activity.steps,
      distanceMiles: activity.distanceMiles,
      caloriesBurned: activity.caloriesBurned,
      estimationMethod: 'met_formula',
      notes: `Synthetic ${profile.key} activity simulation`,
      createdAt: sessionTime.toISOString(),
    };
    exerciseSessions.push(session);

    const contentInteraction = buildContentInteraction(
      user.id,
      profile,
      sessionTime,
      random,
      activity.activityLevelNormalized
    );
    if (contentInteraction) {
      userContentInteractions.push(contentInteraction);
    }
  }

  const allowWearable = profile.key === 'fitness_user' || profile.key === 'weekend_spike_user';
  const provider = allowWearable ? (profile.key === 'fitness_user' ? 'fitbit' : 'google-fit') : 'manual';

  const iotPreferences = {
    allowWearableData: allowWearable,
    provider,
    manualSteps: allowWearable ? 0 : latestActivity.steps,
    manualCaloriesBurned: allowWearable ? 0 : latestActivity.caloriesBurned,
    manualActivityLevel: allowWearable ? 0.5 : latestActivity.activityLevelNormalized,
    syncedSteps: allowWearable ? latestActivity.steps : 0,
    syncedCaloriesBurned: allowWearable ? latestActivity.caloriesBurned : 0,
    syncedActivityLevel: allowWearable ? latestActivity.activityLevelNormalized : 0.5,
    lastSyncedAt: new Date().toISOString(),
  };

  const wearableConnection = {
    userId: user.id,
    provider,
    connected: true,
    syncedAt: new Date().toISOString(),
  };

  return {
    meals,
    exerciseSessions,
    recommendationInteractions,
    searchHistory,
    userContentInteractions,
    iotPreferences,
    wearableConnection,
  };
}

async function upsertSyntheticUsers() {
  const now = new Date().toISOString();
  const users = [];

  for (const profile of syntheticProfiles) {
    const existing = await userModel.findUserByEmail(profile.email);

    if (existing) {
      const updates = {};

      if (existing.firstName !== profile.firstName) {
        updates.firstName = profile.firstName;
      }
      if (existing.lastName !== profile.lastName) {
        updates.lastName = profile.lastName;
      }
      if (existing.status !== 'ACTIVE') {
        updates.status = 'ACTIVE';
      }
      if (existing.role !== 'user') {
        updates.role = 'user';
      }
      if ((existing.address || '') !== (profile.address || 'Athens, GA')) {
        updates.address = profile.address || 'Athens, GA';
      }
      if (JSON.stringify(existing.allergies || []) !== JSON.stringify(profile.allergies || [])) {
        updates.allergies = profile.allergies || [];
      }

      const hasExpectedPassword = await comparePassword(profile.password, String(existing.passwordHash || ''));
      if (!hasExpectedPassword) {
        updates.passwordHash = await hashPassword(profile.password);
      }

      if (Object.keys(updates).length > 0) {
        const updated = await userModel.updateUserById(existing.id, {
          ...updates,
          preferences: {
            ...(existing.preferences || {}),
            ...createDefaultPreferences(),
            ...(profile.preferences || {}),
          },
          contentPreferences: {
            ...(existing.contentPreferences || {}),
            ...createDefaultContentPreferences(),
            ...(profile.contentPreferences || {}),
          },
          updatedAt: now,
        });
        users.push(updated || existing);
      } else {
        users.push(existing);
      }
      continue;
    }

    const passwordHash = await hashPassword(profile.password);
    const created = await userModel.createUser({
      id: randomUUID(),
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      passwordHash,
      promotionOptIn: false,
      status: 'ACTIVE',
      role: 'user',
      address: profile.address || 'Athens, GA',
      paymentCards: [],
      favorites: [],
      favoriteRestaurants: [],
      favoriteFoods: [],
      allergies: profile.allergies || [],
      savedRecipeIds: [],
      preferences: {
        ...createDefaultPreferences(),
        ...(profile.preferences || {}),
      },
      contentPreferences: {
        ...createDefaultContentPreferences(),
        ...(profile.contentPreferences || {}),
      },
      userPreferenceWeights: {},
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    users.push(created);
  }

  return users;
}

async function persistSyntheticSeries(users, byUser) {
  const userIds = users.map((user) => user.id);
  if (!userIds.length) {
    return;
  }

  if (isMongoEnabled()) {
    await Promise.all([
      MealDocument.deleteMany({ userId: { $in: userIds } }),
      ExerciseSessionDocument.deleteMany({ userId: { $in: userIds } }),
      RecommendationInteractionDocument.deleteMany({ userId: { $in: userIds } }),
      SearchHistoryDocument.deleteMany({ userId: { $in: userIds } }),
      UserContentInteractionDocument.deleteMany({ userId: { $in: userIds } }),
      WearableConnectionDocument.deleteMany({ userId: { $in: userIds } }),
      EvaluationMetricDocument.deleteMany({ userId: { $in: userIds } }),
    ]);

    const meals = [];
    const exerciseSessions = [];
    const recommendationInteractions = [];
    const searchHistory = [];
    const userContentInteractions = [];
    const wearableConnections = [];

    users.forEach((user) => {
      const bundle = byUser.get(user.id);
      if (!bundle) return;
      meals.push(...bundle.meals);
      exerciseSessions.push(...bundle.exerciseSessions);
      recommendationInteractions.push(...bundle.recommendationInteractions);
      searchHistory.push(...bundle.searchHistory);
      userContentInteractions.push(...bundle.userContentInteractions);
      wearableConnections.push(bundle.wearableConnection);
    });

    if (meals.length) await MealDocument.insertMany(meals, { ordered: false });
    if (exerciseSessions.length) await ExerciseSessionDocument.insertMany(exerciseSessions, { ordered: false });
    if (recommendationInteractions.length) {
      await RecommendationInteractionDocument.insertMany(recommendationInteractions, { ordered: false });
    }
    if (searchHistory.length) await SearchHistoryDocument.insertMany(searchHistory, { ordered: false });
    if (userContentInteractions.length) {
      await UserContentInteractionDocument.insertMany(userContentInteractions, { ordered: false });
    }
    if (wearableConnections.length) {
      await WearableConnectionDocument.insertMany(wearableConnections, { ordered: false });
    }
    return;
  }

  await dataStore.updateData((data) => {
    const removeSynthetic = (rows = []) =>
      rows.filter((row) => !userIds.includes(row.userId));

    data.meals = removeSynthetic(data.meals || []);
    data.exerciseSessions = removeSynthetic(data.exerciseSessions || []);
    data.recommendationInteractions = removeSynthetic(data.recommendationInteractions || []);
    data.searchHistory = removeSynthetic(data.searchHistory || []);
    data.userContentInteractions = removeSynthetic(data.userContentInteractions || []);
    data.wearableConnections = removeSynthetic(data.wearableConnections || []);
    data.evaluationMetrics = removeSynthetic(data.evaluationMetrics || []);

    users.forEach((user) => {
      const bundle = byUser.get(user.id);
      if (!bundle) return;
      data.meals.push(...bundle.meals);
      data.exerciseSessions.push(...bundle.exerciseSessions);
      data.recommendationInteractions.push(...bundle.recommendationInteractions);
      data.searchHistory.push(...bundle.searchHistory);
      data.userContentInteractions.push(...bundle.userContentInteractions);
      data.wearableConnections.push(bundle.wearableConnection);
    });

    return data;
  });
}

async function getSyntheticDatasetTotals(users) {
  const userIds = users.map((user) => user.id);
  if (!userIds.length) {
    return {
      users: 0,
      meals: 0,
      exerciseSessions: 0,
      recommendationInteractions: 0,
      searchHistory: 0,
    };
  }

  if (isMongoEnabled()) {
    const [meals, exerciseSessions, recommendationInteractions, searchHistory] = await Promise.all([
      MealDocument.countDocuments({ userId: { $in: userIds } }),
      ExerciseSessionDocument.countDocuments({ userId: { $in: userIds } }),
      RecommendationInteractionDocument.countDocuments({ userId: { $in: userIds } }),
      SearchHistoryDocument.countDocuments({ userId: { $in: userIds } }),
    ]);

    return {
      users: userIds.length,
      meals,
      exerciseSessions,
      recommendationInteractions,
      searchHistory,
    };
  }

  const data = await dataStore.readData();
  const includesUser = (row) => userIds.includes(row.userId);

  return {
    users: userIds.length,
    meals: (data.meals || []).filter(includesUser).length,
    exerciseSessions: (data.exerciseSessions || []).filter(includesUser).length,
    recommendationInteractions: (data.recommendationInteractions || []).filter(includesUser).length,
    searchHistory: (data.searchHistory || []).filter(includesUser).length,
  };
}

async function hasSyntheticDatasetForUsers(users) {
  const totals = await getSyntheticDatasetTotals(users);
  return (
    totals.users > 0 &&
    totals.meals >= totals.users &&
    totals.exerciseSessions >= totals.users &&
    totals.recommendationInteractions >= totals.users &&
    totals.searchHistory >= totals.users
  );
}

async function ensureSyntheticDataset(options = {}) {
  const upsertedUsers = await upsertSyntheticUsers();
  const skipIfPresent = options.skipIfPresent !== false;

  if (skipIfPresent && (await hasSyntheticDatasetForUsers(upsertedUsers))) {
    const existingTotals = await getSyntheticDatasetTotals(upsertedUsers);
    logger.info('Synthetic multi-user dataset already present', existingTotals);
    return existingTotals;
  }

  const byUser = new Map();

  for (const profile of syntheticProfiles) {
    const user = upsertedUsers.find((item) => item.email === profile.email);
    if (!user) continue;
    const series = buildSyntheticSeriesForUser(user, profile);
    byUser.set(user.id, series);
    await userModel.updateUserById(user.id, {
      iotPreferences: series.iotPreferences,
      userPreferenceWeights: {
        protein: round(toNumber(profile.behavior?.proteinRatio, 0.27), 4),
        calories: round(1 - Math.abs(toNumber(profile.behavior?.baseCalories, 2200) - toNumber(profile.preferences?.dailyCalorieGoal, 2200)) / 3000, 4),
        convenience: round(toNumber(profile.behavior?.deliveryRate, 0.3), 4),
      },
    });
  }

  await persistSyntheticSeries(upsertedUsers, byUser);

  const totals = {
    users: upsertedUsers.length,
    meals: 0,
    exerciseSessions: 0,
    recommendationInteractions: 0,
    searchHistory: 0,
  };
  Array.from(byUser.values()).forEach((bundle) => {
    totals.meals += bundle.meals.length;
    totals.exerciseSessions += bundle.exerciseSessions.length;
    totals.recommendationInteractions += bundle.recommendationInteractions.length;
    totals.searchHistory += bundle.searchHistory.length;
  });

  logger.info('Synthetic multi-user dataset ready', totals);
  return totals;
}

module.exports = {
  ensureSyntheticDataset,
};
