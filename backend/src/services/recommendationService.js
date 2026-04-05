const mealService = require('./mealService');
const recommendationEngine = require('./recommendationEngine');
const mlService = require('./mlService');
const mlModelService = require('./mlModelService');
const behaviorModelService = require('./behaviorModelService');
const anomalyDetectionService = require('./anomalyDetectionService');
const optimizationService = require('./optimizationService');
const iotService = require('./iotService');
const foodDataProvider = require('./dataProviders/foodDataProvider');
const { detectAllergyWarnings } = require('../utils/allergy');

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

function deterministicRandom(seedText = '') {
  let hash = 0;
  const seed = String(seedText || '');
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

function maybeApplyExploration(candidates = [], user = null, context = {}) {
  if (!Array.isArray(candidates) || candidates.length < 2) {
    return candidates;
  }

  const mode = String(context.intent || context.mode || 'default');
  const hourBucket = new Date().toISOString().slice(0, 13);
  const rand = deterministicRandom(`${user?.id || 'anon'}:${mode}:${hourBucket}`);
  const epsilon = Number.isFinite(Number(context.explorationEpsilon))
    ? Number(context.explorationEpsilon)
    : 0.08;

  if (rand >= epsilon) {
    return candidates;
  }

  const candidatePool = candidates.slice(1, 4);
  const explorePick = [...candidatePool].sort((a, b) => {
    const aAffinity = toNumber(a.recommendation?.features?.interactionAffinity, 0.5);
    const bAffinity = toNumber(b.recommendation?.features?.interactionAffinity, 0.5);
    return aAffinity - bAffinity;
  })[0];

  if (!explorePick) {
    return candidates;
  }

  const remainder = candidates.filter((item) => item !== explorePick);
  return [
    {
      ...explorePick,
      recommendation: {
        ...explorePick.recommendation,
        rank: 1,
        winnerTakeAllSelected: true,
        explorationSelected: true,
        reason: `${explorePick.recommendation?.reason || 'Strong fit'} (exploration candidate for adaptive learning)`,
      },
    },
    ...remainder.map((item, index) => ({
      ...item,
      recommendation: {
        ...item.recommendation,
        rank: index + 2,
        winnerTakeAllSelected: false,
        explorationSelected: false,
      },
    })),
  ];
}

function rankWithUnifiedPipeline(candidates = [], options = {}) {
  const modelVariant = String(options.modelVariant || 'heuristic');
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : null;
  const getHeuristicScore =
    options.getHeuristicScore ||
    ((candidate) => {
      const score = toNumber(candidate?.recommendation?.score, 0);
      return score > 1 ? score / 100 : score;
    });
  const getMlScore =
    options.getMlScore ||
    ((candidate) => clamp01(candidate?.recommendation?.probability ?? candidate?.recommendation?.confidence ?? 0));
  const getReason =
    options.getReason ||
    ((candidate) => candidate?.recommendation?.reason || candidate?.recommendation?.message || 'Strong context fit');
  const getTopFactors = options.getTopFactors || ((candidate) => candidate?.recommendation?.topFeatures || []);

  const blend =
    options.blend ||
    ((heuristicScore, mlScore) => {
      if (modelVariant === 'ml') {
        return clamp01(heuristicScore * 0.2 + mlScore * 0.8);
      }
      return heuristicScore;
    });

  const merged = (candidates || []).map((candidate) => {
    const heuristicScore = clamp01(getHeuristicScore(candidate));
    const mlScore = clamp01(getMlScore(candidate));
    const finalScore = clamp01(blend(heuristicScore, mlScore));
    const recommendation = {
      ...(candidate.recommendation || {}),
      score: Number((finalScore * 100).toFixed(2)),
      confidence: Number(finalScore.toFixed(4)),
      confidencePct: Number((finalScore * 100).toFixed(1)),
      probability: Number(mlScore.toFixed(4)),
      reason: getReason(candidate),
      topFeatures: getTopFactors(candidate),
      modelVariant,
      pipeline: 'unified_ml_pipeline_v1',
      heuristicScore: Number(heuristicScore.toFixed(4)),
      mlScore: Number((mlScore * 100).toFixed(2)),
    };

    return {
      ...candidate,
      recommendation,
    };
  });

  const ranked = merged
    .sort((a, b) => {
      const scoreDiff = toNumber(b.recommendation?.score, 0) - toNumber(a.recommendation?.score, 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const aDistance = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Number.POSITIVE_INFINITY;
      const bDistance = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Number.POSITIVE_INFINITY;
      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }

      const aName = String(a.name || a.title || a.foodName || '').toLowerCase();
      const bName = String(b.name || b.title || b.foodName || '').toLowerCase();
      return aName.localeCompare(bName);
    })
    .map((item, index) => ({
      ...item,
      recommendation: {
        ...item.recommendation,
        rank: index + 1,
        winnerTakeAllSelected: index === 0,
      },
    }));

  if (limit && limit > 0) {
    return ranked.slice(0, limit);
  }
  return ranked;
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
  const [iotContext, behaviorProfile] = await Promise.all([
    options.iotContext ||
      (user?.id
        ? iotService.getIoTContext(user.id, {
            user,
            exerciseSummary: options.exerciseSummary || null,
          })
        : Promise.resolve(null)),
    options.behaviorProfile ||
      (user?.id
        ? behaviorModelService.buildBehaviorProfile(user.id, {
            user,
            meals: history,
            lookbackDays: 45,
          })
        : Promise.resolve(null)),
  ]);

  if (modelVariant === 'ml') {
    const lastTrained = userModel.trainedAt ? new Date(userModel.trainedAt) : null;
    const isStale = !lastTrained || Number.isNaN(lastTrained.getTime()) || Date.now() - lastTrained.getTime() > 6 * 3600000;
    if (isStale) {
      try {
        userModel = await mlModelService.trainModel(user.id);
      } catch (_error) {
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

  const rescored = mlModelService.rescoreCandidatesWithModel(heuristicRanked, userModel, {
    modelVariant,
    experimentGroup,
    intent: options.intent || options.mode || 'delivery',
    remainingNutrition,
    behaviorProfile,
    iotContext,
    historyMeals: history,
  });

  const ranked = rankWithUnifiedPipeline(rescored, {
    modelVariant,
    limit: options.limit,
    getHeuristicScore: (candidate) => {
      const baseScore = toNumber(candidate.recommendation?.baseScore, NaN);
      if (Number.isFinite(baseScore)) {
        return clamp01(baseScore);
      }
      return clamp01(toNumber(candidate.recommendation?.score, 0) / 100);
    },
    getMlScore: (candidate) => toNumber(candidate.recommendation?.probability, 0),
    getReason: (candidate) =>
      candidate.recommendation?.reason ||
      candidate.recommendation?.message ||
      candidate.recommendation?.explanation ||
      'Balanced recommendation for your current nutrition context.',
    getTopFactors: (candidate) => candidate.recommendation?.topFeatures || [],
  });

  const optimized = optimizationService.optimizeRecommendations(ranked, {
    user,
    remainingNutrition,
    mode: options.intent || options.mode || 'delivery',
  });

  const enriched = optimized.map((candidate) => {
    const behaviorNote = behaviorProfile
      ? behaviorModelService.getBehaviorNoteForRecommendation(candidate, behaviorProfile, {
          intent: options.intent || options.mode || 'delivery',
        })
      : null;
    const anomalyNote = anomalyDetectionService.buildRecommendationAnomalyNote(candidate, {
      remainingNutrition,
    });

    return {
      ...candidate,
      behaviorInsight: behaviorNote,
      anomalyInsight: anomalyNote,
      recommendation: {
        ...candidate.recommendation,
        behaviorNote,
        behaviorInsight: behaviorNote,
        anomalyNote,
        anomalyInsight: anomalyNote,
      },
    };
  });

  const finalRanked = maybeApplyExploration(enriched, user, {
    intent: options.intent || options.mode || 'delivery',
    explorationEpsilon: options.explorationEpsilon,
  });

  const normalizedLimit = Number.isFinite(Number(options.limit))
    ? Math.max(1, Number(options.limit))
    : null;
  const bounded = normalizedLimit ? finalRanked.slice(0, normalizedLimit) : finalRanked;

  try {
    await mlModelService.logShownInteractions(user.id, bounded, {
      intent: options.intent || options.mode || 'delivery',
      keyword: options.keyword || null,
      mealType: options.mealType || null,
      modelVariant,
      experimentGroup,
    });
  } catch (_error) {
    // Recommendation telemetry should not fail request handling.
  }

  return bounded.map(attachOffsetSuggestion);
}

function inferMacroFocusFromRemaining(remaining = {}) {
  const entries = [
    { key: 'protein', value: toNumber(remaining.protein, 0) },
    { key: 'carbs', value: toNumber(remaining.carbs, 0) },
    { key: 'fats', value: toNumber(remaining.fats, 0) },
    { key: 'fiber', value: toNumber(remaining.fiber, 0) },
  ].sort((a, b) => b.value - a.value);
  return entries[0]?.key || 'balanced';
}

function inferMealTypeByClock() {
  const hour = new Date().getHours();
  if (hour < 11) {
    return 'breakfast';
  }
  if (hour < 16) {
    return 'lunch';
  }
  return 'dinner';
}

function canonicalFoodName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\((pre-workout|post-workout|small|regular|large|x-large|sm|md|lg|xl)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapFoodCandidatesForRanking(candidates = [], user = {}) {
  const allergies = Array.isArray(user.allergies) ? user.allergies : [];

  return candidates.map((item) => {
    const nutrition = {
      calories: toNumber(item.calories, 0),
      protein: toNumber(item.protein, 0),
      carbs: toNumber(item.carbs, 0),
      fats: toNumber(item.fats, 0),
      fiber: toNumber(item.fiber, 0),
      ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      dietTags: Array.isArray(item.dietTags) ? item.dietTags : [],
      servingSize: item.servingSize || '1 serving',
      tags: Array.isArray(item.tags) ? item.tags : [],
    };

    const allergyWarnings = detectAllergyWarnings(allergies, nutrition.ingredients);

    return {
      id: item.id,
      name: item.foodName,
      foodName: item.foodName,
      servingSize: item.servingSize,
      cuisineType: item.cuisine || 'global',
      sourceType: item.sourceType || 'food_dataset',
      brand: item.brand || null,
      tags: nutrition.tags,
      nutrition,
      allergyWarnings,
      distance: 0.2,
      reviewSnippet: 'ContextFit ranked from expanded food catalog.',
    };
  });
}

async function rankFoodRecommendations(user, nutritionContext = {}, options = {}) {
  const remaining = nutritionContext.remaining || nutritionContext || {};
  const macroFocus = options.macroFocus || inferMacroFocusFromRemaining(remaining);
  const mealType = options.mealType || inferMealTypeByClock();
  const preferredDiet =
    options.preferredDiet || user?.preferences?.preferredDiet || 'non-veg';
  const candidatePoolSize = Number.isFinite(Number(options.candidatePoolSize))
    ? Number(options.candidatePoolSize)
    : 220;
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 8;
  const preSelectionLimit = Math.max(limit * 6, 40);

  const foods = await foodDataProvider.getFoods({
    limit: candidatePoolSize,
    macroFocus,
    mealType,
    preferredDiet,
    query: options.query || '',
    timeOfDay: options.timeOfDay || null,
  });

  const mapped = mapFoodCandidatesForRanking(foods, user).filter((item) => {
    if (preferredDiet) {
      const diets = (item.nutrition?.dietTags || []).map((diet) => String(diet).toLowerCase());
      if (diets.length && !diets.includes(String(preferredDiet).toLowerCase())) {
        return false;
      }
    }
    return true;
  });

  if (!mapped.length) {
    return [];
  }

  const ranked = await rankResults(mapped, user, { remaining }, {
    ...options,
    intent: options.intent || 'eat_in',
    mealType,
    mode: options.mode || 'food',
    limit: preSelectionLimit,
  });

  const deduped = [];
  const seen = new Set();
  ranked.forEach((item) => {
    const key = canonicalFoodName(item.foodName || item.name);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(item);
  });

  if (!deduped.length) {
    return ranked;
  }

  return deduped.slice(0, limit);
}

module.exports = {
  rankResults,
  rankWithUnifiedPipeline,
  computeOffsetMiles,
  rankFoodRecommendations,
};
