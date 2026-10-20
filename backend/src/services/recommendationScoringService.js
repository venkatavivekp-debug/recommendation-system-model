const { itemFeedback } = require('./feedbackLearningService');
const { canonicalFoodName } = require('./foodLookupService');

const SCORE_WEIGHTS = Object.freeze({
  macroFit: 0.34,
  calorieFit: 0.28,
  preferenceFit: 0.22,
  feedbackFit: 0.16,
});

// This service is intentionally heuristic: it blends nutrition fit, preferences,
// cross-domain context, and stored feedback without claiming a trained neural model.

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
  const exactItem = itemFeedback(candidate, feedbackProfile);
  const itemFit = Object.keys(feedbackProfile.itemPreferences || {}).length
    ? (Object.hasOwn(exactItem, 'negatives') ? clamp(0.5 + exactItem.weight * 0.5, 0, 1) : null)
    : matchAffinity(affinityEntries(feedbackProfile, 'items'), [
    candidate.id,
    candidate.placeId,
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
  const ingredientFit = matchAffinity(affinityEntries(feedbackProfile, 'ingredients'), [
    ...normalizeList(candidate.ingredients),
    ...normalizeList(metadata.ingredients),
  ]);

  const values = [
    itemFit !== null ? { value: itemFit, weight: 0.4 } : null,
    cuisineFit !== null ? { value: cuisineFit, weight: 0.2 } : null,
    sourceFit !== null ? { value: sourceFit, weight: 0.1 } : null,
    tagFit !== null ? { value: tagFit, weight: 0.15 } : null,
    ingredientFit !== null ? { value: ingredientFit, weight: 0.15 } : null,
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

function sessionIntentFit(candidate = {}, preference = '') {
  const terms = String(preference || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  if (!terms.length) return null;

  const metadata = candidate.metadata || {};
  const candidateTerms = new Set(
    [
      candidate.title, candidate.name, candidate.foodName, candidate.cuisine,
      ...normalizeList(candidate.ingredients), ...normalizeList(candidate.tags),
      ...normalizeList(candidate.nutrition?.dietTags), ...normalizeList(metadata.ingredients),
      ...normalizeList(metadata.tags),
    ]
      .join(' ')
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  );
  const matched = terms.filter((term) => {
    if (term === 'vegetarian') return candidateTerms.has('vegetarian') || candidateTerms.has('veg');
    if (term.startsWith('carb')) return [...candidateTerms].some((value) => value.startsWith('carb'));
    return candidateTerms.has(term);
  }).length;

  return matched / terms.length;
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
  // Only unversioned historical feedback retains its prior. New actions train LinUCB.
  return affinityFit(candidate, feedbackProfile.legacyProfile || feedbackProfile);
}

function foodReason(candidate, context, factors) {
  const nutrition = candidate.nutrition || {};
  const cuisine = candidate.cuisine || candidate.cuisineType || '';
  const ingredients = normalizeList(candidate.ingredients).map(normalizeText);
  const learnedIngredient = affinityEntries(context.feedbackProfile, 'ingredients')
    .find((entry) => entry.weight > 0 && ingredients.includes(normalizeText(entry.key)));
  const learnedCuisine = matchAffinity(affinityEntries(context.feedbackProfile, 'cuisines'), [cuisine]);
  const preference = factors.sessionIntentFit > 0.5
    ? `${context.sessionIntent.foodPreference.trim()} matches what you asked for this session.`
    : factors.affinityFit > 0.5 && learnedIngredient
      ? `${learnedIngredient.key} matches your recent selections.`
      : factors.affinityFit > 0.5 && learnedCuisine > 0.5
        ? `${cuisine} matches your recent selections.`
        : context.preferences?.preferredCuisine && normalizeText(cuisine).includes(normalizeText(context.preferences.preferredCuisine))
          ? `${cuisine} cuisine matches your profile.` : '';
  const session = context.crossDomain?.workoutContext?.sessionClass;
  const nutritionReason = session === 'strength_recovery' && nutrition.protein >= 25
    ? `${Math.round(nutrition.protein)} g protein fits your strength recovery.`
    : session === 'long_endurance' && nutrition.carbs >= 45
      ? `${Math.round(nutrition.carbs)} g of carbohydrates fits the recovery focus after your longer run.`
      : factors.calorieFit >= 0.8 ? 'Fits your remaining calorie target.'
        : nutrition.protein >= 25 ? `Provides ${Math.round(nutrition.protein)} g protein toward your daily target.`
          : 'An option for your current nutrition targets.';
  const reason = [preference, nutritionReason].filter(Boolean).join(' ');
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

function scoreCandidate(candidate = {}, context = {}) {
  const nutrition = candidate.nutrition || {};
  const remaining = context.remaining || {};
  const macroFocus = context.macroFocus || context.crossDomain?.macroFocus || 'balanced';
  const crossDomainScore = crossDomainFit(candidate, context.crossDomain || {});
  const macroFit = clamp(macroValue(nutrition, macroFocus), 0, 1);
  const currentIntentFit = sessionIntentFit(candidate, context.sessionIntent?.foodPreference);

  const candidateAffinityFit = affinityFit(candidate, context.feedbackProfile || {});
  const factors = {
    macroFit: clamp(macroFit * 0.88 + crossDomainScore * 0.12, 0, 1),
    calorieFit: calorieFit(nutrition, remaining, context.crossDomain?.calorieFlex || 0),
    preferenceFit: preferenceFit(candidate, context.preferences || {}),
    feedbackFit: feedbackFit(candidate, context.feedbackProfile || {}),
    affinityFit: candidateAffinityFit,
    crossDomainFit: crossDomainScore,
    ...(currentIntentFit === null ? {} : { sessionIntentFit: currentIntentFit }),
  };
  const weights = SCORE_WEIGHTS;
  const baseScore =
    factors.macroFit * weights.macroFit +
    factors.calorieFit * weights.calorieFit +
    factors.preferenceFit * weights.preferenceFit +
    factors.feedbackFit * weights.feedbackFit;
  const score = currentIntentFit === null
    ? baseScore
    : baseScore * 0.68 + currentIntentFit * 0.32;
  const confidence = clamp(score, 0.05, 0.98);

  return {
    ...candidate,
    recommendation: {
      ...(candidate.recommendation || {}),
      score: Number((confidence * 100).toFixed(2)),
      confidence: Number(confidence.toFixed(4)),
      confidencePct: Number((confidence * 100).toFixed(1)),
      reason: foodReason(candidate, context, factors),
      factors,
      scoreTrace: {
        baseScore: confidence,
        baseRelevance: (factors.calorieFit * weights.calorieFit + 0.5 * 0.12 * weights.macroFit) * (currentIntentFit === null ? 1 : 0.68) + confidence - score,
        preferenceContribution: factors.preferenceFit * weights.preferenceFit * (currentIntentFit === null ? 1 : 0.68),
        feedbackContribution: factors.feedbackFit * weights.feedbackFit * (currentIntentFit === null ? 1 : 0.68),
        contextContribution: macroFit * 0.88 * weights.macroFit * (currentIntentFit === null ? 1 : 0.68) + (currentIntentFit === null ? 0 : currentIntentFit * 0.32),
        crossDomainContextContribution: (crossDomainScore - 0.5) * 0.12 * weights.macroFit * (currentIntentFit === null ? 1 : 0.68),
      },
      features: {
        ...(candidate.recommendation?.features || {}),
        macroFit: factors.macroFit,
        calorieFit: factors.calorieFit,
        preferenceFit: factors.preferenceFit,
        feedbackFit: factors.feedbackFit,
        interactionAffinity: candidateAffinityFit,
        crossDomainFit: crossDomainScore,
        ...(currentIntentFit === null ? {} : { sessionIntentFit: currentIntentFit }),
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
  if (candidate.itemType === 'restaurant') return `restaurant:${candidate.id}`;
  return canonicalFoodName(candidate.baseFoodName || metadata.baseFoodName || candidate.title || candidate.foodName || candidate.name) || candidate.id;
}

function selectDiverseCandidates(ranked = [], limit = 8) {
  const safeLimit = Math.max(1, toNumber(limit, 8));
  const selected = [];
  const selectedIds = new Set();
  const selectedTypes = new Set();

  ranked.forEach((candidate) => {
    if (selected.length >= safeLimit) {
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

  return selected.map((candidate, index) => ({
    ...candidate,
    recommendation: { ...candidate.recommendation, rank: index + 1, winnerTakeAllSelected: index === 0 },
  }));
}

function scoreCandidates(candidates = [], context = {}, limit = 8, { diversify = true } = {}) {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => !itemFeedback(candidate, context.feedbackProfile).suppressed)
    .map((candidate) => scoreCandidate(candidate, context))
    .sort((a, b) => {
      const scoreDiff = toNumber(b.recommendation?.score, 0) - toNumber(a.recommendation?.score, 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
    });

  if (diversify) return selectDiverseCandidates(ranked, limit);
  return ranked.slice(0, limit).map((candidate, index) => ({
    ...candidate,
    recommendation: {
      ...candidate.recommendation,
      rank: index + 1,
      winnerTakeAllSelected: index === 0,
    },
  }));
}

module.exports = {
  affinityFit,
  sessionIntentFit,
  scoreCandidate,
  scoreCandidates,
  selectDiverseCandidates,
};
