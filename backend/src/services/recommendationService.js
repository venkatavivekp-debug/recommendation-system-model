const mealService = require('./mealService');
const recommendationEngine = require('./recommendationEngine');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeOffsetMiles(calories) {
  const kcal = toNumber(calories, 0);
  return {
    walkingMiles: Number((kcal / 100).toFixed(1)),
    runningMiles: Number((kcal / 160).toFixed(1)),
  };
}

function attachOffsetSuggestion(result) {
  const calories =
    toNumber(result.nutrition?.calories, NaN) ||
    toNumber(result.nutritionEstimate?.calories, 0);

  return {
    ...result,
    recommendation: {
      ...result.recommendation,
      offsetSuggestion: computeOffsetMiles(calories),
    },
  };
}

async function rankResults(results, user, nutritionContext = null, options = {}) {
  const context = nutritionContext || {};
  const remainingNutrition = context.remaining || context;

  let history = Array.isArray(options.history) ? options.history : [];

  if (!history.length && user?.id) {
    const mealHistory = await mealService.getMealHistory(user.id, 260);
    history = mealHistory.meals || [];
  }

  const ranked = recommendationEngine.rankCandidates(results, {
    user,
    remainingNutrition,
    history,
    weights: options.weights,
    intent: options.intent || options.mode || 'delivery',
  });

  return ranked.map(attachOffsetSuggestion);
}

module.exports = {
  rankResults,
  computeOffsetMiles,
};
