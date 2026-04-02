const crypto = require('crypto');
const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const userService = require('./userService');

const FEATURE_KEYS = [
  'proteinMatch',
  'calorieFit',
  'preferenceMatch',
  'distanceScore',
  'historySimilarity',
  'allergySafe',
];

const DEFAULT_LOGISTIC_WEIGHTS = [-0.42, 1.35, 1.08, 0.92, 0.7, 0.62, 1.18];
const DEFAULT_LEARNING_RATE = 0.08;

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

function featureNormalization(features = {}) {
  return {
    proteinMatch: clamp01(features.proteinMatch),
    calorieFit: clamp01(features.calorieFit),
    preferenceMatch: clamp01(features.preferenceMatch),
    distanceScore: clamp01(features.distanceScore),
    historySimilarity: clamp01(features.historySimilarity),
    allergySafe: clamp01(features.allergySafe),
  };
}

function toFeatureVector(features = {}) {
  const normalized = featureNormalization(features);
  return [1, ...FEATURE_KEYS.map((key) => normalized[key])];
}

function featurePayloadFromRecommendation(candidate = {}) {
  const recommendation = candidate.recommendation || {};
  const features = recommendation.features || {};
  const factors = recommendation.factors || {};
  const hasAllergyWarning = Array.isArray(candidate.allergyWarnings) && candidate.allergyWarnings.length > 0;

  return featureNormalization({
    proteinMatch: factors.proteinMatch ?? features.macroMatch ?? 0,
    calorieFit: factors.calorieFit ?? features.calorieFit ?? 0,
    preferenceMatch: factors.preferenceMatch ?? features.userPreference ?? 0,
    distanceScore: factors.distanceScore ?? features.proximityScore ?? 0,
    historySimilarity: features.historyScore ?? 0,
    allergySafe: hasAllergyWarning ? 0 : 1 - clamp01(features.allergyPenalty),
  });
}

function predictScore(features, weights = DEFAULT_LOGISTIC_WEIGHTS) {
  const vector = toFeatureVector(features);
  const safeWeights = Array.isArray(weights) && weights.length === vector.length ? weights : DEFAULT_LOGISTIC_WEIGHTS;
  return sigmoid(dot(safeWeights, vector));
}

function getDefaultModel() {
  return {
    version: 'logreg_v1',
    trained: false,
    sampleSize: 0,
    learningRate: DEFAULT_LEARNING_RATE,
    weights: [...DEFAULT_LOGISTIC_WEIGHTS],
    updatedAt: null,
    trainedAt: null,
    weightHistory: [],
  };
}

async function getUserModel(userOrId) {
  let user = userOrId;
  if (!user || typeof user !== 'object') {
    user = await userService.getUserById(userOrId);
  }

  const base = getDefaultModel();
  if (!user || !user.mlRecommendationModel || typeof user.mlRecommendationModel !== 'object') {
    return base;
  }

  const model = user.mlRecommendationModel;
  const weights =
    Array.isArray(model.weights) && model.weights.length === DEFAULT_LOGISTIC_WEIGHTS.length
      ? model.weights.map((item, index) => toNumber(item, DEFAULT_LOGISTIC_WEIGHTS[index]))
      : [...DEFAULT_LOGISTIC_WEIGHTS];

  return {
    ...base,
    ...model,
    weights,
    learningRate: toNumber(model.learningRate, DEFAULT_LEARNING_RATE),
    sampleSize: Math.max(0, toNumber(model.sampleSize, 0)),
    weightHistory: Array.isArray(model.weightHistory) ? model.weightHistory.slice(-24) : [],
  };
}

function getExperimentGroup(userId) {
  const hash = crypto.createHash('sha1').update(String(userId || '')).digest('hex');
  const bucket = parseInt(hash.slice(0, 2), 16) % 2;
  return bucket === 0 ? 'A' : 'B';
}

function buildTopFeatureSignals(features, weights) {
  const normalized = featureNormalization(features);
  const vector = FEATURE_KEYS.map((key) => normalized[key]);
  const contributions = FEATURE_KEYS.map((key, index) => ({
    key,
    contribution: toNumber(weights[index + 1], 0) * vector[index],
  }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);

  return contributions.map((item) => item.key);
}

function buildExplanation(topFeatures = []) {
  const dictionary = {
    proteinMatch: 'protein target fit',
    calorieFit: 'calorie budget alignment',
    preferenceMatch: 'diet/cuisine preference match',
    distanceScore: 'nearby convenience',
    historySimilarity: 'history similarity',
    allergySafe: 'allergy safety',
  };

  if (!topFeatures.length) {
    return 'Chosen as a balanced option for your current context.';
  }

  const labels = topFeatures.map((key) => dictionary[key] || key);
  if (labels.length === 1) {
    return `Chosen because it strongly matches ${labels[0]}.`;
  }
  if (labels.length === 2) {
    return `Chosen because it best matches ${labels[0]} and ${labels[1]}.`;
  }

  return `Chosen because it balances ${labels[0]}, ${labels[1]}, and ${labels[2]}.`;
}

function normalizeArrayLength(weights) {
  if (!Array.isArray(weights) || weights.length !== DEFAULT_LOGISTIC_WEIGHTS.length) {
    return [...DEFAULT_LOGISTIC_WEIGHTS];
  }
  return weights.map((value, index) => toNumber(value, DEFAULT_LOGISTIC_WEIGHTS[index]));
}

function buildTrainingDataset(interactions = []) {
  const rows = [];

  (interactions || []).forEach((row) => {
    if (!row || !row.features || typeof row.features !== 'object') {
      return;
    }

    const normalizedFeatures = featureNormalization(row.features);
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

    rows.push({
      x: toFeatureVector(normalizedFeatures),
      y: label,
    });
  });

  const positives = rows.filter((row) => row.y === 1);
  const negatives = rows.filter((row) => row.y === 0);
  const maxNegatives = Math.max(positives.length * 3, 80);
  const sampledNegatives = negatives.slice(0, maxNegatives);

  return [...positives, ...sampledNegatives];
}

function gradientDescentTrain(dataset, initialWeights, options = {}) {
  if (!dataset.length) {
    return normalizeArrayLength(initialWeights);
  }

  const weights = normalizeArrayLength(initialWeights);
  const alpha = toNumber(options.learningRate, DEFAULT_LEARNING_RATE);
  const regularization = toNumber(options.regularization, 0.0015);
  const iterations = Math.max(120, Math.min(1200, toNumber(options.iterations, 420)));
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
      const penalty = j === 0 ? 0 : regularization * weights[j];
      weights[j] -= alpha * ((gradients[j] / dataset.length) + penalty);
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
    sampleSize: Math.max(0, toNumber(model.sampleSize, 0)),
    weightHistory: Array.isArray(model.weightHistory) ? model.weightHistory.slice(-24) : [],
    updatedAt: new Date().toISOString(),
  };

  await userService.updateUser(userId, {
    mlRecommendationModel: payload,
  });

  return payload;
}

async function trainModel(userId, options = {}) {
  const [user, interactions] = await Promise.all([
    userService.getUserById(userId),
    recommendationInteractionModel.listInteractionsByUser(userId, 2400),
  ]);

  const currentModel = await getUserModel(user);
  const dataset = buildTrainingDataset(interactions);
  const positives = dataset.filter((row) => row.y === 1).length;
  const negatives = dataset.filter((row) => row.y === 0).length;

  if (dataset.length < 24 || positives < 4 || negatives < 8) {
    const fallback = {
      ...currentModel,
      trained: false,
      reason: 'insufficient_data',
      trainingSampleSize: dataset.length,
      updatedAt: new Date().toISOString(),
    };
    await persistModel(userId, fallback);
    return fallback;
  }

  const trainedWeights = gradientDescentTrain(dataset, currentModel.weights, {
    learningRate: options.learningRate ?? currentModel.learningRate ?? DEFAULT_LEARNING_RATE,
    regularization: options.regularization ?? 0.0015,
    iterations: options.iterations ?? 420,
  });

  const trainedModel = {
    ...currentModel,
    trained: true,
    trainingSampleSize: dataset.length,
    sampleSize: dataset.length,
    learningRate: toNumber(options.learningRate, currentModel.learningRate || DEFAULT_LEARNING_RATE),
    weights: trainedWeights,
    trainedAt: new Date().toISOString(),
  };
  trainedModel.weightHistory = appendWeightHistory(trainedModel);

  return persistModel(userId, trainedModel);
}

async function onlineUpdate(userId, features, label, options = {}) {
  const model = await getUserModel(userId);
  const x = toFeatureVector(features);
  const y = clamp(toNumber(label, 0), 0, 1);
  const alpha = toNumber(options.learningRate, model.learningRate || DEFAULT_LEARNING_RATE);
  const weights = normalizeArrayLength(model.weights);
  const prediction = sigmoid(dot(weights, x));
  const error = prediction - y;

  const nextWeights = weights.map((weight, index) => {
    const regularization = index === 0 ? 0 : 0.0008 * weight;
    return weight - alpha * ((error * x[index]) + regularization);
  });

  const nextModel = {
    ...model,
    trained: true,
    weights: normalizeArrayLength(nextWeights),
    sampleSize: Math.max(0, toNumber(model.sampleSize, 0)) + 1,
    learningRate: alpha,
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
    const timeScore = clamp01(1 - hoursDiff / 24);

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

  const now = new Date().toISOString();
  const selected = candidates.slice(0, 8);

  await Promise.all(
    selected.map((candidate) => {
      const features = featurePayloadFromRecommendation(candidate);
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
        },
        nutrition: {
          calories: Math.max(0, toNumber(candidate.nutrition?.calories ?? candidate.nutritionEstimate?.calories, 0)),
          protein: Math.max(0, toNumber(candidate.nutrition?.protein ?? candidate.nutritionEstimate?.protein, 0)),
          carbs: Math.max(0, toNumber(candidate.nutrition?.carbs ?? candidate.nutritionEstimate?.carbs, 0)),
          fats: Math.max(0, toNumber(candidate.nutrition?.fats ?? candidate.nutritionEstimate?.fats, 0)),
          fiber: Math.max(0, toNumber(candidate.nutrition?.fiber ?? candidate.nutritionEstimate?.fiber, 0)),
        },
        createdAt: now,
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

  const features = featureNormalization(
    matchedShown?.features || payload.features || {
      proteinMatch: 0.5,
      calorieFit: 0.5,
      preferenceMatch: 0.5,
      distanceScore: 0.5,
      historySimilarity: 0.5,
      allergySafe: Array.isArray(payload.allergyWarnings) && payload.allergyWarnings.length ? 0 : 1,
    }
  );

  const experimentGroup = matchedShown?.experimentGroup || getExperimentGroup(userId);
  const modelVariant = matchedShown?.modelVariant || (experimentGroup === 'B' ? 'ml' : 'heuristic');
  const model = await getUserModel(userId);
  const probability = predictScore(features, model.weights);

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
  });

  if (updatedModel.sampleSize > 0 && updatedModel.sampleSize % 10 === 0) {
    await trainModel(userId, {
      learningRate: updatedModel.learningRate,
      iterations: 320,
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

  const enriched = (candidates || []).map((candidate) => {
    const recommendation = candidate.recommendation || {};
    const features = featurePayloadFromRecommendation(candidate);
    const probability = predictScore(features, userModel.weights);
    const topFeatures = buildTopFeatureSignals(features, userModel.weights).slice(0, 2);
    const explanation = buildExplanation(topFeatures);
    const heuristicScore = toNumber(recommendation.score, 0);
    const mlScore = probability * 100;
    const blendedScore = variant === 'ml' ? mlScore * 0.78 + heuristicScore * 0.22 : heuristicScore;

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

  const ranked = [...enriched].sort(
    (a, b) => toNumber(b.recommendation?.score, 0) - toNumber(a.recommendation?.score, 0)
  );

  return ranked.map((item, index) => ({
    ...item,
    recommendation: {
      ...item.recommendation,
      rank: index + 1,
      winnerTakeAllSelected: index === 0,
    },
  }));
}

function computeBinaryClassificationMetrics(rows = [], modelWeights = DEFAULT_LOGISTIC_WEIGHTS) {
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
    const probability = predictScore(row.features, modelWeights);
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

module.exports = {
  FEATURE_KEYS,
  DEFAULT_LOGISTIC_WEIGHTS,
  featureNormalization,
  toFeatureVector,
  predictScore,
  getDefaultModel,
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
