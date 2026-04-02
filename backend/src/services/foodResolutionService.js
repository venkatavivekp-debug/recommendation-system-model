const mealBuilderService = require('./mealBuilderService');
const nutritionPlannerService = require('./nutritionPlannerService');
const searchService = require('./searchService');
const userService = require('./userService');
const { ATHENS_GEORGIA_CENTER } = require('../utils/travel');

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildYoutubeSearchLink(foodName) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${foodName} recipe`
  )}`;
}

function toRecipeResult(recipe, fallbackFoodName) {
  return {
    recipeName: recipe.recipeName || `${fallbackFoodName} recipe`,
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    estimatedMacros: recipe.estimatedMacros || {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
    },
    prepTimeMinutes: recipe.prepTimeMinutes || 20,
    allergyWarnings: recipe.allergyNotes || [],
    whyFitsPlan: recipe.whyFitsPlan || 'Balanced fallback when nearby restaurants are unavailable.',
    youtubeLink: recipe.youtubeLink || buildYoutubeSearchLink(recipe.recipeName || fallbackFoodName),
    grocerySuggestions: recipe.grocerySuggestions || [],
  };
}

async function resolveFood({ userId, foodName, lat, lng, radius }) {
  const safeKeyword = String(foodName || '').trim();
  const safeLat = toNumber(lat, ATHENS_GEORGIA_CENTER.lat);
  const safeLng = toNumber(lng, ATHENS_GEORGIA_CENTER.lng);
  const safeRadius = clamp(toNumber(radius, 5), 1, 20);

  const user = await userService.getUserOrThrow(userId);

  try {
    const restaurantSearch = await searchService.searchFoodAndFitness(
      {
        keyword: safeKeyword,
        lat: safeLat,
        lng: safeLng,
        radius: safeRadius,
        minCalories: null,
        maxCalories: null,
        macroFocus: user.preferences?.macroPreference || null,
        preferredDiet: user.preferences?.preferredDiet || null,
      },
      userId
    );

    if (restaurantSearch.results?.length) {
      return {
        type: 'restaurant',
        query: safeKeyword,
        options: restaurantSearch.results.slice(0, 8),
        count: restaurantSearch.results.length,
      };
    }
  } catch (error) {
    // Fallback to recipe generation below.
  }

  const remainingSnapshot = await nutritionPlannerService.getRemainingNutrition(userId);
  const recipePack = mealBuilderService.generateRecipeSuggestions({
    remaining: remainingSnapshot.remaining,
    allergies: user.allergies || [],
    preferences: user.preferences || {},
    ingredientFocus: safeKeyword ? [safeKeyword] : [],
    maxSuggestions: 3,
  });

  return {
    type: 'recipe',
    query: safeKeyword,
    options: (recipePack.recipes || []).map((recipe) => toRecipeResult(recipe, safeKeyword)),
    count: (recipePack.recipes || []).length,
  };
}

module.exports = {
  resolveFood,
};
