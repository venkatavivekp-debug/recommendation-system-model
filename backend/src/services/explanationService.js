function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 3) {
  return Number(Number(value || 0).toFixed(decimals));
}

function normalizeContributionFactors(factors = [], limit = 3) {
  const safeFactors = (Array.isArray(factors) ? factors : [])
    .map((factor) => ({
      name: String(factor?.name || '').trim(),
      value: Math.abs(toNumber(factor?.contribution ?? factor?.rawContribution ?? 0, 0)),
    }))
    .filter((factor) => factor.name)
    .slice(0, Math.max(1, limit));

  if (!safeFactors.length) {
    return [];
  }

  const total = safeFactors.reduce((sum, factor) => sum + factor.value, 0);
  if (total <= 0) {
    return safeFactors.map((factor) => ({
      name: factor.name,
      contribution: 0,
      contributionPct: 0,
    }));
  }

  const normalized = safeFactors.map((factor) => {
    const ratio = factor.value / total;
    return {
      name: factor.name,
      contribution: round(ratio, 4),
      contributionPct: round(ratio * 100, 1),
    };
  });

  const pctSum = normalized.reduce((sum, factor) => sum + toNumber(factor.contributionPct, 0), 0);
  const delta = round(100 - pctSum, 1);

  if (Math.abs(delta) > 0.1 && normalized.length) {
    const maxIndex = normalized.reduce(
      (bestIndex, factor, index, list) =>
        toNumber(factor.contributionPct, 0) > toNumber(list[bestIndex].contributionPct, 0)
          ? index
          : bestIndex,
      0
    );
    normalized[maxIndex] = {
      ...normalized[maxIndex],
      contributionPct: round(
        clamp(toNumber(normalized[maxIndex].contributionPct, 0) + delta, 0, 100),
        1
      ),
    };
    const pctTotal = normalized.reduce((sum, factor) => sum + toNumber(factor.contributionPct, 0), 0);
    normalized[maxIndex].contributionPct = round(
      clamp(
        toNumber(normalized[maxIndex].contributionPct, 0) + round(100 - pctTotal, 1),
        0,
        100
      ),
      1
    );
  }

  return normalized;
}

function mapFactorLabel(name) {
  const labels = {
    proteinMatch: 'protein target fit',
    calorieFit: 'calorie fit',
    preferenceMatch: 'preference alignment',
    distanceScore: 'distance convenience',
    historySimilarity: 'history similarity',
    allergySafe: 'allergy safety',
    mealContextFit: 'meal-context fit',
    macroGapFit: 'macro gap fit',
    activityLevel: 'activity awareness',
    interactionAffinity: 'interaction affinity',
    timeOfDay: 'time-of-day fit',
    dayOfWeek: 'weekday/weekend fit',
    recentBehaviorTrend: 'recent behavior trend',
    genreMatch: 'genre fit',
    moodMatch: 'mood fit',
    durationFit: 'duration fit',
    contextFit: 'context fit',
    timeOfDayFit: 'time-of-day fit',
    activityFit: 'activity fit',
  };

  return labels[name] || name;
}

function buildReasonFromFactors(topFactors = [], fallbackReason = '') {
  const factors = normalizeContributionFactors(topFactors, 3);
  const labels = factors.map((factor) => mapFactorLabel(factor.name));

  if (!labels.length) {
    return fallbackReason || 'Balanced recommendation for your current context.';
  }
  if (labels.length === 1) {
    return `Best match based on ${labels[0]}.`;
  }
  if (labels.length === 2) {
    return `Best match based on ${labels[0]} and ${labels[1]}.`;
  }

  return `Best match based on ${labels[0]}, ${labels[1]}, and ${labels[2]}.`;
}

function enrichRecommendation(candidate = {}, options = {}) {
  const recommendation = candidate.recommendation || {};
  const normalizedTopFeatures = normalizeContributionFactors(
    recommendation.topFeatures || candidate.topFactors || [],
    3
  );
  const confidence = clamp(
    toNumber(recommendation.confidence ?? candidate.confidence, 0),
    0,
    1
  );
  const reason = buildReasonFromFactors(
    normalizedTopFeatures,
    recommendation.reason || candidate.reason || options.fallbackReason || ''
  );

  return {
    ...candidate,
    topFactors: normalizedTopFeatures,
    reason,
    confidence,
    confidencePct: round(confidence * 100, 1),
    recommendation: {
      ...recommendation,
      topFeatures: normalizedTopFeatures,
      reason,
      explanation: reason,
      confidence,
      confidencePct: round(confidence * 100, 1),
    },
  };
}

function enrichRecommendationList(candidates = [], options = {}) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) =>
    enrichRecommendation(candidate, options)
  );
}

module.exports = {
  normalizeContributionFactors,
  buildReasonFromFactors,
  enrichRecommendation,
  enrichRecommendationList,
};
