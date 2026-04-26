const SCORE_WEIGHTS = Object.freeze({
  macroFit: 0.34,
  calorieFit: 0.28,
  preferenceFit: 0.22,
  feedbackFit: 0.16,
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function scoreWeights(feedbackProfile = {}) {
  const configured = feedbackProfile.adaptiveScoreWeights || {};
  const raw = Object.fromEntries(
    Object.keys(SCORE_WEIGHTS).map((key) => [
      key,
      Math.max(0.05, toNumber(configured[key], SCORE_WEIGHTS[key])),
    ])
  );
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0) || 1;

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, value / total])
  );
}

function affinityEntries(feedbackProfile = {}, key) {
  const affinities = feedbackProfile.preferenceAffinities || {};
  return Array.isArray(affinities[key]) ? affinities[key] : [];
}

function matchAffinity(entries = [], values = []) {
  const keys = new Set(values.map(normalizeText).filter(Boolean));
  if (!keys.size || !entries.length) {
    return null;
  }

  const matched = entries.filter((entry) => keys.has(normalizeText(entry.key)));
  if (!matched.length) {
    return null;
  }

  const average =
    matched.reduce((sum, entry) => sum + clamp(toNumber(entry.weight, 0), -1, 1), 0) /
    matched.length;
  return clamp(0.5 + average * 0.5, 0, 1);
}

function affinityFit(candidate = {}, feedbackProfile = {}) {
  const metadata = candidate.metadata || {};
  const itemFit = matchAffinity(affinityEntries(feedbackProfile, 'items'), [
    candidate.id,
    candidate.title,
    candidate.name,
    candidate.foodName,
    metadata.name,
    metadata.foodName,
  ]);
  const cuisineFit = matchAffinity(affinityEntries(feedbackProfile, 'cuisines'), [
    candidate.cuisine,
    candidate.cuisineType,
    metadata.cuisine,
  ]);
  const sourceFit = matchAffinity(affinityEntries(feedbackProfile, 'sources'), [
    candidate.sourceType,
    candidate.itemType,
    metadata.sourceType,
  ]);
  const tagFit = matchAffinity(affinityEntries(feedbackProfile, 'tags'), [
    ...normalizeList(candidate.tags),
    ...normalizeList(metadata.tags),
  ]);

  const values = [
    itemFit !== null ? { value: itemFit, weight: 0.42 } : null,
    cuisineFit !== null ? { value: cuisineFit, weight: 0.22 } : null,
    sourceFit !== null ? { value: sourceFit, weight: 0.16 } : null,
    tagFit !== null ? { value: tagFit, weight: 0.2 } : null,
  ].filter(Boolean);

  if (!values.length) {
    return 0.5;
  }

  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0) || 1;
  return clamp(
    values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight,
    0,
    1
  );
}

function macroValue(nutrition = {}, macroFocus = '') {
  const focus = normalizeText(macroFocus);
  if (focus === 'protein') {
    return toNumber(nutrition.protein, 0) / 45;
  }
  if (focus === 'carbs') {
    return toNumber(nutrition.carbs, 0) / 80;
  }
  if (focus === 'fats') {
    return 1 - Math.min(toNumber(nutrition.fats, 0) / 45, 1);
  }
  if (focus === 'fiber') {
    return toNumber(nutrition.fiber, 0) / 12;
  }
  return (
    toNumber(nutrition.protein, 0) / 45 +
    toNumber(nutrition.fiber, 0) / 12 +
    (1 - Math.min(toNumber(nutrition.fats, 0) / 50, 1))
  ) / 3;
}

function calorieFit(nutrition = {}, remaining = {}, calorieFlex = 0) {
  const calories = toNumber(nutrition.calories, 0);
  const target = Math.max(350, toNumber(remaining.calories, 650) + toNumber(calorieFlex, 0));
  const distance = Math.abs(calories - target);
  return clamp(1 - distance / Math.max(target, 1), 0, 1);
}

function preferenceFit(candidate = {}, preferences = {}) {
  const diet = normalizeText(preferences.preferredDiet);
  const cuisine = normalizeText(preferences.preferredCuisine);
  const candidateCuisine = normalizeText(candidate.cuisine || candidate.cuisineType);
  const dietTags = normalizeList(candidate.nutrition?.dietTags || candidate.tags).map(normalizeText);

  let score = 0.5;
  if (!diet || diet === 'non-veg' || dietTags.includes(diet)) {
    score += 0.25;
  }
  if (cuisine && candidateCuisine.includes(cuisine)) {
    score += 0.25;
  }
  return clamp(score, 0, 1);
}

function crossDomainFit(candidate = {}, crossDomain = {}) {
  const confidence = clamp(toNumber(crossDomain.transferConfidence, 0.5), 0, 1);
  const tags = new Set([
    ...normalizeList(candidate.tags),
    ...normalizeList(candidate.metadata?.tags),
  ].map(normalizeText));
  const preferredTags = normalizeList(crossDomain.preferredTags).map(normalizeText).filter(Boolean);
  const avoidTags = normalizeList(crossDomain.avoidTags).map(normalizeText).filter(Boolean);
  const preferredMatches = preferredTags.filter((tag) => tags.has(tag)).length;
  const avoidMatches = avoidTags.filter((tag) => tags.has(tag)).length;
  const preferredScore = preferredTags.length
    ? preferredMatches / Math.max(preferredTags.length, 1)
    : 0.5;
  const avoidPenalty = avoidTags.length
    ? avoidMatches / Math.max(avoidTags.length, 1)
    : 0;

  return clamp(0.5 + (preferredScore - 0.5) * confidence - avoidPenalty * 0.35, 0, 1);
}

function feedbackFit(candidate = {}, feedbackProfile = {}) {
  const acceptance = toNumber(feedbackProfile.acceptanceRate, 0.5);
  const saveRate = toNumber(feedbackProfile.saveRate, 0.2);
  const ignoreRate = toNumber(feedbackProfile.ignoreRate, 0.2);
  const base = acceptance * 0.6 + saveRate * 0.25 + (1 - ignoreRate) * 0.15;
  const title = normalizeText(candidate.title || candidate.name || candidate.foodName);
  const repeatBoost = title && toNumber(feedbackProfile.repeatSelectionRate, 0) > 0 ? 0.05 : 0;
  return clamp((base + repeatBoost) * 0.68 + affinityFit(candidate, feedbackProfile) * 0.32, 0, 1);
}

function scoreCandidate(candidate = {}, context = {}) {
  const nutrition = candidate.nutrition || {};
  const remaining = context.remaining || {};
  const macroFocus = context.macroFocus || context.crossDomain?.macroFocus || 'balanced';
  const crossDomainScore = crossDomainFit(candidate, context.crossDomain || {});
  const macroFit = clamp(macroValue(nutrition, macroFocus), 0, 1);

  const candidateAffinityFit = affinityFit(candidate, context.feedbackProfile || {});
  const factors = {
    macroFit: clamp(macroFit * 0.88 + crossDomainScore * 0.12, 0, 1),
    calorieFit: calorieFit(nutrition, remaining, context.crossDomain?.calorieFlex || 0),
    preferenceFit: preferenceFit(candidate, context.preferences || {}),
    feedbackFit: feedbackFit(candidate, context.feedbackProfile || {}),
    affinityFit: candidateAffinityFit,
    crossDomainFit: crossDomainScore,
  };
  const weights = scoreWeights(context.feedbackProfile || {});
  const score =
    factors.macroFit * weights.macroFit +
    factors.calorieFit * weights.calorieFit +
    factors.preferenceFit * weights.preferenceFit +
    factors.feedbackFit * weights.feedbackFit;
  const confidence = clamp(score, 0.05, 0.98);

  return {
    ...candidate,
    recommendation: {
      ...(candidate.recommendation || {}),
      score: Number((confidence * 100).toFixed(2)),
      confidence: Number(confidence.toFixed(4)),
      confidencePct: Number((confidence * 100).toFixed(1)),
      reason:
        candidate.recommendation?.reason ||
        `${macroFocus} fit with current nutrition targets and recent feedback.`,
      factors,
      features: {
        ...(candidate.recommendation?.features || {}),
        macroFit: factors.macroFit,
        calorieFit: factors.calorieFit,
        preferenceFit: factors.preferenceFit,
        feedbackFit: factors.feedbackFit,
        interactionAffinity: candidateAffinityFit,
        crossDomainFit: crossDomainScore,
      },
      adaptiveWeights: Object.fromEntries(
        Object.entries(weights).map(([key, value]) => [key, Number(value.toFixed(4))])
      ),
      modelVariant: 'rule',
      pipeline: 'lightweight_rule_scoring_v1',
    },
  };
}

function diversityKey(candidate = {}) {
  const metadata = candidate.metadata || {};
  return [
    candidate.itemType || metadata.sourceType || 'item',
    normalizeText(candidate.cuisine || candidate.cuisineType || metadata.cuisine || ''),
  ].join(':');
}

function selectDiverseCandidates(ranked = [], limit = 8) {
  const safeLimit = Math.max(1, toNumber(limit, 8));
  const targetDiverseCount = Math.min(safeLimit, 5);
  const selected = [];
  const selectedIds = new Set();
  const selectedTypes = new Set();

  ranked.forEach((candidate) => {
    if (selected.length >= targetDiverseCount) {
      return;
    }
    const key = diversityKey(candidate);
    const id = String(candidate.id || candidate.title || candidate.name || '').toLowerCase();
    if (selectedIds.has(id) || selectedTypes.has(key)) {
      return;
    }
    selectedIds.add(id);
    selectedTypes.add(key);
    selected.push(candidate);
  });

  ranked.forEach((candidate) => {
    if (selected.length >= safeLimit) {
      return;
    }
    const id = String(candidate.id || candidate.title || candidate.name || '').toLowerCase();
    if (selectedIds.has(id)) {
      return;
    }
    selectedIds.add(id);
    selected.push(candidate);
  });

  return selected;
}

function scoreCandidates(candidates = [], context = {}, limit = 8) {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => scoreCandidate(candidate, context))
    .sort((a, b) => {
      const scoreDiff = toNumber(b.recommendation?.score, 0) - toNumber(a.recommendation?.score, 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
    });

  return selectDiverseCandidates(ranked, limit).map((candidate, index) => ({
    ...candidate,
    recommendation: {
      ...candidate.recommendation,
      rank: index + 1,
      winnerTakeAllSelected: index === 0,
    },
  }));
}

module.exports = {
  scoreCandidate,
  scoreCandidates,
};
