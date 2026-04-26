const { randomUUID } = require('crypto');
const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const userService = require('./userService');

// Small local prediction and weighting helpers. These routines support the demo
// with simple regression/heuristics; they are not a heavy ML training pipeline.

const DEFAULT_ADAPTIVE_WEIGHTS = {
  macroMatch: 0.28,
  calorieFit: 0.2,
  userPreference: 0.16,
  historyScore: 0.16,
  goalAlignment: 0.16,
  allergyPenalty: 0.3,
};

const POSITIVE_WEIGHT_KEYS = ['macroMatch', 'calorieFit', 'userPreference', 'historyScore', 'goalAlignment'];

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

function round(value, decimals = 2) {
  return Number(Number(value || 0).toFixed(decimals));
}

function toDateKey(value) {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
}

function avg(list, fallback = 0) {
  if (!list.length) {
    return fallback;
  }

  return list.reduce((sum, item) => sum + item, 0) / list.length;
}

function goalTypeToCode(goalType) {
  const value = String(goalType || 'maintain').toLowerCase();
  if (value === 'lose-weight') {
    return 0;
  }

  if (value === 'gain-muscle') {
    return 1;
  }

  return 0.5;
}

function dayOfWeekNormalized(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return date.getUTCDay() / 6;
}

function normalizeHistoryRows({ historyDays = [], dailyCalorieGoal = 2200 }) {
  const rows = (historyDays || [])
    .map((day) => ({
      date: toDateKey(day.date),
      actualCalories: Math.max(0, toNumber(day.caloriesConsumed, 0)),
      exerciseCalories: Math.max(0, toNumber(day.caloriesBurned, 0)),
      plannedCalories:
        day.plannedCalories === null || day.plannedCalories === undefined
          ? Math.max(1200, toNumber(dailyCalorieGoal, 2200))
          : Math.max(800, toNumber(day.plannedCalories, dailyCalorieGoal)),
    }))
    .filter((row) => Number.isFinite(new Date(`${row.date}T00:00:00.000Z`).getTime()))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return rows;
}

function buildFeatureVector({ date, last3DaysAvg, totalExerciseToday, plannedCalories, goalType }) {
  return [
    1,
    dayOfWeekNormalized(date),
    clamp01(toNumber(last3DaysAvg, 0) / 4000),
    clamp01(toNumber(totalExerciseToday, 0) / 1600),
    clamp01(toNumber(plannedCalories, 0) / 5000),
    goalTypeToCode(goalType),
  ];
}

function buildTrainingSet(rows, dailyCalorieGoal, goalType) {
  const features = [];
  const targets = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const previous = rows
      .slice(Math.max(0, index - 3), index)
      .map((item) => toNumber(item.actualCalories, dailyCalorieGoal))
      .filter((value) => value > 0);

    const last3DaysAvg = avg(previous, dailyCalorieGoal);

    features.push(
      buildFeatureVector({
        date: row.date,
        last3DaysAvg,
        totalExerciseToday: row.exerciseCalories,
        plannedCalories: row.plannedCalories,
        goalType,
      })
    );
    targets.push(clamp(toNumber(row.actualCalories, dailyCalorieGoal), 500, 7000));
  }

  return {
    features,
    targets,
  };
}

function dot(a, b) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += toNumber(a[index], 0) * toNumber(b[index], 0);
  }
  return total;
}

function trainLinearRegression(samples, targets, options = {}) {
  const trainingSamples = Array.isArray(samples) ? samples : [];
  const yTargets = Array.isArray(targets) ? targets : [];

  if (trainingSamples.length < 4 || !trainingSamples[0]?.length || trainingSamples.length !== yTargets.length) {
    return null;
  }

  const dimension = trainingSamples[0].length;
  const weights = Array.from({ length: dimension }, () => 0);
  const learningRate = toNumber(options.learningRate, 0.12);
  const regularization = toNumber(options.regularization, 0.001);
  const iterations = Math.max(200, Math.min(2400, toNumber(options.iterations, 1400)));
  const targetScale = 5000;

  const normalizedTargets = yTargets.map((value) => clamp(toNumber(value, 0) / targetScale, 0, 2));

  for (let step = 0; step < iterations; step += 1) {
    const gradients = Array.from({ length: dimension }, () => 0);

    for (let i = 0; i < trainingSamples.length; i += 1) {
      const x = trainingSamples[i];
      const prediction = dot(weights, x);
      const error = prediction - normalizedTargets[i];

      for (let j = 0; j < dimension; j += 1) {
        gradients[j] += error * x[j];
      }
    }

    for (let j = 0; j < dimension; j += 1) {
      const penalty = j === 0 ? 0 : regularization * weights[j];
      weights[j] -= learningRate * ((gradients[j] / trainingSamples.length) + penalty);
    }
  }

  return {
    modelType: 'linear_regression',
    weights,
    targetScale,
    trainedAt: new Date().toISOString(),
    sampleSize: trainingSamples.length,
  };
}

function predictWithModel(model, featureVector) {
  if (!model || !Array.isArray(model.weights) || !Array.isArray(featureVector)) {
    return null;
  }

  const normalized = dot(model.weights, featureVector);
  const calories = normalized * toNumber(model.targetScale, 5000);
  return clamp(round(calories, 0), 500, 7000);
}

function fallbackPrediction({ dailyCalorieGoal, last3DaysAvg, totalExerciseToday, plannedCalories, goalType }) {
  const goalCode = goalTypeToCode(goalType);
  const conservativeBoost = goalCode === 1 ? 120 : goalCode === 0 ? -120 : 0;

  const predicted =
    toNumber(dailyCalorieGoal, 2200) * 0.45 +
    toNumber(last3DaysAvg, dailyCalorieGoal) * 0.4 +
    toNumber(totalExerciseToday, 0) * 0.2 +
    (toNumber(plannedCalories, dailyCalorieGoal) - toNumber(dailyCalorieGoal, 2200)) * 0.35 +
    conservativeBoost;

  return clamp(round(predicted, 0), 800, 6000);
}

function buildPredictionInput({
  historyDays = [],
  dailyCalorieGoal = 2200,
  plannedCalories,
  totalExerciseToday = 0,
  goalType = 'maintain',
  targetDate,
}) {
  const rows = normalizeHistoryRows({
    historyDays,
    dailyCalorieGoal,
  });

  const date = targetDate ? toDateKey(targetDate) : toDateKey(new Date());
  const recentActual = rows.slice(-3).map((row) => row.actualCalories).filter((value) => value > 0);
  const last3DaysAvg = avg(recentActual, dailyCalorieGoal);

  const effectivePlannedCalories =
    plannedCalories === undefined || plannedCalories === null
      ? dailyCalorieGoal
      : toNumber(plannedCalories, dailyCalorieGoal);

  const predictionVector = buildFeatureVector({
    date,
    last3DaysAvg,
    totalExerciseToday,
    plannedCalories: effectivePlannedCalories,
    goalType,
  });

  return {
    rows,
    date,
    last3DaysAvg,
    predictionVector,
    effectivePlannedCalories,
  };
}

function estimatePredictionRmse({ historyDays = [], dailyCalorieGoal = 2200, goalType = 'maintain' }) {
  const rows = normalizeHistoryRows({ historyDays, dailyCalorieGoal });
  if (rows.length < 6) {
    return 0;
  }

  const squaredErrors = [];

  for (let index = 4; index < rows.length; index += 1) {
    const trainRows = rows.slice(0, index);
    const trainSet = buildTrainingSet(trainRows, dailyCalorieGoal, goalType);
    const model = trainLinearRegression(trainSet.features, trainSet.targets);

    if (!model) {
      continue;
    }

    const previous = trainRows.slice(-3).map((item) => item.actualCalories);
    const last3DaysAvg = avg(previous, dailyCalorieGoal);

    const vector = buildFeatureVector({
      date: rows[index].date,
      last3DaysAvg,
      totalExerciseToday: rows[index].exerciseCalories,
      plannedCalories: rows[index].plannedCalories,
      goalType,
    });

    const predicted = predictWithModel(model, vector);
    const actual = toNumber(rows[index].actualCalories, 0);
    const error = toNumber(predicted, 0) - actual;
    squaredErrors.push(error * error);
  }

  if (!squaredErrors.length) {
    return 0;
  }

  return round(Math.sqrt(avg(squaredErrors)), 2);
}

function predictDailyCalories({
  historyDays = [],
  dailyCalorieGoal = 2200,
  plannedCalories,
  totalExerciseToday = 0,
  goalType = 'maintain',
  targetDate,
}) {
  const input = buildPredictionInput({
    historyDays,
    dailyCalorieGoal,
    plannedCalories,
    totalExerciseToday,
    goalType,
    targetDate,
  });

  const trainSet = buildTrainingSet(input.rows, dailyCalorieGoal, goalType);
  const model = trainLinearRegression(trainSet.features, trainSet.targets);
  const modelPrediction = predictWithModel(model, input.predictionVector);

  const predictedCalories =
    modelPrediction === null
      ? fallbackPrediction({
          dailyCalorieGoal,
          last3DaysAvg: input.last3DaysAvg,
          totalExerciseToday,
          plannedCalories: input.effectivePlannedCalories,
          goalType,
        })
      : modelPrediction;

  const rmse = estimatePredictionRmse({
    historyDays,
    dailyCalorieGoal,
    goalType,
  });

  const confidence = clamp01(
    0.35 + Math.min(input.rows.length, 30) / 45 - Math.min(rmse, 1200) / 2400
  );

  return {
    predictedCalories: round(predictedCalories, 0),
    features: {
      day_of_week: dayOfWeekNormalized(input.date),
      last_3_days_avg: round(input.last3DaysAvg, 1),
      total_exercise_today: round(totalExerciseToday, 1),
      planned_calories: round(input.effectivePlannedCalories, 1),
      goal_type: goalType,
    },
    model: {
      modelType: model?.modelType || 'fallback_heuristic',
      sampleSize: model?.sampleSize || input.rows.length,
      confidence: round(confidence, 3),
      rmse,
      trainedAt: model?.trainedAt || null,
    },
  };
}

function euclideanDistance(a, b) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = toNumber(a[index], 0) - toNumber(b[index], 0);
    total += delta * delta;
  }
  return Math.sqrt(total);
}

function averageVector(vectors) {
  if (!vectors.length) {
    return [];
  }

  const dimension = vectors[0].length;
  const sums = Array.from({ length: dimension }, () => 0);

  vectors.forEach((vector) => {
    for (let index = 0; index < dimension; index += 1) {
      sums[index] += toNumber(vector[index], 0);
    }
  });

  return sums.map((sum) => sum / vectors.length);
}

function userFeatureVector(user) {
  const preferences = user?.preferences || {};
  const dailyGoal = Math.max(1200, toNumber(preferences.dailyCalorieGoal, 2200));
  const proteinGoal = Math.max(30, toNumber(preferences.proteinGoal, 140));
  const carbGoal = Math.max(30, toNumber(preferences.carbsGoal, 220));
  const goalCode = goalTypeToCode(preferences.fitnessGoal);

  return [
    clamp01(dailyGoal / 5000),
    clamp01((proteinGoal * 4) / dailyGoal),
    clamp01((carbGoal * 4) / dailyGoal),
    goalCode,
  ];
}

function clusterUsersByNutrition(users = [], k = 3, maxIterations = 20) {
  const vectors = users.map((user) => ({
    userId: user.id,
    vector: userFeatureVector(user),
  }));

  if (!vectors.length) {
    return {
      clusters: [],
      assignments: {},
      k: 0,
    };
  }

  const effectiveK = Math.max(1, Math.min(k, vectors.length));
  let centroids = vectors.slice(0, effectiveK).map((item) => [...item.vector]);
  let assignments = {};

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const buckets = Array.from({ length: effectiveK }, () => []);

    vectors.forEach((item) => {
      let bestCluster = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      centroids.forEach((centroid, clusterIndex) => {
        const distance = euclideanDistance(item.vector, centroid);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCluster = clusterIndex;
        }
      });

      assignments[item.userId] = bestCluster;
      buckets[bestCluster].push(item.vector);
    });

    const nextCentroids = centroids.map((current, clusterIndex) => {
      if (!buckets[clusterIndex].length) {
        return current;
      }

      return averageVector(buckets[clusterIndex]);
    });

    const moved = nextCentroids.some(
      (centroid, index) => euclideanDistance(centroid, centroids[index]) > 0.0001
    );

    centroids = nextCentroids;

    if (!moved) {
      break;
    }
  }

  return {
    clusters: centroids.map((centroid, index) => ({
      id: index,
      centroid,
      label: `cluster-${index + 1}`,
    })),
    assignments,
    k: effectiveK,
  };
}

function selectWinnerTakeAllRecommendation(candidates = []) {
  const safe = Array.isArray(candidates) ? candidates : [];
  if (!safe.length) {
    return {
      primary: null,
      backups: [],
    };
  }

  const ranked = [...safe].sort(
    (a, b) =>
      Number(b?.recommendation?.score || 0) -
      Number(a?.recommendation?.score || 0)
  );

  return {
    primary: ranked[0] || null,
    backups: ranked.slice(1, 3),
  };
}

function roundTo(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals));
}

function normalizeWeights(weights = {}) {
  const merged = {
    ...DEFAULT_ADAPTIVE_WEIGHTS,
    ...Object.fromEntries(
      Object.entries(weights || {}).map(([key, value]) => [key, toNumber(value, DEFAULT_ADAPTIVE_WEIGHTS[key])])
    ),
  };

  let sum = 0;
  POSITIVE_WEIGHT_KEYS.forEach((key) => {
    merged[key] = clamp(merged[key], 0.05, 0.85);
    sum += merged[key];
  });

  const targetSum = POSITIVE_WEIGHT_KEYS.reduce(
    (total, key) => total + DEFAULT_ADAPTIVE_WEIGHTS[key],
    0
  );
  const safeSum = sum <= 0 ? 1 : sum;

  POSITIVE_WEIGHT_KEYS.forEach((key) => {
    merged[key] = roundTo((merged[key] / safeSum) * targetSum, 4);
  });

  merged.allergyPenalty = roundTo(clamp(merged.allergyPenalty, 0.2, 0.8), 4);
  return merged;
}

function mean(values = []) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function deriveAdaptiveWeightsFromInteractions(interactions = []) {
  const chosen = (interactions || []).filter((row) => row.eventType === 'chosen');
  if (!chosen.length) {
    return normalizeWeights(DEFAULT_ADAPTIVE_WEIGHTS);
  }

  const proteinBias = mean(
    chosen.map((row) => {
      const nutrition = row.nutrition || {};
      const protein = toNumber(nutrition.protein, 0);
      const carbs = toNumber(nutrition.carbs, 0);
      const fats = toNumber(nutrition.fats, 0);
      if (protein <= 0) {
        return 0;
      }
      return clamp01((protein - Math.max(carbs * 0.35, fats * 0.8)) / Math.max(protein, 1));
    })
  );

  const lowCalorieBias = mean(
    chosen.map((row) => {
      const calories = toNumber(row.nutrition?.calories, 0);
      if (calories <= 0) {
        return 0;
      }
      return calories <= 500 ? 1 : calories <= 700 ? 0.55 : 0.2;
    })
  );

  const preferenceBias = mean(
    chosen.map((row) => {
      const preferenceMatch = toNumber(row.context?.preferenceMatch, NaN);
      if (Number.isFinite(preferenceMatch)) {
        return clamp01(preferenceMatch);
      }
      return row.context?.preferredCuisineMatched ? 1 : 0.35;
    })
  );

  const goalBias = mean(
    chosen.map((row) => {
      const goalAlignment = toNumber(row.context?.goalAlignment, NaN);
      if (Number.isFinite(goalAlignment)) {
        return clamp01(goalAlignment);
      }
      const calories = toNumber(row.nutrition?.calories, 0);
      return calories > 0 && calories <= 750 ? 0.65 : 0.4;
    })
  );

  const distanceBias = mean(
    chosen.map((row) => {
      const distance = toNumber(row.context?.distance, NaN);
      if (!Number.isFinite(distance)) {
        return 0.5;
      }
      return clamp01(1 - distance / 10);
    })
  );

  const allergyConflictRate = mean(
    chosen.map((row) => (Array.isArray(row.context?.allergyWarnings) && row.context.allergyWarnings.length ? 1 : 0))
  );

  const historyStrength = clamp01(chosen.length / 45);

  const updated = {
    macroMatch: DEFAULT_ADAPTIVE_WEIGHTS.macroMatch + proteinBias * 0.1,
    calorieFit: DEFAULT_ADAPTIVE_WEIGHTS.calorieFit + lowCalorieBias * 0.08,
    userPreference: DEFAULT_ADAPTIVE_WEIGHTS.userPreference + preferenceBias * 0.08,
    historyScore: DEFAULT_ADAPTIVE_WEIGHTS.historyScore + historyStrength * 0.09,
    goalAlignment: DEFAULT_ADAPTIVE_WEIGHTS.goalAlignment + goalBias * 0.08 + distanceBias * 0.03,
    allergyPenalty: DEFAULT_ADAPTIVE_WEIGHTS.allergyPenalty + allergyConflictRate * 0.2,
  };

  return normalizeWeights(updated);
}

function normalizeRecommendationNutrition(candidate = {}) {
  const nutrition = candidate.nutrition || candidate.nutritionEstimate || {};
  return {
    calories: Math.max(0, toNumber(nutrition.calories, 0)),
    protein: Math.max(0, toNumber(nutrition.protein, 0)),
    carbs: Math.max(0, toNumber(nutrition.carbs, 0)),
    fats: Math.max(0, toNumber(nutrition.fats, 0)),
    fiber: Math.max(0, toNumber(nutrition.fiber, 0)),
  };
}

function normalizeRecommendationContext(candidate = {}, context = {}) {
  return {
    mode: String(context.intent || context.mode || '').toLowerCase() || null,
    keyword: String(context.keyword || '').trim() || null,
    distance: Number.isFinite(Number(candidate.distance)) ? Number(candidate.distance) : null,
    cuisine: String(candidate.cuisineType || candidate.cuisine || '').trim() || null,
    recommendationReason: candidate.recommendation?.message || null,
    preferenceMatch: toNumber(candidate.recommendation?.features?.userPreference, null),
    goalAlignment: toNumber(candidate.recommendation?.features?.goalAlignment, null),
    allergyWarnings: Array.isArray(candidate.allergyWarnings) ? candidate.allergyWarnings : [],
    mealType: context.mealType || null,
  };
}

async function logRecommendationEventsShown(userId, candidates = [], context = {}) {
  const user = await userService.getUserById(userId);
  if (!user || !Array.isArray(candidates) || !candidates.length) {
    return { logged: 0 };
  }

  const selected = candidates.slice(0, 6);
  const now = new Date().toISOString();

  await Promise.all(
    selected.map((candidate) =>
      recommendationInteractionModel.createInteraction({
        id: randomUUID(),
        userId,
        eventType: 'shown',
        itemName: String(candidate.foodName || candidate.name || '').trim() || 'Recommended item',
        sourceType: String(context.intent || context.mode || candidate.sourceType || 'recommendation').toLowerCase(),
        recommendationScore: toNumber(candidate.recommendation?.score, 0),
        context: normalizeRecommendationContext(candidate, context),
        nutrition: normalizeRecommendationNutrition(candidate),
        createdAt: now,
      })
    )
  );

  return { logged: selected.length };
}

async function recalculateUserPreferenceWeights(userId) {
  const user = await userService.getUserById(userId);
  if (!user) {
    return normalizeWeights(DEFAULT_ADAPTIVE_WEIGHTS);
  }

  const interactions = await recommendationInteractionModel.listInteractionsByUser(userId, 1200);
  const nextWeights = deriveAdaptiveWeightsFromInteractions(interactions);
  await userService.updateUser(userId, {
    userPreferenceWeights: nextWeights,
  });

  return nextWeights;
}

async function logRecommendationChoice(userId, payload = {}) {
  const user = await userService.getUserById(userId);
  if (!user) {
    return { logged: false };
  }

  const createdAt = payload.createdAt || new Date().toISOString();

  await recommendationInteractionModel.createInteraction({
    id: randomUUID(),
    userId,
    eventType: 'chosen',
    itemName: String(payload.foodName || payload.itemName || '').trim() || 'Chosen meal',
    sourceType: String(payload.sourceType || payload.source || 'meal').toLowerCase(),
    recommendationScore: toNumber(payload.recommendationScore, 0),
    context: {
      mealType: payload.mealType || null,
      distance: Number.isFinite(Number(payload.distance)) ? Number(payload.distance) : null,
      preferredCuisineMatched: Boolean(payload.preferredCuisineMatched),
      preferenceMatch: toNumber(payload.preferenceMatch, null),
      goalAlignment: toNumber(payload.goalAlignment, null),
      allergyWarnings: Array.isArray(payload.allergyWarnings) ? payload.allergyWarnings : [],
      mode: payload.mode || null,
    },
    nutrition: {
      calories: Math.max(0, toNumber(payload.calories, 0)),
      protein: Math.max(0, toNumber(payload.protein, 0)),
      carbs: Math.max(0, toNumber(payload.carbs, 0)),
      fats: Math.max(0, toNumber(payload.fats, 0)),
      fiber: Math.max(0, toNumber(payload.fiber, 0)),
    },
    createdAt,
  });

  const weights = await recalculateUserPreferenceWeights(userId);
  return {
    logged: true,
    weights,
  };
}

async function getAdaptiveWeightsForUser(userOrUserId) {
  let user = userOrUserId;
  if (!user || typeof user !== 'object') {
    user = await userService.getUserById(userOrUserId);
  }

  if (!user) {
    return normalizeWeights(DEFAULT_ADAPTIVE_WEIGHTS);
  }

  const fromProfile = user.userPreferenceWeights && typeof user.userPreferenceWeights === 'object'
    ? user.userPreferenceWeights
    : {};
  return normalizeWeights(fromProfile);
}

module.exports = {
  predictDailyCalories,
  estimatePredictionRmse,
  clusterUsersByNutrition,
  selectWinnerTakeAllRecommendation,
  buildUserFeatureVector: userFeatureVector,
  getAdaptiveWeightsForUser,
  logRecommendationEventsShown,
  logRecommendationChoice,
  recalculateUserPreferenceWeights,
  normalizeWeights,
};
