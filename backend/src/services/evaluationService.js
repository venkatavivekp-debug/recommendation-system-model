const { randomUUID } = require('crypto');
const evaluationMetricModel = require('../models/evaluationMetricModel');

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

function buildDailyEvaluationSnapshot({
  dateKey,
  today,
  mealHistory,
  recentSearches,
  prediction,
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
  dashboardToday,
  todayMeals = [],
  mealHistory = [],
  recentSearches = [],
  prediction,
}) {
  const dateKey = toDateKey(new Date());

  const snapshot = buildDailyEvaluationSnapshot({
    dateKey,
    today: {
      ...dashboardToday,
      meals: todayMeals,
    },
    mealHistory,
    recentSearches,
    prediction,
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
  evaluateAndStoreDailyMetrics,
  getRecentMetrics,
};
