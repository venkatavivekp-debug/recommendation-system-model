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

const DEFAULT_OBJECTIVE_WEIGHTS = {
  calorieFit: 0.22,
  macroFit: 0.24,
  preferenceFit: 0.18,
  convenienceFit: 0.15,
  allergySafety: 0.16,
  costFit: 0.05,
};

function safeWeights(input = {}) {
  const weights = {
    calorieFit: toNumber(input.calorieFit, DEFAULT_OBJECTIVE_WEIGHTS.calorieFit),
    macroFit: toNumber(input.macroFit, DEFAULT_OBJECTIVE_WEIGHTS.macroFit),
    preferenceFit: toNumber(input.preferenceFit, DEFAULT_OBJECTIVE_WEIGHTS.preferenceFit),
    convenienceFit: toNumber(input.convenienceFit, DEFAULT_OBJECTIVE_WEIGHTS.convenienceFit),
    allergySafety: toNumber(input.allergySafety, DEFAULT_OBJECTIVE_WEIGHTS.allergySafety),
    costFit: toNumber(input.costFit, DEFAULT_OBJECTIVE_WEIGHTS.costFit),
  };

  const sum = Object.values(weights).reduce((acc, value) => acc + Math.max(0, value), 0) || 1;
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, round(Math.max(0, value) / sum, 6)])
  );
}

function distanceScore(distanceMiles) {
  if (!Number.isFinite(toNumber(distanceMiles, NaN))) {
    return 0.55;
  }
  return clamp01(1 - toNumber(distanceMiles, 0) / 15);
}

function costScore(candidate = {}) {
  if (Number.isFinite(toNumber(candidate.estimatedCost, NaN))) {
    const cost = toNumber(candidate.estimatedCost, 0);
    return clamp01(1 - cost / 25);
  }

  if (Number.isFinite(toNumber(candidate.priceLevel, NaN))) {
    const level = clamp(toNumber(candidate.priceLevel, 2), 0, 4);
    return clamp01(1 - level / 4);
  }

  return 0.5;
}

function objectiveVector(candidate = {}, context = {}) {
  const rec = candidate.recommendation || {};
  const features = rec.features || {};

  const calorieFit = clamp01(features.calorieFit ?? rec.factors?.calorieFit ?? 0);
  const macroFit = clamp01(features.macroMatch ?? rec.factors?.proteinMatch ?? 0);
  const preferenceFit = clamp01(features.userPreference ?? rec.factors?.preferenceMatch ?? 0);
  const convenienceFit = clamp01(features.proximityScore ?? rec.factors?.distanceScore ?? distanceScore(candidate.distance));
  const allergySafety = Array.isArray(candidate.allergyWarnings) && candidate.allergyWarnings.length ? 0 : 1;
  const costFit = costScore(candidate);

  return {
    calorieFit,
    macroFit,
    preferenceFit,
    convenienceFit,
    allergySafety,
    costFit,
  };
}

function buildOptimizationReason(contributions = []) {
  const labels = {
    calorieFit: 'calorie fit',
    macroFit: 'macro balance',
    preferenceFit: 'preference alignment',
    convenienceFit: 'convenience',
    allergySafety: 'allergy safety',
    costFit: 'cost efficiency',
  };

  const top = (contributions || [])
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((item) => labels[item.name] || item.name);

  if (!top.length) {
    return 'Balanced multi-objective fit.';
  }

  if (top.length === 1) {
    return `Best balance focused on ${top[0]}.`;
  }

  return `Best balance of ${top.join(', ')}.`;
}

function optimizeRecommendations(candidates = [], context = {}) {
  const weights = safeWeights(context.weights || {});

  const optimized = (candidates || []).map((candidate) => {
    const vector = objectiveVector(candidate, context);
    const weightedScore =
      vector.calorieFit * weights.calorieFit +
      vector.macroFit * weights.macroFit +
      vector.preferenceFit * weights.preferenceFit +
      vector.convenienceFit * weights.convenienceFit +
      vector.allergySafety * weights.allergySafety +
      vector.costFit * weights.costFit;

    const baseScore = clamp01(toNumber(candidate.recommendation?.score, 0) / 100);
    const finalScore = clamp01((baseScore * 0.7) + (weightedScore * 0.3));

    const contributions = Object.keys(vector).map((name) => ({
      name,
      value: round(vector[name] * weights[name], 4),
    }));
    const optimizationReason = buildOptimizationReason(contributions);

    return {
      ...candidate,
      recommendation: {
        ...(candidate.recommendation || {}),
        score: round(finalScore * 100, 2),
        confidence: round(finalScore, 4),
        confidencePct: round(finalScore * 100, 1),
        reason: candidate.recommendation?.reason || optimizationReason,
        optimization: {
          weightedScore: round(weightedScore, 4),
          baseScore: round(baseScore, 4),
          finalScore: round(finalScore, 4),
          weights,
          objectiveVector: Object.fromEntries(
            Object.entries(vector).map(([key, value]) => [key, round(value, 4)])
          ),
          topObjectives: contributions
            .slice()
            .sort((a, b) => b.value - a.value)
            .slice(0, 3),
          message: optimizationReason,
        },
      },
    };
  });

  return optimized
    .sort((a, b) => {
      const scoreDiff = toNumber(b.recommendation?.score, 0) - toNumber(a.recommendation?.score, 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const aDistance = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Number.POSITIVE_INFINITY;
      const bDistance = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    })
    .map((item, index) => ({
      ...item,
      recommendation: {
        ...item.recommendation,
        rank: index + 1,
        winnerTakeAllSelected: index === 0,
      },
    }));
}

module.exports = {
  DEFAULT_OBJECTIVE_WEIGHTS,
  optimizeRecommendations,
};
