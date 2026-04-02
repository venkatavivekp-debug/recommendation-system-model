const mealService = require('./mealService');
const recommendationEngine = require('./recommendationEngine');
const mlService = require('./mlService');
const mlModelService = require('./mlModelService');

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

  const heuristicWeights = options.weights || (await mlService.getAdaptiveWeightsForUser(user));
  const experimentGroup = mlModelService.getExperimentGroup(user?.id);
  const modelVariant = experimentGroup === 'B' ? 'ml' : 'heuristic';
  let userModel = await mlModelService.getUserModel(user);

  if (modelVariant === 'ml') {
    const lastTrained = userModel.trainedAt ? new Date(userModel.trainedAt) : null;
    const isStale = !lastTrained || Number.isNaN(lastTrained.getTime()) || Date.now() - lastTrained.getTime() > 6 * 3600000;
    if (isStale) {
      try {
        userModel = await mlModelService.trainModel(user.id);
      } catch (error) {
        // Fallback to current model if training fails.
      }
    }
  }

  const heuristicRanked = recommendationEngine.rankCandidates(results, {
    user,
    remainingNutrition,
    history,
    weights: heuristicWeights,
    intent: options.intent || options.mode || 'delivery',
  });
  const ranked = mlModelService.rescoreCandidatesWithModel(heuristicRanked, userModel, {
    modelVariant,
    experimentGroup,
  });

  try {
    await mlModelService.logShownInteractions(user.id, ranked, {
      intent: options.intent || options.mode || 'delivery',
      keyword: options.keyword || null,
      mealType: options.mealType || null,
      modelVariant,
      experimentGroup,
    });
  } catch (error) {
    // Recommendation telemetry should not fail request handling.
  }

  return ranked.map(attachOffsetSuggestion);
}

module.exports = {
  rankResults,
  computeOffsetMiles,
};
