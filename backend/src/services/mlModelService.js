const crypto = require('crypto');
const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const userService = require('./userService');
const featureService = require('./featureService');

const { FEATURE_KEYS, DEFAULT_FEATURE_STATS } = featureService;

const DEFAULT_LOGISTIC_WEIGHTS = [-0.45, 1.3, 1.05, 0.92, 0.7, 0.68, 1.2, 0.24, 0.2];
const DEFAULT_LEARNING_RATE = 0.08;
const DEFAULT_L2_LAMBDA = 0.0018;
const GLOBAL_MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

let globalModelCache = {
  expiresAt: 0,
  model: null,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals));
}

function sigmoid(value) {
  const x = clamp(toNumber(value, 0), -35, 35);
  return 1 / (1 + Math.exp(-x));
}

function dot(a, b) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += toNumber(a[index], 0) * toNumber(b[index], 0);
  }
  return total;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeArrayLength(weights) {
  const expected = FEATURE_KEYS.length + 1;
  if (!Array.isArray(weights) || weights.length !== expected) {
    return [...DEFAULT_LOGISTIC_WEIGHTS];
  }
  return weights.map((value, index) => toNumber(value, DEFAULT_LOGISTIC_WEIGHTS[index]));
}

function cloneFeatureStats(stats = DEFAULT_FEATURE_STATS) {
  return featureService.computeFeatureStats([], stats);
}

function getDefaultModel() {
  return {
    version: 'logreg_v2',
    trained: false,
    sampleSize: 0,
    learningRate: DEFAULT_LEARNING_RATE,
    l2Lambda: DEFAULT_L2_LAMBDA,
    weights: [...DEFAULT_LOGISTIC_WEIGHTS],
    globalWeights: [...DEFAULT_LOGISTIC_WEIGHTS],
    featureStats: cloneFeatureStats(DEFAULT_FEATURE_STATS),
    updatedAt: null,
    trainedAt: null,
    weightHistory: [],
    coldStart: true,
  };
}

function buildTopFeatureSignals(features, weights, featureStats) {
  const normalized = featureService.normalizeFeatures(features, featureStats);
  return FEATURE_KEYS.map((key, index) => ({
    name: key,
    contribution: round(toNumber(weights[index + 1], 0) * toNumber(normalized[key], 0), 4),
  }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);
}

function buildExplanation(topFeatures = []) {
  const labels = {
    proteinMatch: 'protein target fit',
    calorieFit: 'calorie budget alignment',
    preferenceMatch: 'diet and cuisine preference',
    distanceScore: 'nearby convenience',
    historySimilarity: 'history similarity',
    allergySafe: 'allergy safety',
    timeOfDay: 'time-of-day fit',
    dayOfWeek: 'weekday/weekend pattern fit',
  };

  const names = topFeatures.map((item) => labels[item.name] || item.name);
  if (!names.length) {
    return 'Chosen as a balanced option for your current context.';
  }
  if (names.length === 1) {
    return `Chosen because it strongly matches ${names[0]}.`;
  }
  if (names.length === 2) {
    return `Chosen because it best matches ${names[0]} and ${names[1]}.`;
  }

  return `Chosen because it balances ${names[0]}, ${names[1]}, and ${names[2]}.`;
}

function getExperimentGroup(userId) {
  const hash = crypto.createHash('sha1').update(String(userId || '')).digest('hex');
  const bucket = parseInt(hash.slice(0, 2), 16) % 2;
  return bucket === 0 ? 'A' : 'B';
}

function featurePayloadFromRecommendation(candidate = {}, context = {}) {
  const recommendation = candidate.recommendation || {};
  const features = recommendation.features || {};
  const factors = recommendation.factors || {};
  const hasAllergyWarning = Array.isArray(candidate.allergyWarnings) && candidate.allergyWarnings.length > 0;
  const temporal = featureService.getTemporalFeatures(context.nowDate || new Date());

  return featureService.normalizeRawFeatures({
    proteinMatch: factors.proteinMatch ?? features.macroMatch ?? 0,
    calorieFit: factors.calorieFit ?? features.calorieFit ?? 0,
    preferenceMatch: factors.preferenceMatch ?? features.userPreference ?? 0,
    distanceScore: factors.distanceScore ?? features.proximityScore ?? 0,
    historySimilarity: features.historyScore ?? 0,
    allergySafe: hasAllergyWarning ? 0 : 1 - clamp(toNumber(features.allergyPenalty, 0), 0, 1),
    timeOfDay: temporal.timeOfDay,
    dayOfWeek: temporal.dayOfWeek,
  });
}

function buildTrainingDataset(interactions = []) {
  const rows = [];

  (interactions || []).forEach((row) => {
    if (!row || !row.features || typeof row.features !== 'object') {
      return;
    }

    let label = null;
    if (row.eventType === 'chosen') {
      label = 1;
    } else if (row.eventType === 'shown') {
      label = toNumber(row.chosen, 0) > 0 ? 1 : 0;
    } else if (row.chosen === 0 || row.chosen === 1) {
      label = toNumber(row.chosen, 0);
    }

    if (label === null) {
      return;
    }

    const temporal = featureService.getTemporalFeatures(row.createdAt);
    const normalized = featureService.normalizeRawFeatures({
      ...row.features,
      timeOfDay:
        row.features.timeOfDay === undefined ? row.context?.timeOfDay ?? temporal.timeOfDay : row.features.timeOfDay,
      dayOfWeek:
        row.features.dayOfWeek === undefined ? row.context?.dayOfWeek ?? temporal.dayOfWeek : row.features.dayOfWeek,
    });

    rows.push({
      features: normalized,
      y: label > 0 ? 1 : 0,
    });
  });

  const positives = rows.filter((row) => row.y === 1);
  const negatives = rows.filter((row) => row.y === 0);
  const maxNegatives = Math.max(positives.length * 3, 120);
  const sampledNegatives = negatives.slice(0, maxNegatives);

  return [...positives, ...sampledNegatives];
}

function buildPreparedDataset(rows = [], featureStats = DEFAULT_FEATURE_STATS) {
  return (rows || []).map((row) => ({
    x: featureService.buildFeatureVector(row.features, featureStats),
    y: row.y,
    features: row.features,
  }));
}

function gradientDescentTrain(dataset, initialWeights, options = {}) {
  if (!dataset.length) {
    return normalizeArrayLength(initialWeights);
  }

  const weights = normalizeArrayLength(initialWeights);
  const alpha = toNumber(options.learningRate, DEFAULT_LEARNING_RATE);
  const lambda = toNumber(options.regularization, DEFAULT_L2_LAMBDA);
  const iterations = Math.max(150, Math.min(1400, toNumber(options.iterations, 520)));
  const dimension = weights.length;

  for (let step = 0; step < iterations; step += 1) {
    const gradients = Array.from({ length: dimension }, () => 0);

    for (let i = 0; i < dataset.length; i += 1) {
      const row = dataset[i];
      const prediction = sigmoid(dot(weights, row.x));
      const error = prediction - row.y;

      for (let j = 0; j < dimension; j += 1) {
        gradients[j] += error * row.x[j];
      }
    }

    for (let j = 0; j < dimension; j += 1) {
      const regularization = j === 0 ? 0 : 2 * lambda * weights[j];
      weights[j] -= alpha * ((gradients[j] / dataset.length) + regularization);
    }
  }

  return normalizeArrayLength(weights);
}

function appendWeightHistory(model = {}) {
  const history = Array.isArray(model.weightHistory) ? model.weightHistory.slice(-23) : [];
  history.push({
    timestamp: new Date().toISOString(),
    weights: [...normalizeArrayLength(model.weights)],
    sampleSize: Math.max(0, toNumber(model.sampleSize, 0)),
  });
  return history;
}

async function persistModel(userId, model) {
  const payload = {
    ...model,
    weights: normalizeArrayLength(model.weights),
    globalWeights: normalizeArrayLength(model.globalWeights || model.weights),
    featureStats: cloneFeatureStats(model.featureStats || DEFAULT_FEATURE_STATS),
    sampleSize: Math.max(0, toNumber(model.sampleSize, 0)),
    learningRate: toNumber(model.learningRate, DEFAULT_LEARNING_RATE),
    l2Lambda: toNumber(model.l2Lambda, DEFAULT_L2_LAMBDA),
    weightHistory: Array.isArray(model.weightHistory) ? model.weightHistory.slice(-24) : [],
    updatedAt: new Date().toISOString(),
  };

  await userService.updateUser(userId, {
    mlRecommendationModel: payload,
  });

  return payload;
}

async function getGlobalModel(options = {}) {
  const force = Boolean(options.force);
  if (!force && globalModelCache.model && Date.now() < globalModelCache.expiresAt) {
    return globalModelCache.model;
  }

  const interactions = await recommendationInteractionModel.listAllInteractions(6000);
  const rows = buildTrainingDataset(interactions);
  const positives = rows.filter((row) => row.y === 1).length;
  const negatives = rows.filter((row) => row.y === 0).length;
  const enough = rows.length >= 60 && positives >= 12 && negatives >= 20;
  const featureStats = featureService.computeFeatureStats(rows.map((row) => row.features), DEFAULT_FEATURE_STATS);

  let weights = [...DEFAULT_LOGISTIC_WEIGHTS];
  if (enough) {
    const prepared = buildPreparedDataset(rows, featureStats);
    weights = gradientDescentTrain(prepared, DEFAULT_LOGISTIC_WEIGHTS, {
      learningRate: DEFAULT_LEARNING_RATE,
      regularization: DEFAULT_L2_LAMBDA,
      iterations: 640,
    });
  }

  const model = {
    version: 'logreg_global_v2',
    trained: enough,
    sampleSize: rows.length,
    weights: normalizeArrayLength(weights),
    featureStats,
    updatedAt: new Date().toISOString(),
    trainedAt: enough ? new Date().toISOString() : null,
    reason: enough ? 'population_trained' : 'population_default',
  };

  globalModelCache = {
    model,
    expiresAt: Date.now() + GLOBAL_MODEL_CACHE_TTL_MS,
  };

  return model;
}

async function getUserModel(userOrId) {
  const base = getDefaultModel();
  const globalModel = await getGlobalModel();

  let user = userOrId;
  if (!user || typeof user !== 'object') {
    user = await userService.getUserById(userOrId);
  }

  if (!user || !user.mlRecommendationModel || typeof user.mlRecommendationModel !== 'object') {
    return {
      ...base,
      weights: [...globalModel.weights],
      globalWeights: [...globalModel.weights],
      featureStats: cloneFeatureStats(globalModel.featureStats),
      coldStart: true,
    };
  }

  const model = user.mlRecommendationModel;
  const userWeights = normalizeArrayLength(model.weights);
  const userSampleSize = Math.max(0, toNumber(model.sampleSize, 0));
  const coldStart = userSampleSize < 12;
  const blendedWeights = coldStart
    ? userWeights.map((weight, index) => round(weight * 0.35 + globalModel.weights[index] * 0.65, 6))
    : userWeights;

  return {
    ...base,
    ...model,
    weights: normalizeArrayLength(blendedWeights),
    globalWeights: normalizeArrayLength(globalModel.weights),
    featureStats: cloneFeatureStats(model.featureStats || globalModel.featureStats),
    learningRate: toNumber(model.learningRate, DEFAULT_LEARNING_RATE),
    l2Lambda: toNumber(model.l2Lambda, DEFAULT_L2_LAMBDA),
    sampleSize: userSampleSize,
    weightHistory: Array.isArray(model.weightHistory) ? model.weightHistory.slice(-24) : [],
    coldStart,
  };
}

async function trainModel(userId, options = {}) {
  const [user, interactions, globalModel] = await Promise.all([
    userService.getUserById(userId),
    recommendationInteractionModel.listInteractionsByUser(userId, 2600),
    getGlobalModel(),
  ]);

  const currentModel = await getUserModel(user || userId);
  const rows = buildTrainingDataset(interactions);
  const positives = rows.filter((row) => row.y === 1).length;
  const negatives = rows.filter((row) => row.y === 0).length;
  const enough = rows.length >= 36 && positives >= 6 && negatives >= 10;

  if (!enough) {
    const fallback = {
      ...currentModel,
      trained: false,
      reason: 'insufficient_data',
      trainingSampleSize: rows.length,
      sampleSize: rows.length,
      weights: normalizeArrayLength(globalModel.weights),
      globalWeights: normalizeArrayLength(globalModel.weights),
      featureStats: cloneFeatureStats(globalModel.featureStats),
      coldStart: true,
    };
    fallback.weightHistory = appendWeightHistory(fallback);
    await persistModel(userId, fallback);
    return fallback;
  }

  const featureStats = featureService.computeFeatureStats(
    rows.map((row) => row.features),
    currentModel.featureStats || globalModel.featureStats
  );
  const prepared = buildPreparedDataset(rows, featureStats);
  const nextWeights = gradientDescentTrain(prepared, currentModel.weights, {
    learningRate: options.learningRate ?? currentModel.learningRate ?? DEFAULT_LEARNING_RATE,
    regularization: options.regularization ?? currentModel.l2Lambda ?? DEFAULT_L2_LAMBDA,
    iterations: options.iterations ?? 560,
  });

  const trainedModel = {
    ...currentModel,
    version: 'logreg_v2',
    trained: true,
    coldStart: false,
    reason: 'user_trained',
    trainingSampleSize: rows.length,
    sampleSize: rows.length,
    learningRate: toNumber(options.learningRate, currentModel.learningRate || DEFAULT_LEARNING_RATE),
    l2Lambda: toNumber(options.regularization, currentModel.l2Lambda || DEFAULT_L2_LAMBDA),
    weights: nextWeights,
    globalWeights: normalizeArrayLength(globalModel.weights),
    featureStats,
    trainedAt: new Date().toISOString(),
  };
  trainedModel.weightHistory = appendWeightHistory(trainedModel);

  await persistModel(userId, trainedModel);
  return trainedModel;
}

function predictScore(features, weights = DEFAULT_LOGISTIC_WEIGHTS, featureStats = DEFAULT_FEATURE_STATS) {
  const safeWeights = normalizeArrayLength(weights);
  const safeStats = cloneFeatureStats(featureStats);
  const vector = featureService.buildFeatureVector(features, safeStats);
  return sigmoid(dot(safeWeights, vector));
}

async function onlineUpdate(userId, features, label, options = {}) {
  const model = await getUserModel(userId);
  const normalizedFeatures = featureService.normalizeRawFeatures(features);
  const x = featureService.buildFeatureVector(normalizedFeatures, model.featureStats);
  const y = clamp(toNumber(label, 0), 0, 1);
  const alpha = toNumber(options.learningRate, model.learningRate || DEFAULT_LEARNING_RATE);
  const lambda = toNumber(options.regularization, model.l2Lambda || DEFAULT_L2_LAMBDA);
  const weights = normalizeArrayLength(model.weights);
  const prediction = sigmoid(dot(weights, x));
  const error = prediction - y;

  const nextWeights = weights.map((weight, index) => {
    const regularization = index === 0 ? 0 : 2 * lambda * weight;
    return weight - alpha * ((error * x[index]) + regularization);
  });

  const nextModel = {
    ...model,
    trained: true,
    coldStart: false,
    reason: 'online_update',
    weights: normalizeArrayLength(nextWeights),
    sampleSize: Math.max(0, toNumber(model.sampleSize, 0)) + 1,
    learningRate: alpha,
    l2Lambda: lambda,
    trainedAt: model.trainedAt || new Date().toISOString(),
  };
  nextModel.weightHistory = appendWeightHistory(nextModel);

  await persistModel(userId, nextModel);
  return nextModel;
}

function normalizeNameKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function resolveBestMatchingShown(shownRows = [], payload = {}) {
  const targetName = normalizeNameKey(payload.foodName || payload.itemName || '');
  if (!targetName) {
    return null;
  }

  const targetTokens = targetName.split(/\s+/).filter(Boolean);
  const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();

  let winner = null;
  let winnerScore = -1;

  shownRows.forEach((row) => {
    const rowName = normalizeNameKey(row.itemName || '');
    if (!rowName) {
      return;
    }

    const rowTokens = rowName.split(/\s+/).filter(Boolean);
    const overlap = rowTokens.filter((token) => targetTokens.includes(token)).length;
    const union = new Set([...rowTokens, ...targetTokens]).size || 1;
    const jaccard = overlap / union;

    const rowDate = new Date(row.createdAt || createdAt);
    const hoursDiff = Math.abs(createdAt.getTime() - rowDate.getTime()) / 3600000;
    const timeScore = clamp(1 - hoursDiff / 24, 0, 1);

    const score = jaccard * 0.75 + timeScore * 0.25;
    if (score > winnerScore) {
      winner = row;
      winnerScore = score;
    }
  });

  if (winnerScore < 0.18) {
    return null;
  }

  return winner;
}

async function logShownInteractions(userId, candidates = [], context = {}) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return { logged: 0 };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const temporal = featureService.getTemporalFeatures(now);
  const selected = candidates.slice(0, 8);

  await Promise.all(
    selected.map((candidate) => {
      const features = featurePayloadFromRecommendation(candidate, { nowDate: now });
      return recommendationInteractionModel.createInteraction({
        id: crypto.randomUUID(),
        userId,
        eventType: 'shown',
        itemName: String(candidate.foodName || candidate.name || '').trim() || 'Recommended item',
        sourceType: String(context.intent || context.mode || candidate.sourceType || 'recommendation').toLowerCase(),
        recommendationScore: toNumber(candidate.recommendation?.score, 0),
        predictedProbability: toNumber(candidate.recommendation?.probability, 0),
        modelVariant: String(candidate.recommendation?.modelVariant || context.modelVariant || 'heuristic'),
        experimentGroup: String(context.experimentGroup || 'A'),
        winnerMode: candidate.recommendation?.winnerMode?.id || null,
        candidateRank: toNumber(candidate.recommendation?.rank, 0),
        chosen: 0,
        features,
        context: {
          mode: String(context.intent || context.mode || '').toLowerCase() || null,
          keyword: String(context.keyword || '').trim() || null,
          distance: Number.isFinite(Number(candidate.distance)) ? Number(candidate.distance) : null,
          cuisine: String(candidate.cuisineType || candidate.cuisine || '').trim() || null,
          recommendationReason: candidate.recommendation?.reason || candidate.recommendation?.message || null,
          mealType: context.mealType || null,
          allergyWarnings: Array.isArray(candidate.allergyWarnings) ? candidate.allergyWarnings : [],
          timeOfDay: temporal.timeOfDay,
          dayOfWeek: temporal.dayOfWeek,
        },
        nutrition: {
          calories: Math.max(0, toNumber(candidate.nutrition?.calories ?? candidate.nutritionEstimate?.calories, 0)),
          protein: Math.max(0, toNumber(candidate.nutrition?.protein ?? candidate.nutritionEstimate?.protein, 0)),
          carbs: Math.max(0, toNumber(candidate.nutrition?.carbs ?? candidate.nutritionEstimate?.carbs, 0)),
          fats: Math.max(0, toNumber(candidate.nutrition?.fats ?? candidate.nutritionEstimate?.fats, 0)),
          fiber: Math.max(0, toNumber(candidate.nutrition?.fiber ?? candidate.nutritionEstimate?.fiber, 0)),
        },
        createdAt: nowIso,
      });
    })
  );

  return { logged: selected.length };
}

async function logChoiceAndLearn(userId, payload = {}) {
  const createdAt = payload.createdAt || new Date().toISOString();
  const recent = await recommendationInteractionModel.listInteractionsByUser(userId, 1200);
  const shownRows = recent.filter((row) => row.eventType === 'shown' && row.features);
  const matchedShown = resolveBestMatchingShown(shownRows, payload);
  const temporal = featureService.getTemporalFeatures(createdAt);

  const features = featureService.normalizeRawFeatures(
    matchedShown?.features || payload.features || {
      proteinMatch: 0.5,
      calorieFit: 0.5,
      preferenceMatch: 0.5,
      distanceScore: 0.5,
      historySimilarity: 0.5,
      allergySafe: Array.isArray(payload.allergyWarnings) && payload.allergyWarnings.length ? 0 : 1,
      timeOfDay: temporal.timeOfDay,
      dayOfWeek: temporal.dayOfWeek,
    }
  );

  const experimentGroup = matchedShown?.experimentGroup || getExperimentGroup(userId);
  const modelVariant = matchedShown?.modelVariant || (experimentGroup === 'B' ? 'ml' : 'heuristic');
  const model = await getUserModel(userId);
  const probability = predictScore(features, model.weights, model.featureStats);

  await recommendationInteractionModel.createInteraction({
    id: crypto.randomUUID(),
    userId,
    eventType: 'chosen',
    itemName: String(payload.foodName || payload.itemName || matchedShown?.itemName || '').trim() || 'Chosen meal',
    sourceType: String(payload.sourceType || payload.source || matchedShown?.sourceType || 'meal').toLowerCase(),
    recommendationScore: toNumber(payload.recommendationScore, matchedShown?.recommendationScore || 0),
    predictedProbability: probability,
    modelVariant,
    experimentGroup,
    winnerMode: matchedShown?.winnerMode || null,
    candidateRank: toNumber(matchedShown?.candidateRank, 0),
    chosen: 1,
    features,
    context: {
      mode: payload.mode || matchedShown?.context?.mode || null,
      keyword: payload.keyword || matchedShown?.context?.keyword || null,
      distance: Number.isFinite(Number(payload.distance))
        ? Number(payload.distance)
        : toNumber(matchedShown?.context?.distance, null),
      recommendationReason: payload.recommendationReason || matchedShown?.context?.recommendationReason || null,
      mealType: payload.mealType || matchedShown?.context?.mealType || null,
      allergyWarnings: Array.isArray(payload.allergyWarnings)
        ? payload.allergyWarnings
        : Array.isArray(matchedShown?.context?.allergyWarnings)
          ? matchedShown.context.allergyWarnings
          : [],
      followedWinner: toNumber(matchedShown?.candidateRank, 0) === 1,
      timeOfDay: temporal.timeOfDay,
      dayOfWeek: temporal.dayOfWeek,
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

  const updatedModel = await onlineUpdate(userId, features, 1, {
    learningRate: model.learningRate || DEFAULT_LEARNING_RATE,
    regularization: model.l2Lambda || DEFAULT_L2_LAMBDA,
  });

  if (updatedModel.sampleSize > 0 && updatedModel.sampleSize % 10 === 0) {
    await trainModel(userId, {
      learningRate: updatedModel.learningRate,
      regularization: updatedModel.l2Lambda,
      iterations: 420,
    });
  }

  return {
    matchedRecommendation: Boolean(matchedShown),
    modelVariant,
    experimentGroup,
  };
}

function rescoreCandidatesWithModel(candidates = [], model, options = {}) {
  const userModel = model || getDefaultModel();
  const variant = String(options.modelVariant || 'heuristic');
  const experimentGroup = String(options.experimentGroup || 'A');
  const nowDate = options.nowDate || new Date();

  const enriched = (candidates || []).map((candidate) => {
    const recommendation = candidate.recommendation || {};
    const features = featurePayloadFromRecommendation(candidate, { nowDate });
    const probability = predictScore(features, userModel.weights, userModel.featureStats);
    const topFeatures = buildTopFeatureSignals(features, userModel.weights, userModel.featureStats).slice(0, 3);
    const explanation = buildExplanation(topFeatures);
    const heuristicScore = toNumber(recommendation.score, 0);
    const mlScore = probability * 100;
    const blendedScore = variant === 'ml' ? mlScore * 0.8 + heuristicScore * 0.2 : heuristicScore;

    return {
      ...candidate,
      recommendation: {
        ...recommendation,
        probability: round(probability, 4),
        confidencePct: round(probability * 100, 1),
        topFeatures,
        explanation,
        modelVariant: variant,
        experimentGroup,
        mlScore: round(mlScore, 2),
        score: round(blendedScore, 2),
        reason: recommendation.reason || explanation,
      },
    };
  });

  const ranked = [...enriched].sort((a, b) => {
    const scoreDiff = toNumber(b.recommendation?.score, 0) - toNumber(a.recommendation?.score, 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const aDistance = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Number.POSITIVE_INFINITY;
    const bDistance = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Number.POSITIVE_INFINITY;
    return aDistance - bDistance;
  });

  return ranked.map((item, index) => ({
    ...item,
    recommendation: {
      ...item.recommendation,
      rank: index + 1,
      winnerTakeAllSelected: index === 0,
    },
  }));
}

function computeBinaryClassificationMetrics(
  rows = [],
  modelWeights = DEFAULT_LOGISTIC_WEIGHTS,
  featureStats = DEFAULT_FEATURE_STATS
) {
  if (!rows.length) {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      auc: 0,
      size: 0,
    };
  }

  const scored = rows.map((row) => {
    const probability = predictScore(row.features, modelWeights, featureStats);
    const predicted = probability >= 0.5 ? 1 : 0;
    return {
      probability,
      predicted,
      actual: row.label,
    };
  });

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  scored.forEach((row) => {
    if (row.actual === 1 && row.predicted === 1) tp += 1;
    if (row.actual === 0 && row.predicted === 0) tn += 1;
    if (row.actual === 0 && row.predicted === 1) fp += 1;
    if (row.actual === 1 && row.predicted === 0) fn += 1;
  });

  const accuracy = (tp + tn) / Math.max(scored.length, 1);
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);

  const positives = scored.filter((row) => row.actual === 1);
  const negatives = scored.filter((row) => row.actual === 0);
  let auc = 0.5;

  if (positives.length && negatives.length) {
    let wins = 0;
    let totalPairs = 0;
    positives.forEach((pos) => {
      negatives.forEach((neg) => {
        totalPairs += 1;
        if (pos.probability > neg.probability) {
          wins += 1;
        } else if (pos.probability === neg.probability) {
          wins += 0.5;
        }
      });
    });
    auc = wins / Math.max(totalPairs, 1);
  }

  return {
    accuracy: round(accuracy, 4),
    precision: round(precision, 4),
    recall: round(recall, 4),
    auc: round(auc, 4),
    size: scored.length,
  };
}

function featureNormalization(features = {}, featureStats = DEFAULT_FEATURE_STATS) {
  if (!featureStats) {
    return featureService.normalizeRawFeatures(features);
  }
  return featureService.normalizeRawFeatures(features);
}

module.exports = {
  FEATURE_KEYS,
  DEFAULT_LOGISTIC_WEIGHTS,
  DEFAULT_FEATURE_STATS,
  featureNormalization,
  predictScore,
  getDefaultModel,
  getGlobalModel,
  getUserModel,
  getExperimentGroup,
  trainModel,
  onlineUpdate,
  logShownInteractions,
  logChoiceAndLearn,
  rescoreCandidatesWithModel,
  featurePayloadFromRecommendation,
  computeBinaryClassificationMetrics,
};
