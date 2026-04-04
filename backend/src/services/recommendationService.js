const mealService = require('./mealService');
const recommendationEngine = require('./recommendationEngine');
const mlService = require('./mlService');
const mlModelService = require('./mlModelService');
const behaviorModelService = require('./behaviorModelService');
const anomalyDetectionService = require('./anomalyDetectionService');
const optimizationService = require('./optimizationService');

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
  });

  const ranked = rankWithUnifiedPipeline(rescored, {
    modelVariant,
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

  const behaviorProfile =
    options.behaviorProfile ||
    (user?.id
      ? await behaviorModelService.buildBehaviorProfile(user.id, {
          user,
          meals: history,
          lookbackDays: 45,
        })
      : null);

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
      recommendation: {
        ...candidate.recommendation,
        behaviorNote,
        anomalyNote,
      },
    };
  });

  try {
    await mlModelService.logShownInteractions(user.id, enriched, {
      intent: options.intent || options.mode || 'delivery',
      keyword: options.keyword || null,
      mealType: options.mealType || null,
      modelVariant,
      experimentGroup,
    });
  } catch (_error) {
    // Recommendation telemetry should not fail request handling.
  }

  return enriched.map(attachOffsetSuggestion);
}

module.exports = {
  rankResults,
  rankWithUnifiedPipeline,
  computeOffsetMiles,
};
