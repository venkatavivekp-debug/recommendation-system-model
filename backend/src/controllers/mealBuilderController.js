const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const mealBuilderService = require('../services/mealBuilderService');
const nutritionPlannerService = require('../services/nutritionPlannerService');
const userService = require('../services/userService');
const { normalizePreferences } = require('../services/userDefaultsService');

async function buildContext(req) {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const fallbackRemaining = await nutritionPlannerService.getRemainingNutrition(req.auth.userId);

  const preferences = normalizePreferences({
    ...(user.preferences || {}),
    ...(req.validatedBody.preferences || {}),
  });

  const remainingFromRequest = req.validatedBody.remaining || {};

  const remaining = {
    calories:
      remainingFromRequest.calories !== null && remainingFromRequest.calories !== undefined
        ? remainingFromRequest.calories
        : fallbackRemaining.remaining.calories,
    protein:
      remainingFromRequest.protein !== null && remainingFromRequest.protein !== undefined
        ? remainingFromRequest.protein
        : fallbackRemaining.remaining.protein,
    carbs:
      remainingFromRequest.carbs !== null && remainingFromRequest.carbs !== undefined
        ? remainingFromRequest.carbs
        : fallbackRemaining.remaining.carbs,
    fats:
      remainingFromRequest.fats !== null && remainingFromRequest.fats !== undefined
        ? remainingFromRequest.fats
        : fallbackRemaining.remaining.fats,
    fiber:
      remainingFromRequest.fiber !== null && remainingFromRequest.fiber !== undefined
        ? remainingFromRequest.fiber
        : fallbackRemaining.remaining.fiber,
  };

  return {
    user,
    preferences,
    remaining,
    allergies:
      req.validatedBody.allergies && req.validatedBody.allergies.length
        ? req.validatedBody.allergies
        : user.allergies || [],
  };
}

function buildFallbackRemaining(preferences = {}, requestedRemaining = {}) {
  const goals = {
    calories: Number(preferences.dailyCalorieGoal || 2200),
    protein: Number(preferences.proteinGoal || 140),
    carbs: Number(preferences.carbsGoal || 220),
    fats: Number(preferences.fatsGoal || 70),
    fiber: Number(preferences.fiberGoal || 30),
  };

  return {
    calories:
      requestedRemaining?.calories !== null && requestedRemaining?.calories !== undefined
        ? requestedRemaining.calories
        : Math.max(200, Math.round(goals.calories * 0.35)),
    protein:
      requestedRemaining?.protein !== null && requestedRemaining?.protein !== undefined
        ? requestedRemaining.protein
        : Math.max(20, Math.round(goals.protein * 0.45)),
    carbs:
      requestedRemaining?.carbs !== null && requestedRemaining?.carbs !== undefined
        ? requestedRemaining.carbs
        : Math.max(20, Math.round(goals.carbs * 0.35)),
    fats:
      requestedRemaining?.fats !== null && requestedRemaining?.fats !== undefined
        ? requestedRemaining.fats
        : Math.max(8, Math.round(goals.fats * 0.35)),
    fiber:
      requestedRemaining?.fiber !== null && requestedRemaining?.fiber !== undefined
        ? requestedRemaining.fiber
        : Math.max(5, Math.round(goals.fiber * 0.4)),
  };
}

async function buildFallbackContext(req) {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const preferences = normalizePreferences({
    ...(user.preferences || {}),
    ...(req.validatedBody.preferences || {}),
  });

  return {
    user,
    preferences,
    remaining: buildFallbackRemaining(preferences, req.validatedBody.remaining || {}),
    allergies:
      req.validatedBody.allergies && req.validatedBody.allergies.length
        ? req.validatedBody.allergies
        : user.allergies || [],
  };
}

const buildMealPlan = asyncHandler(async (req, res) => {
  let context;
  let fallbackUsed = false;
  try {
    context = await Promise.race([
      buildContext(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('meal-builder-timeout')), 4500)),
    ]);
  } catch (_error) {
    fallbackUsed = true;
    context = await buildFallbackContext(req);
  }

  const plan = {
    ...mealBuilderService.buildMealBuilderPlan({
      remaining: context.remaining,
      allergies: context.allergies,
      preferences: context.preferences,
      ingredientFocus: req.validatedBody.ingredientFocus,
      maxSuggestions: req.validatedBody.maxSuggestions,
      mode: req.validatedBody.mode,
    }),
    fallbackUsed,
  };

  return sendSuccess(res, plan, 'Meal builder suggestions generated');
});

const buildRecipeSuggestions = asyncHandler(async (req, res) => {
  let context;
  let fallbackUsed = false;
  try {
    context = await Promise.race([
      buildContext(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('recipe-builder-timeout')), 4500)),
    ]);
  } catch (_error) {
    fallbackUsed = true;
    context = await buildFallbackContext(req);
  }

  const data = {
    ...mealBuilderService.generateRecipeSuggestions({
      remaining: context.remaining,
      allergies: context.allergies,
      preferences: context.preferences,
      ingredientFocus: req.validatedBody.ingredientFocus,
      maxSuggestions: req.validatedBody.maxSuggestions,
    }),
    fallbackUsed,
  };

  return sendSuccess(res, data, 'Recipe suggestions generated');
});

module.exports = {
  buildMealPlan,
  buildRecipeSuggestions,
};
