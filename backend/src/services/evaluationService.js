const { randomUUID } = require('crypto');
const evaluationMetricModel = require('../models/evaluationMetricModel');
const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const mlModelService = require('./mlModelService');
const userService = require('./userService');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(toNumber(value, 0), 0, 1);
}

function round(value, decimals = 3) {
  return Number(Number(value || 0).toFixed(decimals));
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function withinWindow(dateIso, windowDays) {
  const now = new Date();
  const date = new Date(dateIso);
  const diffMs = now.getTime() - date.getTime();
  return diffMs >= 0 && diffMs <= windowDays * 86400000;
}

function computeRecommendationAccuracy({ recentSearches = [], meals = [], windowDays = 30 }) {
  const searchesInWindow = recentSearches.filter((item) => withinWindow(item.createdAt, windowDays));
  const mealsInWindow = meals.filter((item) => withinWindow(item.createdAt, windowDays));

  const totalRecommendations = searchesInWindow.reduce(
    (sum, item) => sum + Math.max(0, toNumber(item.resultCount, 0)),
    0
  );

  const acceptedRecommendations = mealsInWindow.filter((meal) =>
    ['restaurant', 'grocery', 'recipe'].includes(String(meal.sourceType || meal.source || ''))
  ).length;

  const accuracy =
    totalRecommendations > 0
      ? clamp01(acceptedRecommendations / totalRecommendations)
      : 0;

  return {
    accuracy: round(accuracy),
    totalRecommendations,
    acceptedRecommendations,
    windowDays,
  };
}

function computeGoalAdherence(actualCalories, targetCalories) {
  const target = Math.max(1, toNumber(targetCalories, 0));
  const actual = Math.max(0, toNumber(actualCalories, 0));
  return clamp01(1 - Math.abs(actual - target) / target);
}

function macroScore(actual, target) {
  const safeTarget = Math.max(1, toNumber(target, 0));
  const safeActual = Math.max(0, toNumber(actual, 0));
  return clamp01(1 - Math.abs(safeActual - safeTarget) / safeTarget);
}

function computeMacroBalance({ consumed = {}, targets = {} }) {
  const protein = macroScore(consumed.protein, targets.protein);
  const carbs = macroScore(consumed.carbs, targets.carbs);
  const fats = macroScore(consumed.fats, targets.fats);
  const fiber = macroScore(consumed.fiber, targets.fiber);

  return {
    score: round((protein + carbs + fats + fiber) / 4),
    components: {
      protein: round(protein),
      carbs: round(carbs),
      fats: round(fats),
      fiber: round(fiber),
    },
  };
}

function buildEngagementSummary({ todayMeals = [], workoutsToday = 0 }) {
  const recommendationsClicked = todayMeals.filter((meal) =>
    ['restaurant', 'grocery', 'recipe'].includes(String(meal.sourceType || meal.source || ''))
  ).length;

  return {
    mealsLogged: todayMeals.length,
    exercisesLogged: Math.max(0, toNumber(workoutsToday, 0)),
    recommendationsClicked,
  };
}

function buildLabeledRowsFromInteractions(interactions = []) {
  return (interactions || [])
    .filter((row) => row && row.features && typeof row.features === 'object')
    .map((row) => {
      const label = row.eventType === 'chosen' ? 1 : row.eventType === 'shown' ? Number(row.chosen || 0) : null;
      if (label === null) {
        return null;
      }

      return {
        features: mlModelService.featureNormalization(row.features),
        label: label > 0 ? 1 : 0,
        candidateRank: Number(row.candidateRank || 0),
        eventType: row.eventType,
        experimentGroup: String(row.experimentGroup || 'A'),
      };
    })
    .filter(Boolean);
}

function computeRankingSignals(interactions = []) {
  const chosenRows = (interactions || []).filter((row) => row.eventType === 'chosen');
  const withRank = chosenRows.filter((row) => Number(row.candidateRank || 0) > 0);

  const topChosen = withRank.filter((row) => Number(row.candidateRank || 0) === 1).length;
  const topRecommendationChosenRate =
    withRank.length > 0 ? clamp01(topChosen / withRank.length) : 0;

  const rankedChosen = withRank.filter((row) => Number(row.candidateRank || 0) <= 3).length;
  const rankingSuccessRate = withRank.length > 0 ? clamp01(rankedChosen / withRank.length) : 0;

  return {
    topRecommendationChosenRate: round(topRecommendationChosenRate),
    rankingSuccessRate: round(rankingSuccessRate),
  };
}

function computeGroupSelectionRates(interactions = []) {
  const byGroup = {
    A: { shown: 0, chosen: 0 },
    B: { shown: 0, chosen: 0 },
  };

  (interactions || []).forEach((row) => {
    const group = String(row.experimentGroup || 'A').toUpperCase() === 'B' ? 'B' : 'A';
    if (row.eventType === 'shown') {
      byGroup[group].shown += 1;
    } else if (row.eventType === 'chosen') {
      byGroup[group].chosen += 1;
    }
  });

  return {
    groupASelectionRate:
      byGroup.A.shown > 0 ? round(clamp01(byGroup.A.chosen / byGroup.A.shown)) : 0,
    groupBSelectionRate:
      byGroup.B.shown > 0 ? round(clamp01(byGroup.B.chosen / byGroup.B.shown)) : 0,
  };
}

function weightDelta(current = [], previous = []) {
  if (!Array.isArray(current) || !Array.isArray(previous) || current.length !== previous.length) {
    return [];
  }

  return current.map((weight, index) => round(toNumber(weight, 0) - toNumber(previous[index], 0), 4));
}

async function computeModelPerformance(userId, user = null) {
  const safeUser = user || (await userService.getUserById(userId));
  const [interactions, model] = await Promise.all([
    recommendationInteractionModel.listInteractionsByUser(userId, 1800),
    mlModelService.getUserModel(safeUser || userId),
  ]);

  const labeledRows = buildLabeledRowsFromInteractions(interactions);
  const classification = mlModelService.computeBinaryClassificationMetrics(
    labeledRows,
    model.weights
  );
  const ranking = computeRankingSignals(interactions);
  const groups = computeGroupSelectionRates(interactions);
  const lastHistory = Array.isArray(model.weightHistory) ? model.weightHistory.slice(-2) : [];
  const previousWeights = lastHistory.length > 1 ? lastHistory[0].weights : [];
  const currentWeights = model.weights || mlModelService.DEFAULT_LOGISTIC_WEIGHTS;

  return {
    accuracy: classification.accuracy,
    precision: classification.precision,
    recall: classification.recall,
    auc: classification.auc,
    sampleSize: classification.size,
    topRecommendationChosenRate: ranking.topRecommendationChosenRate,
    rankingSuccessRate: ranking.rankingSuccessRate,
    experimentGroup: mlModelService.getExperimentGroup(userId),
    groupASelectionRate: groups.groupASelectionRate,
    groupBSelectionRate: groups.groupBSelectionRate,
    modelVariant:
      mlModelService.getExperimentGroup(userId) === 'B' ? 'ml' : 'heuristic',
    trained: Boolean(model.trained),
    modelSampleSize: Number(model.sampleSize || 0),
    weights: currentWeights.map((item) => round(item, 4)),
    weightChange: weightDelta(currentWeights, previousWeights),
  };
}

function buildDailyEvaluationSnapshot({
  dateKey,
  today,
  mealHistory,
  recentSearches,
  prediction,
  modelPerformance,
}) {
  const consumedCalories = toNumber(today.caloriesConsumed, 0);
  const calorieTarget = toNumber(today.dailyCalorieGoal, 2200);

  const recommendationSummary = computeRecommendationAccuracy({
    recentSearches,
    meals: mealHistory,
  });

  const adherence = computeGoalAdherence(consumedCalories, calorieTarget);

  const macroBalance = computeMacroBalance({
    consumed: {
      protein: toNumber(today.proteinConsumed, 0),
      carbs: toNumber(today.carbsConsumed, 0),
      fats: toNumber(today.fatsConsumed, 0),
      fiber: toNumber(today.fiberConsumed, 0),
    },
    targets: {
      protein: toNumber(today.proteinTarget, 0),
      carbs: toNumber(today.carbsTarget, 0),
      fats: toNumber(today.fatsTarget, 0),
      fiber: toNumber(today.fiberTarget, 0),
    },
  });

  const engagement = buildEngagementSummary({
    todayMeals: today.meals || [],
    workoutsToday: today.workoutsToday,
  });

  const predictedCalories = toNumber(prediction?.predictedCalories, calorieTarget);
  const predictionError = consumedCalories - predictedCalories;

  return {
    id: `metric-${dateKey}-${randomUUID()}`,
    date: dateKey,
    recommendationAccuracy: recommendationSummary.accuracy,
    goalAdherenceScore: round(adherence),
    macroBalanceScore: macroBalance.score,
    predictionRmse: round(toNumber(prediction?.model?.rmse, 0), 2),
    engagement,
    recommendationSummary,
    modelPerformance: modelPerformance || {
      accuracy: 0,
      precision: 0,
      recall: 0,
      auc: 0,
      topRecommendationChosenRate: 0,
      rankingSuccessRate: 0,
      sampleSize: 0,
      experimentGroup: 'A',
      groupASelectionRate: 0,
      groupBSelectionRate: 0,
    },
    recommendationModel: {
      variant: modelPerformance?.modelVariant || 'heuristic',
      trained: Boolean(modelPerformance?.trained),
      sampleSize: Number(modelPerformance?.modelSampleSize || 0),
    },
    prediction: {
      predictedCalories: round(predictedCalories, 0),
      actualCalories: round(consumedCalories, 0),
      confidence: round(toNumber(prediction?.model?.confidence, 0), 3),
      modelType: prediction?.model?.modelType || 'linear_regression',
      predictionError: round(predictionError, 0),
    },
  };
}

async function upsertDailyMetrics(userId, snapshot) {
  const date = snapshot.date || toDateKey(new Date());

  const existing = await evaluationMetricModel.getByUserAndDate(userId, date);
  const persisted = await evaluationMetricModel.upsertByUserAndDate(userId, date, {
    ...snapshot,
    id: existing?.id || snapshot.id || `metric-${date}-${randomUUID()}`,
    createdAt: existing?.createdAt || new Date().toISOString(),
  });

  return persisted;
}

async function evaluateAndStoreDailyMetrics({
  userId,
  user,
  dashboardToday,
  todayMeals = [],
  mealHistory = [],
  recentSearches = [],
  prediction,
}) {
  const dateKey = toDateKey(new Date());
  const modelPerformance = await computeModelPerformance(userId, user);

  const snapshot = buildDailyEvaluationSnapshot({
    dateKey,
    today: {
      ...dashboardToday,
      meals: todayMeals,
    },
    mealHistory,
    recentSearches,
    prediction,
    modelPerformance,
  });

  const persisted = await upsertDailyMetrics(userId, snapshot);

  return {
    snapshot,
    persisted,
  };
}

async function getRecentMetrics(userId, limit = 30) {
  return evaluationMetricModel.listByUser(userId, limit);
}

module.exports = {
  buildDailyEvaluationSnapshot,
  computeRecommendationAccuracy,
  computeGoalAdherence,
  computeMacroBalance,
  computeModelPerformance,
  evaluateAndStoreDailyMetrics,
  getRecentMetrics,
};
