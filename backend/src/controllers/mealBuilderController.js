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

const buildMealPlan = asyncHandler(async (req, res) => {
  const context = await buildContext(req);

  const plan = mealBuilderService.buildMealBuilderPlan({
    remaining: context.remaining,
    allergies: context.allergies,
    preferences: context.preferences,
    ingredientFocus: req.validatedBody.ingredientFocus,
    maxSuggestions: req.validatedBody.maxSuggestions,
    mode: req.validatedBody.mode,
  });

  return sendSuccess(res, plan, 'Meal builder suggestions generated');
});

const buildRecipeSuggestions = asyncHandler(async (req, res) => {
  const context = await buildContext(req);

  const data = mealBuilderService.generateRecipeSuggestions({
    remaining: context.remaining,
    allergies: context.allergies,
    preferences: context.preferences,
    ingredientFocus: req.validatedBody.ingredientFocus,
    maxSuggestions: req.validatedBody.maxSuggestions,
  });

  return sendSuccess(res, data, 'Recipe suggestions generated');
});

module.exports = {
  buildMealPlan,
  buildRecipeSuggestions,
};
