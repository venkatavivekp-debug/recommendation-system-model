const { randomUUID } = require('crypto');
const evaluationMetricModel = require('../models/evaluationMetricModel');
const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const userContentInteractionModel = require('../models/userContentInteractionModel');
const mlModelService = require('./mlModelService');
const userService = require('./userService');
const behaviorModelService = require('./behaviorModelService');
const anomalyDetectionService = require('./anomalyDetectionService');

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

function computeRankingQualityMetrics(interactions = [], k = 3) {
  const safeK = Math.max(1, toNumber(k, 3));
  const chosenRows = (interactions || []).filter(
    (row) => row.eventType === 'chosen' && Number(row.candidateRank || 0) > 0
  );
  const shownRows = (interactions || []).filter(
    (row) => row.eventType === 'shown' && Number(row.candidateRank || 0) > 0
  );

  const chosenTopK = chosenRows.filter((row) => Number(row.candidateRank || 0) <= safeK).length;
  const shownTopK = shownRows.filter((row) => Number(row.candidateRank || 0) <= safeK).length;

  const precisionAtK =
    chosenRows.length > 0 ? clamp01(chosenTopK / Math.max(chosenRows.length, 1)) : 0;
  const recallAtK =
    shownTopK > 0 ? clamp01(chosenTopK / Math.max(shownTopK, 1)) : 0;

  const ndcg =
    chosenRows.length > 0
      ? chosenRows.reduce((sum, row) => {
          const rank = Math.max(1, Number(row.candidateRank || 1));
          return sum + 1 / Math.log2(rank + 1);
        }, 0) / chosenRows.length
      : 0;

  return {
    precisionAtK: round(precisionAtK, 4),
    recallAtK: round(recallAtK, 4),
    ndcg: round(clamp01(ndcg), 4),
    k: safeK,
  };
}

function computeDelayedRewardProxy(interactions = []) {
  const chosenRows = (interactions || []).filter((row) => row.eventType === 'chosen');
  const shownRows = (interactions || []).filter((row) => row.eventType === 'shown');
  const saveLike = chosenRows.filter((row) => Boolean(row?.context?.followedWinner)).length;

  const itemCounts = new Map();
  chosenRows.forEach((row) => {
    const key = String(row?.itemName || '').trim().toLowerCase();
    if (!key) return;
    itemCounts.set(key, toNumber(itemCounts.get(key), 0) + 1);
  });
  const repeats = [...itemCounts.values()].filter((count) => count > 1).length;
  const repeatRate =
    itemCounts.size > 0 ? clamp01(repeats / Math.max(itemCounts.size, 1)) : 0;
  const acceptanceRate =
    shownRows.length > 0 ? clamp01(chosenRows.length / Math.max(shownRows.length, 1)) : 0;
  const winnerFollowRate =
    chosenRows.length > 0 ? clamp01(saveLike / Math.max(chosenRows.length, 1)) : 0;

  return round(clamp01(acceptanceRate * 0.5 + repeatRate * 0.25 + winnerFollowRate * 0.25), 4);
}

function computeCrossDomainTransitionExamples(interactions = []) {
  const chosenRows = (interactions || [])
    .filter((row) => row.eventType === 'chosen')
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  const transitionCounts = new Map();
  for (let index = 1; index < chosenRows.length; index += 1) {
    const prev = String(chosenRows[index - 1]?.context?.mode || 'unknown').toLowerCase();
    const curr = String(chosenRows[index]?.context?.mode || 'unknown').toLowerCase();
    const key = `${prev}->${curr}`;
    transitionCounts.set(key, toNumber(transitionCounts.get(key), 0) + 1);
  }

  return [...transitionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([transition, count]) => ({ transition, count }));
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

function computeAcceptanceTrend(interactions = []) {
  const now = Date.now();
  const shown = (interactions || []).filter((row) => row.eventType === 'shown');
  const chosen = (interactions || []).filter((row) => row.eventType === 'chosen');

  const inWindow = (row, startDay, endDay) => {
    const ageDays = (now - new Date(row.createdAt || now).getTime()) / 86400000;
    return ageDays >= startDay && ageDays < endDay;
  };

  const shownLast7 = shown.filter((row) => inWindow(row, 0, 7)).length;
  const shownPrev7 = shown.filter((row) => inWindow(row, 7, 14)).length;
  const chosenLast7 = chosen.filter((row) => inWindow(row, 0, 7)).length;
  const chosenPrev7 = chosen.filter((row) => inWindow(row, 7, 14)).length;

  const last7Rate = shownLast7 > 0 ? chosenLast7 / shownLast7 : 0;
  const prev7Rate = shownPrev7 > 0 ? chosenPrev7 / shownPrev7 : 0;

  return {
    last7Rate: round(last7Rate, 3),
    previous7Rate: round(prev7Rate, 3),
    delta: round(last7Rate - prev7Rate, 3),
  };
}

function computeFeatureImportanceTrend(weights = []) {
  const featureNames = mlModelService.FEATURE_KEYS || [];
  if (!Array.isArray(weights) || !weights.length) {
    return [];
  }

  return featureNames
    .map((name, index) => ({
      name,
      weight: round(toNumber(weights[index + 1], 0), 4),
      importance: round(Math.abs(toNumber(weights[index + 1], 0)), 4),
    }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);
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
    model.weights,
    model.featureStats
  );
  const ranking = computeRankingSignals(interactions);
  const rankingQuality = computeRankingQualityMetrics(interactions, 3);
  const delayedRewardProxy = computeDelayedRewardProxy(interactions);
  const crossDomainTransitions = computeCrossDomainTransitionExamples(interactions);
  const groups = computeGroupSelectionRates(interactions);
  const lastHistory = Array.isArray(model.weightHistory) ? model.weightHistory.slice(-2) : [];
  const previousWeights = lastHistory.length > 1 ? lastHistory[0].weights : [];
  const currentWeights = model.weights || mlModelService.DEFAULT_LOGISTIC_WEIGHTS;
  const acceptanceTrend = computeAcceptanceTrend(interactions);
  const featureImportanceTrend = computeFeatureImportanceTrend(currentWeights);

  return {
    accuracy: classification.accuracy,
    precision: classification.precision,
    recall: classification.recall,
    auc: classification.auc,
    sampleSize: classification.size,
    topRecommendationChosenRate: ranking.topRecommendationChosenRate,
    rankingSuccessRate: ranking.rankingSuccessRate,
    precisionAtK: rankingQuality.precisionAtK,
    recallAtK: rankingQuality.recallAtK,
    ndcg: rankingQuality.ndcg,
    delayedRewardProxy,
    crossDomainTransitions,
    experimentGroup: mlModelService.getExperimentGroup(userId),
    groupASelectionRate: groups.groupASelectionRate,
    groupBSelectionRate: groups.groupBSelectionRate,
    modelVariant:
      mlModelService.getExperimentGroup(userId) === 'B' ? 'ml' : 'heuristic',
    trained: Boolean(model.trained),
    modelSampleSize: Number(model.sampleSize || 0),
    weights: currentWeights.map((item) => round(item, 4)),
    weightChange: weightDelta(currentWeights, previousWeights),
    acceptanceTrend,
    featureImportanceTrend,
  };
}

function buildDailyEvaluationSnapshot({
  dateKey,
  today,
  mealHistory,
  exerciseHistory,
  recentSearches,
  prediction,
  modelPerformance,
  behaviorDriftScore,
  anomalySummary,
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
      precisionAtK: 0,
      recallAtK: 0,
      ndcg: 0,
      delayedRewardProxy: 0,
      crossDomainTransitions: [],
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
    behaviorDriftScore: round(toNumber(behaviorDriftScore, 0), 3),
    anomalySummary: {
      count: Number(anomalySummary?.count || 0),
      topMessage: anomalySummary?.topMessage || null,
    },
    acceptanceTrend: modelPerformance?.acceptanceTrend || {
      last7Rate: 0,
      previous7Rate: 0,
      delta: 0,
    },
    featureImportanceTrend: modelPerformance?.featureImportanceTrend || [],
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
  exerciseHistory = [],
  recentSearches = [],
  prediction,
  iotContext = null,
}) {
  const dateKey = toDateKey(new Date());
  const modelPerformance = await computeModelPerformance(userId, user);
  const behaviorDriftScore = behaviorModelService.computeBehaviorDriftScore(mealHistory || []);
  const anomalySummary = await anomalyDetectionService.detectUserAnomalies({
    today: {
      userId,
      caloriesConsumed: Number(dashboardToday?.caloriesConsumed || 0),
      caloriesBurned: Number(dashboardToday?.caloriesBurned || 0),
      carbs: Number(dashboardToday?.carbsConsumed || 0),
    },
    meals: mealHistory || [],
    exerciseSessions: exerciseHistory || [],
    iotContext,
  });

  const snapshot = buildDailyEvaluationSnapshot({
    dateKey,
    today: {
      ...dashboardToday,
      meals: todayMeals,
    },
    mealHistory,
    exerciseHistory,
    recentSearches,
    prediction,
    modelPerformance,
    behaviorDriftScore,
    anomalySummary,
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

async function computeContentRecommendationMetrics(userId, limit = 1600) {
  const interactions = await userContentInteractionModel.listInteractionsByUser(userId, limit);
  const shown = interactions.filter((row) => String(row.action || '').toLowerCase() === 'shown');
  const selected = interactions.filter(
    (row) =>
      row.selected === true ||
      ['selected', 'helpful', 'save'].includes(String(row.action || '').toLowerCase())
  );

  const topPickChosen = selected.filter(
    (row) => Number(row.metadata?.rank || 0) === 1 || Number(row.metadata?.candidateRank || 0) === 1
  ).length;
  const topPickShown = shown.filter(
    (row) => Number(row.metadata?.rank || 0) === 1 || Number(row.metadata?.candidateRank || 0) === 1
  ).length;

  const acceptanceRate = shown.length > 0 ? selected.length / shown.length : 0;
  const topPickChosenRate = topPickShown > 0 ? topPickChosen / topPickShown : 0;

  const byType = {
    movie: { shown: 0, selected: 0 },
    song: { shown: 0, selected: 0 },
  };

  interactions.forEach((row) => {
    const type = String(row.contentType || '').toLowerCase() === 'song' ? 'song' : 'movie';
    if (String(row.action || '').toLowerCase() === 'shown') {
      byType[type].shown += 1;
    }
    if (row.selected === true || ['selected', 'helpful', 'save'].includes(String(row.action || '').toLowerCase())) {
      byType[type].selected += 1;
    }
  });

  return {
    shownCount: shown.length,
    selectedCount: selected.length,
    acceptanceRate: round(clamp01(acceptanceRate), 4),
    topPickChosenRate: round(clamp01(topPickChosenRate), 4),
    byType: {
      movieSelectionRate:
        byType.movie.shown > 0 ? round(clamp01(byType.movie.selected / byType.movie.shown), 4) : 0,
      songSelectionRate:
        byType.song.shown > 0 ? round(clamp01(byType.song.selected / byType.song.shown), 4) : 0,
    },
  };
}

async function getGlobalContentMetrics(limit = 5000) {
  const rows = await userContentInteractionModel.listAllInteractions(limit);
  if (!rows.length) {
    return {
      shownCount: 0,
      selectedCount: 0,
      acceptanceRate: 0,
      topPickChosenRate: 0,
      byType: {
        movieSelectionRate: 0,
        songSelectionRate: 0,
      },
    };
  }

  const grouped = new Map();
  rows.forEach((row) => {
    const userId = row.userId || 'unknown';
    const list = grouped.get(userId) || [];
    list.push(row);
    grouped.set(userId, list);
  });

  const perUser = await Promise.all(
    Array.from(grouped.entries()).map(async ([userId]) => computeContentRecommendationMetrics(userId, 2400))
  );

  const average = (key) =>
    perUser.length
      ? perUser.reduce((sum, item) => sum + Number(item[key] || 0), 0) / perUser.length
      : 0;
  const averageByType = (typeKey) =>
    perUser.length
      ? perUser.reduce((sum, item) => sum + Number(item.byType?.[typeKey] || 0), 0) / perUser.length
      : 0;

  return {
    shownCount: rows.filter((row) => String(row.action || '').toLowerCase() === 'shown').length,
    selectedCount: rows.filter((row) => row.selected === true).length,
    acceptanceRate: round(clamp01(average('acceptanceRate')), 4),
    topPickChosenRate: round(clamp01(average('topPickChosenRate')), 4),
    byType: {
      movieSelectionRate: round(clamp01(averageByType('movieSelectionRate')), 4),
      songSelectionRate: round(clamp01(averageByType('songSelectionRate')), 4),
    },
    usersEvaluated: perUser.length,
  };
}

function aggregateTrend(metricsByUser = [], metricAccessor) {
  const buckets = new Map();

  (metricsByUser || []).forEach((entry) => {
    const rows = Array.isArray(entry?.metrics) ? entry.metrics : [];
    rows.forEach((row) => {
      const date = String(row?.date || '');
      if (!date) return;
      const value = toNumber(metricAccessor(row), NaN);
      if (!Number.isFinite(value)) return;
      const list = buckets.get(date) || [];
      list.push(value);
      buckets.set(date, list);
    });
  });

  return Array.from(buckets.entries())
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([date, values]) => ({
      date,
      value: round(values.reduce((sum, item) => sum + item, 0) / Math.max(values.length, 1), 4),
    }));
}

async function getGlobalRecommendationModelAnalysis({ perUserLimit = 30 } = {}) {
  const users = await userService.getAllUsers();
  if (!users.length) {
    return {
      usersEvaluated: 0,
      accuracyTrend: [],
      topPickTrend: [],
      precisionAtKTrend: [],
      recallAtKTrend: [],
      ndcgTrend: [],
      acceptanceTrend: { last7Rate: 0, previous7Rate: 0, delta: 0 },
      delayedRewardProxy: 0,
      crossDomainTransitions: [],
      anomalyCount: 0,
      behaviorDriftAverage: 0,
      featureImportanceTrend: [],
      modelVariantBreakdown: { heuristic: 0, ml: 0 },
      averageWeightShift: 0,
    };
  }

  const metricsByUser = await Promise.all(
    users.map(async (user) => ({
      userId: user.id,
      metrics: await getRecentMetrics(user.id, perUserLimit),
    }))
  );

  const latestSnapshots = metricsByUser
    .map((entry) => (entry.metrics || [])[0])
    .filter(Boolean);

  const safeAverage = (values = []) =>
    values.length
      ? round(values.reduce((sum, item) => sum + toNumber(item, 0), 0) / values.length, 4)
      : 0;

  const acceptanceValues = latestSnapshots.map((row) => row.acceptanceTrend || {});
  const acceptanceTrend = {
    last7Rate: safeAverage(acceptanceValues.map((item) => item.last7Rate)),
    previous7Rate: safeAverage(acceptanceValues.map((item) => item.previous7Rate)),
    delta: safeAverage(acceptanceValues.map((item) => item.delta)),
  };

  const anomalyCount = latestSnapshots.reduce(
    (sum, row) => sum + Math.max(0, toNumber(row.anomalySummary?.count, 0)),
    0
  );
  const behaviorDriftAverage = safeAverage(latestSnapshots.map((row) => row.behaviorDriftScore));

  const featureContributionMap = new Map();
  latestSnapshots.forEach((row) => {
    const trend = Array.isArray(row.featureImportanceTrend) ? row.featureImportanceTrend : [];
    trend.forEach((item) => {
      const name = String(item?.name || '').trim();
      if (!name) return;
      const prev = featureContributionMap.get(name) || { total: 0, count: 0, weight: 0 };
      featureContributionMap.set(name, {
        total: prev.total + Math.abs(toNumber(item.importance, 0)),
        weight: prev.weight + toNumber(item.weight, 0),
        count: prev.count + 1,
      });
    });
  });

  const featureImportanceTrend = Array.from(featureContributionMap.entries())
    .map(([name, agg]) => ({
      name,
      importance: round(agg.total / Math.max(agg.count, 1), 4),
      weight: round(agg.weight / Math.max(agg.count, 1), 4),
    }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8);

  const modelVariantBreakdown = latestSnapshots.reduce(
    (acc, row) => {
      const variant = String(row.recommendationModel?.variant || 'heuristic').toLowerCase();
      if (variant === 'ml') {
        acc.ml += 1;
      } else {
        acc.heuristic += 1;
      }
      return acc;
    },
    { heuristic: 0, ml: 0 }
  );

  const averageWeightShift = safeAverage(
    latestSnapshots.map((row) =>
      Array.isArray(row.modelPerformance?.weightChange)
        ? row.modelPerformance.weightChange.reduce(
            (sum, value) => sum + Math.abs(toNumber(value, 0)),
            0
          )
        : 0
    )
  );
  const delayedRewardProxy = safeAverage(
    latestSnapshots.map((row) => row.modelPerformance?.delayedRewardProxy)
  );
  const transitionMap = new Map();
  latestSnapshots.forEach((row) => {
    const transitions = Array.isArray(row.modelPerformance?.crossDomainTransitions)
      ? row.modelPerformance.crossDomainTransitions
      : [];
    transitions.forEach((transition) => {
      const key = String(transition?.transition || '').trim();
      if (!key) return;
      transitionMap.set(key, toNumber(transitionMap.get(key), 0) + toNumber(transition?.count, 0));
    });
  });
  const crossDomainTransitions = [...transitionMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([transition, count]) => ({ transition, count }));

  return {
    usersEvaluated: latestSnapshots.length,
    accuracyTrend: aggregateTrend(metricsByUser, (row) => row.modelPerformance?.accuracy),
    topPickTrend: aggregateTrend(
      metricsByUser,
      (row) => row.modelPerformance?.topRecommendationChosenRate
    ),
    precisionAtKTrend: aggregateTrend(
      metricsByUser,
      (row) => row.modelPerformance?.precisionAtK
    ),
    recallAtKTrend: aggregateTrend(metricsByUser, (row) => row.modelPerformance?.recallAtK),
    ndcgTrend: aggregateTrend(metricsByUser, (row) => row.modelPerformance?.ndcg),
    acceptanceTrend,
    delayedRewardProxy,
    crossDomainTransitions,
    anomalyCount,
    behaviorDriftAverage,
    featureImportanceTrend,
    modelVariantBreakdown,
    averageWeightShift,
  };
}

module.exports = {
  buildDailyEvaluationSnapshot,
  computeRecommendationAccuracy,
  computeGoalAdherence,
  computeMacroBalance,
  computeModelPerformance,
  computeContentRecommendationMetrics,
  evaluateAndStoreDailyMetrics,
  getGlobalContentMetrics,
  getGlobalRecommendationModelAnalysis,
  getRecentMetrics,
};
