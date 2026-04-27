const fs = require('fs/promises');
const path = require('path');
const { hashPassword } = require('../utils/password');
const userService = require('../services/userService');
const { createDefaultPreferences, createDefaultContentPreferences } = require('../services/userDefaultsService');
const candidateGenerationService = require('../services/candidateGenerationService');
const crossDomainMappingService = require('../services/crossDomainMappingService');
const recommendationScoringService = require('../services/recommendationScoringService');
const banditDecisionService = require('../services/banditDecisionService');
const feedbackStorageService = require('../services/feedbackStorageService');
const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const userContentInteractionModel = require('../models/userContentInteractionModel');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const RESULTS_DIR = path.join(PROJECT_ROOT, 'results');
const VALIDATION_CONTEXT = 'adaptive-validation';
const VALIDATION_PASSWORD = 'Validation123!';

const OUTPUT_FILES = {
  adaptiveResults: path.join(RESULTS_DIR, 'adaptive_results.json'),
  crossDomainResults: path.join(RESULTS_DIR, 'cross_domain_results.json'),
  multiOutputResults: path.join(RESULTS_DIR, 'multi_output_results.json'),
  summary: path.join(RESULTS_DIR, 'adaptive_summary.txt'),
};

const TEST_USER_PROFILES = [
  {
    id: 'validation-protein-strength',
    firstName: 'Protein',
    lastName: 'Strength',
    email: 'validation.protein.strength@example.com',
    label: 'High protein preference with strength workouts',
    preferences: {
      dailyCalorieGoal: 2600,
      proteinGoal: 190,
      carbsGoal: 260,
      fatsGoal: 75,
      fiberGoal: 35,
      preferredDiet: 'non-veg',
      macroPreference: 'protein',
      preferredCuisine: 'american',
      fitnessGoal: 'gain-muscle',
    },
    consumed: { calories: 980, protein: 72, carbs: 90, fats: 35, fiber: 12 },
    exerciseSummary: {
      totalCaloriesBurned: 560,
      totalSteps: 7200,
      workoutsDone: 1,
      strengthWorkouts: 1,
    },
    feedbackPlan: [
      { action: 'not_interested', selector: 'top' },
      { action: 'not_interested', selector: 'top' },
      { action: 'selected', selector: 'high-protein' },
      { action: 'save', selector: 'high-protein' },
      { action: 'helpful', selector: 'high-protein' },
      { action: 'selected', selector: 'balanced' },
    ],
  },
  {
    id: 'validation-low-cal-cardio',
    firstName: 'Lowcal',
    lastName: 'Cardio',
    email: 'validation.lowcal.cardio@example.com',
    label: 'Low calorie preference with cardio workouts',
    preferences: {
      dailyCalorieGoal: 1700,
      proteinGoal: 110,
      carbsGoal: 175,
      fatsGoal: 45,
      fiberGoal: 35,
      preferredDiet: 'veg',
      macroPreference: 'balanced',
      preferredCuisine: 'mediterranean',
      fitnessGoal: 'lose-weight',
    },
    consumed: { calories: 720, protein: 45, carbs: 95, fats: 18, fiber: 16 },
    exerciseSummary: {
      totalCaloriesBurned: 430,
      totalSteps: 11200,
      workoutsDone: 1,
      strengthWorkouts: 0,
    },
    feedbackPlan: [
      { action: 'not_interested', selector: 'highest-calorie' },
      { action: 'not_interested', selector: 'highest-calorie' },
      { action: 'selected', selector: 'light' },
      { action: 'save', selector: 'light' },
      { action: 'helpful', selector: 'fiber' },
      { action: 'selected', selector: 'balanced' },
    ],
  },
  {
    id: 'validation-mixed-irregular',
    firstName: 'Mixed',
    lastName: 'Irregular',
    email: 'validation.mixed.irregular@example.com',
    label: 'Mixed behavior with occasional cheat meals and irregular workouts',
    preferences: {
      dailyCalorieGoal: 2200,
      proteinGoal: 135,
      carbsGoal: 230,
      fatsGoal: 70,
      fiberGoal: 28,
      preferredDiet: 'non-veg',
      macroPreference: 'balanced',
      preferredCuisine: 'mexican',
      fitnessGoal: 'maintain',
    },
    consumed: { calories: 1320, protein: 58, carbs: 160, fats: 50, fiber: 14 },
    exerciseSummary: {
      totalCaloriesBurned: 160,
      totalSteps: 3800,
      workoutsDone: 0,
      strengthWorkouts: 0,
    },
    feedbackPlan: [
      { action: 'selected', selector: 'balanced' },
      { action: 'save', selector: 'quick' },
      { action: 'not_interested', selector: 'top' },
      { action: 'selected', selector: 'mexican' },
      { action: 'ignored', selector: 'highest-calorie' },
      { action: 'helpful', selector: 'balanced' },
    ],
  },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 2) {
  return Number(Number(value || 0).toFixed(decimals));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function clampRemaining(goal, consumed, fallback) {
  return Math.max(0, toNumber(goal, fallback) - toNumber(consumed, 0));
}

function buildRemaining(preferences = {}, consumed = {}) {
  return {
    calories: clampRemaining(preferences.dailyCalorieGoal, consumed.calories, 2200),
    protein: clampRemaining(preferences.proteinGoal, consumed.protein, 140),
    carbs: clampRemaining(preferences.carbsGoal, consumed.carbs, 220),
    fats: clampRemaining(preferences.fatsGoal, consumed.fats, 70),
    fiber: clampRemaining(preferences.fiberGoal, consumed.fiber, 30),
  };
}

function summarizeRecommendation(candidate = {}) {
  const recommendation = candidate.recommendation || {};
  const nutrition = candidate.nutrition || {};

  return {
    id: candidate.id,
    title: candidate.title || candidate.name || candidate.foodName,
    itemType: candidate.itemType || 'meal',
    cuisine: candidate.cuisine || candidate.cuisineType || null,
    tags: Array.isArray(candidate.tags) ? candidate.tags : [],
    rank: recommendation.rank || 0,
    score: round(recommendation.score, 2),
    confidence: round(recommendation.confidence, 4),
    nutrition: {
      calories: round(nutrition.calories, 1),
      protein: round(nutrition.protein, 1),
      carbs: round(nutrition.carbs, 1),
      fats: round(nutrition.fats, 1),
      fiber: round(nutrition.fiber, 1),
    },
    factors: recommendation.factors || {},
    bandit: recommendation.bandit || null,
  };
}

function compareRecommendations(before = [], after = []) {
  const beforeIds = before.map((item) => item.id);
  const afterIds = after.map((item) => item.id);
  const afterById = new Map(after.map((item) => [item.id, item]));

  const commonChanges = before
    .filter((item) => afterById.has(item.id))
    .map((item) => {
      const next = afterById.get(item.id);
      return {
        id: item.id,
        title: item.title,
        beforeRank: item.rank,
        afterRank: next.rank,
        rankDelta: item.rank - next.rank,
        beforeScore: item.score,
        afterScore: next.score,
        scoreDelta: round(next.score - item.score, 2),
      };
    })
    .filter((item) => item.rankDelta !== 0 || item.scoreDelta !== 0);

  return {
    topChanged: before[0]?.id !== after[0]?.id,
    beforeTop: before[0] || null,
    afterTop: after[0] || null,
    addedToTopList: after.filter((item) => !beforeIds.includes(item.id)),
    removedFromTopList: before.filter((item) => !afterIds.includes(item.id)),
    commonChanges,
  };
}

function selectRecommendation(recommendations = [], selector = 'top') {
  const ranked = Array.isArray(recommendations) ? recommendations : [];
  if (!ranked.length) {
    return null;
  }

  const normalizedSelector = normalizeText(selector);
  if (normalizedSelector === 'top') {
    return ranked[0];
  }
  if (normalizedSelector === 'highest-calorie') {
    return [...ranked].sort((a, b) => toNumber(b.nutrition?.calories, 0) - toNumber(a.nutrition?.calories, 0))[0];
  }

  const matched = ranked.find((item) => {
    const tags = (Array.isArray(item.tags) ? item.tags : []).map(normalizeText);
    const title = normalizeText(item.title || item.name || item.foodName);
    const cuisine = normalizeText(item.cuisine || item.cuisineType);
    if (normalizedSelector === 'mexican') {
      return cuisine.includes('mexican') || title.includes('mexican');
    }
    return tags.includes(normalizedSelector) || title.includes(normalizedSelector);
  });

  return matched || ranked[0];
}

async function ensureValidationUsers() {
  const passwordHash = await hashPassword(VALIDATION_PASSWORD);
  const now = new Date().toISOString();
  const users = [];

  for (const profile of TEST_USER_PROFILES) {
    const existing = await userService.getUserByEmail(profile.email);
    const userPayload = {
      id: existing?.id || profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      passwordHash: existing?.passwordHash || passwordHash,
      promotionOptIn: false,
      status: 'ACTIVE',
      role: 'user',
      address: 'Athens, GA',
      paymentCards: [],
      favorites: [],
      favoriteRestaurants: [],
      favoriteFoods: [],
      allergies: [],
      savedRecipeIds: [],
      savedContent: [],
      preferences: {
        ...createDefaultPreferences(),
        ...profile.preferences,
      },
      contentPreferences: createDefaultContentPreferences(),
      userPreferenceWeights: {},
      iotPreferences: {
        allowWearableData: false,
        provider: 'manual',
        manualSteps: profile.exerciseSummary.totalSteps,
        manualCaloriesBurned: profile.exerciseSummary.totalCaloriesBurned,
        manualActivityLevel: profile.exerciseSummary.totalSteps >= 9000 ? 0.8 : 0.45,
        syncedSteps: 0,
        syncedCaloriesBurned: 0,
        syncedActivityLevel: 0.5,
        lastSyncedAt: null,
      },
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      verifiedAt: existing?.verifiedAt || now,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const saved = existing
      ? await userService.updateUser(existing.id, userPayload)
      : await userService.createUser(userPayload);
    users.push(saved);
  }

  return users;
}

async function resetValidationFeedback(users = []) {
  const userIds = users.map((user) => user.id).filter(Boolean);
  const [food, media] = await Promise.all([
    recommendationInteractionModel.deleteInteractionsByUserIds(userIds),
    userContentInteractionModel.deleteInteractionsByUserIds(userIds),
  ]);

  return {
    foodDeleted: food.deletedCount,
    mediaDeleted: media.deletedCount,
  };
}

async function getFoodRecommendationsForProfile(user, profile, options = {}) {
  const preferences = user.preferences || profile.preferences || {};
  const exerciseSummary = options.exerciseSummary || profile.exerciseSummary || {};
  const remaining = buildRemaining(preferences, options.consumed || profile.consumed || {});
  const crossDomain = crossDomainMappingService.mapFitnessToFoodContext({
    exerciseSummary,
    iotContext: user.iotPreferences || {},
    preferences,
  });
  const feedbackProfile =
    options.feedbackProfile ||
    (await feedbackStorageService.getFoodFeedbackProfile(user.id, {
      contextType: VALIDATION_CONTEXT,
      limit: 500,
    }));

  const candidateBundle = await candidateGenerationService.generateCandidates({
    domain: 'food',
    user,
    poolSize: options.poolSize || 140,
    context: {
      remaining,
      macroFocus: crossDomain.macroFocus,
      preferredDiet: preferences.preferredDiet,
      preferredCuisine: preferences.preferredCuisine,
      intent: crossDomain.intent || VALIDATION_CONTEXT,
      preferredTags: crossDomain.preferredTags || [],
      avoidTags: crossDomain.avoidTags || [],
      query: options.query || '',
    },
  });

  const scored = recommendationScoringService.scoreCandidates(
    candidateBundle.candidates,
    {
      remaining,
      preferences,
      macroFocus: crossDomain.macroFocus,
      crossDomain,
      feedbackProfile,
    },
    options.limit || 8
  );

  const ranked = banditDecisionService.rankCandidatesWithBandit(scored, {
    userId: user.id,
    domain: 'food',
    contextType: VALIDATION_CONTEXT,
    feedbackSignals: feedbackProfile,
    immediateWeight: 0.74,
    delayedWeight: 0.26,
    explorationRate: 0,
  });

  return {
    recommendations: ranked.slice(0, options.limit || 8),
    remaining,
    crossDomain,
    feedbackProfile,
  };
}

async function simulateFeedback(user, profile, recommendations = []) {
  const records = [];
  for (const step of profile.feedbackPlan || []) {
    const target = selectRecommendation(recommendations, step.selector);
    if (!target) {
      continue;
    }

    const record = await feedbackStorageService.recordFoodFeedback(user.id, {
      itemId: target.id,
      itemName: target.title || target.name || target.foodName,
      action: step.action,
      contextType: VALIDATION_CONTEXT,
      mode: VALIDATION_CONTEXT,
      rank: target.recommendation?.rank,
      score: target.recommendation?.score,
      confidence: target.recommendation?.confidence,
      features: {
        ...(target.recommendation?.features || {}),
        tags: Array.isArray(target.tags) ? target.tags : [],
      },
      cuisineType: target.cuisine || target.cuisineType,
      sourceType: target.sourceType || target.itemType,
    });

    records.push({
      action: step.action,
      selector: step.selector,
      itemId: target.id,
      itemName: target.title || target.name || target.foodName,
      storedId: record.id,
    });
  }

  return records;
}

async function buildAdaptiveResults(users = []) {
  const generatedAt = new Date().toISOString();
  const results = [];

  for (const user of users) {
    const profile = TEST_USER_PROFILES.find((item) => item.email === user.email);
    const beforeProfile = await feedbackStorageService.getFoodFeedbackProfile(user.id, {
      contextType: VALIDATION_CONTEXT,
      limit: 500,
    });
    const beforeBundle = await getFoodRecommendationsForProfile(user, profile, {
      feedbackProfile: beforeProfile,
      limit: 8,
    });
    const before = beforeBundle.recommendations.map(summarizeRecommendation);
    const interactions = await simulateFeedback(user, profile, beforeBundle.recommendations);
    const afterProfile = await feedbackStorageService.getFoodFeedbackProfile(user.id, {
      contextType: VALIDATION_CONTEXT,
      limit: 500,
    });
    const afterBundle = await getFoodRecommendationsForProfile(user, profile, {
      feedbackProfile: afterProfile,
      limit: 8,
    });
    const after = afterBundle.recommendations.map(summarizeRecommendation);

    results.push({
      userId: user.id,
      email: user.email,
      profile: profile.label,
      preferences: user.preferences,
      feedbackHistoryStart: beforeProfile.totalEvents,
      simulatedInteractions: interactions,
      feedbackSignals: afterProfile,
      before,
      after,
      comparison: compareRecommendations(before, after),
      crossDomainContext: afterBundle.crossDomain,
    });
  }

  return {
    generatedAt,
    contextType: VALIDATION_CONTEXT,
    users: results,
  };
}

async function buildCrossDomainResults(users = []) {
  const proteinUser = users.find((user) => user.email === TEST_USER_PROFILES[0].email) || users[0];
  const proteinProfile = TEST_USER_PROFILES[0];
  const lowActivity = await getFoodRecommendationsForProfile(proteinUser, proteinProfile, {
    exerciseSummary: {
      totalCaloriesBurned: 60,
      totalSteps: 1800,
      workoutsDone: 0,
      strengthWorkouts: 0,
    },
    limit: 5,
  });
  const strengthWorkout = await getFoodRecommendationsForProfile(proteinUser, proteinProfile, {
    exerciseSummary: proteinProfile.exerciseSummary,
    limit: 5,
  });

  const foodToFitnessContext = crossDomainMappingService.mapFoodToFitnessContext({
    consumed: { calories: 2750, protein: 120, carbs: 330, fats: 95, fiber: 20 },
    remaining: { calories: -430, protein: 0, carbs: -90, fats: -20, fiber: 5 },
    exerciseSummary: { totalCaloriesBurned: 120, totalSteps: 3200 },
    preferences: proteinUser.preferences,
  });
  const fitnessBundle = await candidateGenerationService.generateCandidates({
    domain: 'fitness',
    context: {
      foodToFitness: foodToFitnessContext,
      activityType: foodToFitnessContext.activityType,
      intensity: foodToFitnessContext.intensity,
      activityLevel: 0.35,
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    workoutToFood: {
      lowActivityContext: lowActivity.crossDomain,
      strengthWorkoutContext: strengthWorkout.crossDomain,
      lowActivityTopRecommendations: lowActivity.recommendations.slice(0, 3).map(summarizeRecommendation),
      strengthWorkoutTopRecommendations: strengthWorkout.recommendations.slice(0, 3).map(summarizeRecommendation),
    },
    foodToFitness: {
      context: foodToFitnessContext,
      topFitnessRecommendations: fitnessBundle.candidates.slice(0, 3).map((item, index) => ({
        id: item.id,
        title: item.title,
        rank: index + 1,
        intensity: item.intensity,
        durationMinutes: item.durationMinutes,
        relevance: round(item.relevance, 4),
        tags: item.tags || [],
      })),
    },
  };
}

async function buildMultiOutputResults(users = []) {
  const user = users.find((item) => item.email === TEST_USER_PROFILES[0].email) || users[0];
  const profile = TEST_USER_PROFILES.find((item) => item.email === user.email) || TEST_USER_PROFILES[0];
  const bundle = await getFoodRecommendationsForProfile(user, profile, {
    feedbackProfile: {
      totalEvents: 0,
      acceptanceRate: 0.5,
      saveRate: 0.2,
      ignoreRate: 0.2,
      repeatSelectionRate: 0.15,
      delayedRewardProxy: 0.45,
      preferenceAffinities: { items: [], cuisines: [], tags: [], sources: [] },
    },
    query: 'healthy',
    limit: 8,
  });
  const recommendations = bundle.recommendations.slice(0, 5).map(summarizeRecommendation);
  const ids = recommendations.map((item) => item.id);
  const titles = recommendations.map((item) => normalizeText(item.title));
  const diversityKeys = recommendations.map((item) => `${item.itemType}:${normalizeText(item.cuisine)}`);

  return {
    generatedAt: new Date().toISOString(),
    count: recommendations.length,
    recommendations,
    diversity: {
      multipleReturned: recommendations.length >= 3,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      duplicateTitles: titles.filter((title, index) => titles.indexOf(title) !== index),
      uniqueItemTypeCuisinePairs: Array.from(new Set(diversityKeys)),
      diverseByTypeCuisine: new Set(diversityKeys).size === diversityKeys.length,
    },
  };
}

function buildSummaryText(adaptiveResults, crossDomainResults, multiOutputResults) {
  const lines = [];
  lines.push('Adaptive validation summary');
  lines.push(`Generated at: ${adaptiveResults.generatedAt}`);
  lines.push('');
  lines.push('Before/after recommendation changes:');
  adaptiveResults.users.forEach((user) => {
    const rankExample = user.comparison.commonChanges.find((item) => item.rankDelta !== 0);
    const scoreExample = [...user.comparison.commonChanges].sort(
      (a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta)
    )[0];
    lines.push(`- ${user.profile}`);
    lines.push(`  Before top: ${user.comparison.beforeTop?.title || 'none'} (${user.comparison.beforeTop?.score || 0})`);
    lines.push(`  After top: ${user.comparison.afterTop?.title || 'none'} (${user.comparison.afterTop?.score || 0})`);
    lines.push(`  Simulated interactions: ${user.simulatedInteractions.length}`);
    if (rankExample) {
      lines.push(
        `  Example rank change: ${rankExample.title} moved from ${rankExample.beforeRank} to ${rankExample.afterRank}.`
      );
    } else if (scoreExample) {
      lines.push(
        `  Example score change: ${scoreExample.title} changed by ${scoreExample.scoreDelta} points.`
      );
    } else {
      lines.push('  Example change: no visible top-list movement for this fixed run.');
    }
  });
  lines.push('');
  lines.push('Cross-domain influence:');
  lines.push(`- Workout to food: ${crossDomainResults.workoutToFood.strengthWorkoutContext.reason}`);
  lines.push(`- Food to fitness: ${crossDomainResults.foodToFitness.context.reason}`);
  lines.push('');
  lines.push('Multi-output behavior:');
  lines.push(`- Returned recommendations: ${multiOutputResults.count}`);
  lines.push(`- Duplicate ids: ${multiOutputResults.diversity.duplicateIds.length}`);
  lines.push(`- Duplicate titles: ${multiOutputResults.diversity.duplicateTitles.length}`);
  lines.push(`- Diverse by item type and cuisine: ${multiOutputResults.diversity.diverseByTypeCuisine ? 'yes' : 'partial'}`);
  lines.push('');
  lines.push('Note: this validates lightweight, heuristic adaptive behavior. It is not a neural recommender or a full research-paper reproduction.');
  return `${lines.join('\n')}\n`;
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function runAdaptiveValidation(options = {}) {
  const writeFiles = options.writeFiles !== false;
  const users = await ensureValidationUsers();
  const reset = await resetValidationFeedback(users);
  const adaptiveResults = await buildAdaptiveResults(users);
  const crossDomainResults = await buildCrossDomainResults(users);
  const multiOutputResults = await buildMultiOutputResults(users);
  const summaryText = buildSummaryText(adaptiveResults, crossDomainResults, multiOutputResults);

  if (writeFiles) {
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    await Promise.all([
      writeJson(OUTPUT_FILES.adaptiveResults, adaptiveResults),
      writeJson(OUTPUT_FILES.crossDomainResults, crossDomainResults),
      writeJson(OUTPUT_FILES.multiOutputResults, multiOutputResults),
      fs.writeFile(OUTPUT_FILES.summary, summaryText, 'utf8'),
    ]);
  }

  return {
    generatedAt: adaptiveResults.generatedAt,
    reset,
    files: OUTPUT_FILES,
    adaptiveResults,
    crossDomainResults,
    multiOutputResults,
    summaryText,
  };
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function getAdaptiveSummary() {
  let adaptiveResults = await readJsonIfExists(OUTPUT_FILES.adaptiveResults);
  let crossDomainResults = await readJsonIfExists(OUTPUT_FILES.crossDomainResults);
  let multiOutputResults = await readJsonIfExists(OUTPUT_FILES.multiOutputResults);

  if (!adaptiveResults || !crossDomainResults || !multiOutputResults) {
    const generated = await runAdaptiveValidation({ writeFiles: true });
    adaptiveResults = generated.adaptiveResults;
    crossDomainResults = generated.crossDomainResults;
    multiOutputResults = generated.multiOutputResults;
  }

  return {
    generatedAt: adaptiveResults.generatedAt,
    userProfiles: adaptiveResults.users.map((user) => ({
      userId: user.userId,
      email: user.email,
      profile: user.profile,
      preferences: user.preferences,
      feedbackSignals: user.feedbackSignals,
      comparison: user.comparison,
    })),
    crossDomain: crossDomainResults,
    multiOutput: multiOutputResults,
    files: OUTPUT_FILES,
  };
}

module.exports = {
  TEST_USER_PROFILES,
  runAdaptiveValidation,
  getAdaptiveSummary,
};
