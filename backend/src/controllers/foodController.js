const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const foodLookupService = require('../services/foodLookupService');
const foodResolutionService = require('../services/foodResolutionService');
const foodVisionService = require('../services/foodVisionService');
const userService = require('../services/userService');
const mealService = require('../services/mealService');
const exerciseService = require('../services/exerciseService');
const candidateGenerationService = require('../services/candidateGenerationService');
const crossDomainMappingService = require('../services/crossDomainMappingService');
const feedbackStorageService = require('../services/feedbackStorageService');
const recommendationScoringService = require('../services/recommendationScoringService');
const banditDecisionService = require('../services/banditDecisionService');
const { ATHENS_GEORGIA_CENTER } = require('../utils/travel');

const lookupFood = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const allergies = Array.isArray(user.allergies) ? user.allergies : [];

  const item = await foodLookupService.lookupFood({
    ...req.validatedBody,
    allergies,
  });

  const alternatives = await foodLookupService.globalSearchFoods({
    query: req.validatedBody.query,
    allergies,
    limit: 6,
  });

  return sendSuccess(
    res,
    {
      item,
      alternatives,
    },
    'Food lookup completed'
  );
});

const searchGlobalFoods = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const allergies = Array.isArray(user.allergies) ? user.allergies : [];

  const results = await foodLookupService.globalSearchFoods({
    query: req.validatedBody.query,
    allergies,
    limit: 12,
  });

  return sendSuccess(
    res,
    {
      results,
      count: results.length,
    },
    'Food search completed'
  );
});

function toNumberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampQueryNumber(value, missingFallback, min, max, invalidFallback = missingFallback) {
  const fallback = value === undefined || value === null || value === '' ? missingFallback : invalidFallback;
  return Math.min(max, Math.max(min, toNumberOrFallback(value, fallback)));
}

function normalizeAction(value) {
  const action = String(value || '').trim().toLowerCase();
  if (['selected', 'save', 'helpful', 'not_interested', 'ignored'].includes(action)) {
    return action;
  }
  return 'selected';
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeBodyText(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim() || fallback;
  }

  return fallback;
}

function buildRemainingFromToday(user = {}, todayMeals = {}) {
  const preferences = user.preferences || {};
  const totals = todayMeals.totals || {};
  return {
    calories: Math.max(0, toNumberOrFallback(preferences.dailyCalorieGoal, 2200) - toNumberOrFallback(totals.calories, 0)),
    protein: Math.max(0, toNumberOrFallback(preferences.proteinGoal, 140) - toNumberOrFallback(totals.protein, 0)),
    carbs: Math.max(0, toNumberOrFallback(preferences.carbsGoal, 220) - toNumberOrFallback(totals.carbs, 0)),
    fats: Math.max(0, toNumberOrFallback(preferences.fatsGoal, 70) - toNumberOrFallback(totals.fats, 0)),
    fiber: Math.max(0, toNumberOrFallback(preferences.fiberGoal, 30) - toNumberOrFallback(totals.fiber, 0)),
  };
}

function buildRecommendationQuery(query = {}, preferences = {}, crossDomain = {}) {
  const mode = normalizeText(query.mode || query.intent, 'daily');
  return {
    mode,
    macroFocus: normalizeText(
      query.macroFocus || crossDomain.macroFocus || preferences.macroPreference,
      'balanced'
    ),
    limit: clampQueryNumber(query.limit, 8, 1, 20),
    poolSize: clampQueryNumber(query.poolSize, 120, 80, 500, 220),
    preferredDiet: normalizeText(query.preferredDiet || preferences.preferredDiet),
    preferredCuisine: normalizeText(query.cuisine || preferences.preferredCuisine),
    keyword: normalizeText(query.q || query.query || query.keyword),
    mealType: normalizeText(query.mealType) || null,
    intent: normalizeText(query.intent || query.mode || crossDomain.intent, 'daily'),
  };
}

function mapCandidateForApi(candidate = {}) {
  const metadata = candidate.metadata || {};
  const nutrition = candidate.nutrition || metadata.nutrition || {};
  const title = candidate.title || metadata.foodName || metadata.name || 'Food recommendation';

  return {
    id: candidate.id,
    itemId: candidate.id,
    itemType: candidate.itemType || 'meal',
    foodName: candidate.itemType === 'restaurant' ? metadata.name || title : title,
    name: metadata.name || title,
    cuisineType: candidate.cuisine || metadata.cuisine || 'balanced',
    sourceType: metadata.sourceType || candidate.sourceType || candidate.itemType || 'food',
    nutrition,
    tags: candidate.tags || metadata.tags || [],
    ingredients: candidate.ingredients || metadata.ingredients || [],
    recommendation: candidate.recommendation,
  };
}

const detectFood = asyncHandler(async (req, res) => {
  const detection = await foodVisionService.detectFood({
    file: req.file,
    imageBase64: req.body?.imageBase64,
    fileName: req.body?.fileName,
    mimeType: req.body?.mimeType,
  });

  const resolution = await foodResolutionService.resolveFood({
    userId: req.auth.userId,
    foodName: detection.foodName,
    lat: toNumberOrFallback(req.body?.lat, ATHENS_GEORGIA_CENTER.lat),
    lng: toNumberOrFallback(req.body?.lng, ATHENS_GEORGIA_CENTER.lng),
    radius: toNumberOrFallback(req.body?.radius, 5),
  });

  return sendSuccess(
    res,
    {
      detection,
      resolution,
    },
    'Food detected and resolved'
  );
});

const resolveFood = asyncHandler(async (req, res) => {
  const foodName = String(req.body?.foodName || req.validatedBody?.query || '').trim();
  if (!foodName) {
    throw new AppError('foodName is required', 400, 'VALIDATION_ERROR');
  }

  const resolution = await foodResolutionService.resolveFood({
    userId: req.auth.userId,
    foodName,
    lat: req.body?.lat,
    lng: req.body?.lng,
    radius: req.body?.radius,
  });

  return sendSuccess(
    res,
    {
      query: foodName,
      resolution,
    },
    'Food resolution completed'
  );
});

const getRecommendations = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const preferences = user.preferences || {};
  const [todayMeals, exerciseToday, feedbackProfile] = await Promise.all([
    mealService.getTodayMeals(req.auth.userId),
    exerciseService.getTodayExerciseSummary(req.auth.userId, { includeContentSuggestions: false }),
    feedbackStorageService.getFoodFeedbackProfile(req.auth.userId, {
      contextType: String(req.query.mode || req.query.intent || 'daily'),
      limit: 500,
    }),
  ]);
  const remaining = buildRemainingFromToday(user, todayMeals);
  const crossDomain = crossDomainMappingService.mapFitnessToFoodContext({
    exerciseSummary: exerciseToday.summary,
    preferences,
  });
  const recommendationQuery = buildRecommendationQuery(req.query, preferences, crossDomain);
  const candidateBundle = await candidateGenerationService.generateCandidates({
    domain: 'food',
    user,
    poolSize: recommendationQuery.poolSize,
    context: {
      remaining,
      macroFocus: recommendationQuery.macroFocus,
      preferredDiet: recommendationQuery.preferredDiet || preferences.preferredDiet,
      query: recommendationQuery.keyword,
      mealType: recommendationQuery.mealType,
      intent: recommendationQuery.intent,
      preferredTags: crossDomain.preferredTags || [],
      avoidTags: crossDomain.avoidTags || [],
    },
  });

  const scored = recommendationScoringService.scoreCandidates(
    candidateBundle.candidates || [],
    {
      remaining,
      preferences: {
        ...preferences,
        preferredDiet: recommendationQuery.preferredDiet || preferences.preferredDiet,
        preferredCuisine: recommendationQuery.preferredCuisine || preferences.preferredCuisine,
      },
      macroFocus: recommendationQuery.macroFocus,
      crossDomain,
      feedbackProfile,
    },
    Math.min(20, Math.max(recommendationQuery.limit, recommendationQuery.limit * 2))
  );
  const ranked = banditDecisionService
    .rankCandidatesWithBandit(scored, {
      userId: req.auth.userId,
      domain: 'food',
      contextType: recommendationQuery.intent,
      feedbackSignals: feedbackProfile,
      immediateWeight: 0.74,
      delayedWeight: 0.26,
      explorationRate: 0.08,
    })
    .slice(0, recommendationQuery.limit);

  return sendSuccess(
    res,
    {
      recommendations: ranked.map(mapCandidateForApi),
      count: ranked.length,
      context: {
        remaining,
        macroFocus: recommendationQuery.macroFocus,
        crossDomain,
        feedbackProfile,
      },
      model: 'lightweight_rule_scoring_v1',
    },
    'Food recommendations generated'
  );
});

const recordFoodFeedback = asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const itemName = normalizeBodyText(body.itemName ?? body.foodName ?? body.name ?? body.title);
  const itemId = normalizeBodyText(body.itemId ?? body.placeId ?? body.id, itemName);

  if (!itemName && !itemId) {
    throw new AppError('itemId or itemName is required', 400, 'VALIDATION_ERROR');
  }

  const feedback = await feedbackStorageService.recordFoodFeedback(req.auth.userId, {
    ...body,
    itemId,
    itemName,
    action: normalizeAction(body.action),
  });
  const profile = await feedbackStorageService.getFoodFeedbackProfile(req.auth.userId, {
    contextType: body.contextType || body.mode || 'daily',
    limit: 500,
  });

  return sendSuccess(
    res,
    {
      feedback,
      profile,
    },
    'Food feedback recorded',
    201
  );
});

module.exports = {
  lookupFood,
  searchGlobalFoods,
  detectFood,
  resolveFood,
  getRecommendations,
  recordFoodFeedback,
};
