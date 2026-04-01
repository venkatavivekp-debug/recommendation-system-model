const { normalizePreferences } = require('./userDefaultsService');

const DEFAULT_RECOMMENDATION_WEIGHTS = {
  macroMatch: 0.28,
  calorieFit: 0.2,
  userPreference: 0.16,
  historyScore: 0.16,
  goalAlignment: 0.16,
  allergyPenalty: 0.3,
};

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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRemaining(remainingNutrition = {}) {
  return {
    calories: toNumber(remainingNutrition.calories, 0),
    protein: toNumber(remainingNutrition.protein, 0),
    carbs: toNumber(remainingNutrition.carbs, 0),
    fats: toNumber(remainingNutrition.fats, 0),
    fiber: toNumber(remainingNutrition.fiber, 0),
  };
}

function normalizeCandidate(candidate = {}) {
  const nutrition = candidate.nutrition || candidate.nutritionEstimate || {};

  return {
    id: candidate.placeId || candidate.id || candidate.name || `candidate-${Date.now()}`,
    name: candidate.name || candidate.restaurantName || '',
    foodName: candidate.foodName || candidate.suggestedMeal || '',
    cuisineType: candidate.cuisineType || candidate.cuisine || '',
    distance: Number.isFinite(Number(candidate.distance)) ? Number(candidate.distance) : null,
    calories: toNumber(nutrition.calories, 0),
    protein: toNumber(nutrition.protein, 0),
    carbs: toNumber(nutrition.carbs, 0),
    fats: toNumber(nutrition.fats, 0),
    fiber: toNumber(nutrition.fiber, 0),
    dietTags: Array.isArray(nutrition.dietTags) ? nutrition.dietTags.map((item) => normalizeText(item)) : [],
    ingredients: Array.isArray(nutrition.ingredients) ? nutrition.ingredients : [],
    allergyWarnings: Array.isArray(candidate.allergyWarnings) ? candidate.allergyWarnings : [],
  };
}

function buildTokenSet(text) {
  return Array.from(
    new Set(
      normalizeText(text)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3)
    )
  );
}

function recencyDecay(daysAgo) {
  if (daysAgo <= 7) {
    return 1;
  }

  if (daysAgo <= 30) {
    return 0.6;
  }

  return 0.3;
}

function buildUserBehaviorProfile(interactions = [], nowDate = new Date()) {
  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const scores = new Map();
  let maxScore = 0;

  interactions.forEach((item) => {
    const interactionDate = item?.createdAt ? new Date(item.createdAt) : now;
    const msDiff = Math.max(0, now.getTime() - interactionDate.getTime());
    const daysAgo = Math.floor(msDiff / 86400000);
    const decay = recencyDecay(daysAgo);
    const interactionWeight = clamp(1 + toNumber(item.calories, 0) / 900, 0.8, 1.8);

    const text = [item.foodName, item.brand, item.sourceType, item.source].filter(Boolean).join(' ');
    const tokens = buildTokenSet(text);

    tokens.forEach((token) => {
      const next = toNumber(scores.get(token), 0) + interactionWeight * decay;
      scores.set(token, next);
      if (next > maxScore) {
        maxScore = next;
      }
    });
  });

  return {
    tokenScores: scores,
    maxTokenScore: maxScore || 1,
  };
}

function macroFit(itemMacro, remainingMacro, baseline) {
  const itemValue = Math.max(0, toNumber(itemMacro, 0));
  const remainingValue = toNumber(remainingMacro, 0);

  if (remainingValue <= 0) {
    return clamp01(1 - itemValue / (baseline * 2));
  }

  const deviation = Math.abs(itemValue - remainingValue);
  return clamp01(1 - deviation / Math.max(remainingValue, baseline));
}

function computeMacroMatch(candidate, remaining) {
  const needs = {
    protein: Math.max(0, remaining.protein),
    carbs: Math.max(0, remaining.carbs),
    fats: Math.max(0, remaining.fats),
  };

  const needTotal = needs.protein + needs.carbs + needs.fats;

  const proteinWeight = needTotal > 0 ? needs.protein / needTotal : 1 / 3;
  const carbsWeight = needTotal > 0 ? needs.carbs / needTotal : 1 / 3;
  const fatsWeight = needTotal > 0 ? needs.fats / needTotal : 1 / 3;

  const proteinFit = macroFit(candidate.protein, remaining.protein, 24);
  const carbsFit = macroFit(candidate.carbs, remaining.carbs, 35);
  const fatsFit = macroFit(candidate.fats, remaining.fats, 14);

  return clamp01(proteinFit * proteinWeight + carbsFit * carbsWeight + fatsFit * fatsWeight);
}

function computeCalorieFit(candidate, remaining) {
  const calories = Math.max(0, candidate.calories);
  const remainingCalories = toNumber(remaining.calories, 0);

  if (remainingCalories < 0) {
    return clamp01(1 - calories / 650);
  }

  const targetMealCalories = clamp(remainingCalories * 0.75, 150, 900);
  let score = clamp01(1 - Math.abs(calories - targetMealCalories) / Math.max(targetMealCalories, 220));

  if (calories > remainingCalories + 120) {
    score *= 0.45;
  } else if (calories <= remainingCalories + 60) {
    score = clamp01(score + 0.12);
  }

  return clamp01(score);
}

function computeUserPreference(candidate, preferences) {
  const preferredDiet = normalizeText(preferences.preferredDiet || 'non-veg');
  const preferredCuisine = normalizeText(preferences.preferredCuisine || '');
  const itemCuisine = normalizeText(candidate.cuisineType);
  const dietTags = new Set(candidate.dietTags);

  let dietScore = 0.75;
  if (preferredDiet === 'veg' || preferredDiet === 'vegan') {
    dietScore = dietTags.has(preferredDiet) ? 1 : 0.1;
  } else if (dietTags.has('non-veg')) {
    dietScore = 1;
  }

  const cuisineScore = preferredCuisine
    ? itemCuisine.includes(preferredCuisine)
      ? 1
      : 0.25
    : 0.7;

  const distanceScore = Number.isFinite(candidate.distance)
    ? clamp01(1 - candidate.distance / 20)
    : 0.55;

  return clamp01(dietScore * 0.5 + cuisineScore * 0.35 + distanceScore * 0.15);
}

function computeHistoryScore(candidate, historyProfile) {
  const tokens = buildTokenSet([candidate.foodName, candidate.name, candidate.cuisineType].join(' '));

  if (!tokens.length || !historyProfile?.tokenScores) {
    return 0.3;
  }

  const weighted = tokens.map((token) => toNumber(historyProfile.tokenScores.get(token), 0));
  const strongestMatch = Math.max(0, ...weighted);

  if (strongestMatch <= 0) {
    return 0.22;
  }

  return clamp01(strongestMatch / Math.max(historyProfile.maxTokenScore || 1, 1));
}

function computeGoalAlignment(candidate, preferences) {
  const fitnessGoal = normalizeText(preferences.fitnessGoal || 'maintain');
  const calories = Math.max(0, candidate.calories);
  const protein = Math.max(0, candidate.protein);
  const carbs = Math.max(0, candidate.carbs);
  const fats = Math.max(0, candidate.fats);

  if (fitnessGoal === 'lose-weight') {
    const proteinDensity = clamp01((protein * 4) / Math.max(calories, 1));
    const calorieLightness = clamp01(1 - calories / 900);
    return clamp01(proteinDensity * 0.55 + calorieLightness * 0.45);
  }

  if (fitnessGoal === 'gain-muscle') {
    const proteinScore = clamp01(protein / 55);
    const calorieBand = clamp01(1 - Math.abs(calories - 650) / 650);
    return clamp01(proteinScore * 0.6 + calorieBand * 0.4);
  }

  const calorieBalance = clamp01(1 - Math.abs(calories - 550) / 550);
  const macroTotal = protein + carbs + fats;
  const proteinShare = macroTotal > 0 ? protein / macroTotal : 0.33;
  const balanceScore = clamp01(1 - Math.abs(proteinShare - 0.32) / 0.32);
  return clamp01(calorieBalance * 0.55 + balanceScore * 0.45);
}

function computeAllergyPenalty(candidate) {
  return Array.isArray(candidate.allergyWarnings) && candidate.allergyWarnings.length ? 1 : 0;
}

function dominantRemainingMacro(remaining) {
  const entries = [
    { key: 'protein', value: toNumber(remaining.protein, 0) },
    { key: 'carbs', value: toNumber(remaining.carbs, 0) },
    { key: 'fats', value: toNumber(remaining.fats, 0) },
    { key: 'fiber', value: toNumber(remaining.fiber, 0) },
  ];

  entries.sort((a, b) => b.value - a.value);
  return entries[0]?.key || 'protein';
}

function buildExplanation({ features, candidate, remaining, preferences }) {
  const notes = [];

  if (features.allergyPenalty > 0) {
    notes.push('Contains allergen signals from your profile. Review ingredients before selecting.');
  }

  if (features.macroMatch >= 0.75) {
    const dominantMacro = dominantRemainingMacro(remaining);
    if (dominantMacro === 'protein') {
      notes.push('High protein match for your remaining macro target.');
    } else if (dominantMacro === 'carbs') {
      notes.push('Good fit for your remaining carb target.');
    } else if (dominantMacro === 'fats') {
      notes.push('Helps close your remaining healthy fats target.');
    } else {
      notes.push('Supports your remaining macro balance for today.');
    }
  }

  if (features.calorieFit >= 0.72) {
    notes.push('Fits your remaining calorie budget for the day.');
  }

  if (features.userPreference >= 0.72) {
    notes.push('Matches your saved diet and cuisine preferences.');
  }

  if (features.historyScore >= 0.68) {
    notes.push('Similar to foods you selected recently.');
  }

  if (features.goalAlignment >= 0.72) {
    const goal = normalizeText(preferences.fitnessGoal || 'maintain');
    if (goal === 'lose-weight') {
      notes.push('Low calorie option for weight-loss alignment.');
    } else if (goal === 'gain-muscle') {
      notes.push('Supports muscle-focused eating with stronger protein density.');
    } else {
      notes.push('Balanced option for maintenance goals.');
    }
  }

  if (!notes.length) {
    if (Number.isFinite(candidate.distance) && candidate.distance <= 1.5) {
      notes.push('Closer option with balanced nutrition.');
    } else {
      notes.push('Balanced option for your current targets.');
    }
  }

  return {
    message: notes[0],
    details: notes,
  };
}

function mergeWeights(customWeights = {}) {
  return {
    ...DEFAULT_RECOMMENDATION_WEIGHTS,
    ...Object.fromEntries(
      Object.entries(customWeights || {}).map(([key, value]) => [key, toNumber(value, DEFAULT_RECOMMENDATION_WEIGHTS[key])])
    ),
  };
}

function scoreCandidate(candidateInput, context = {}) {
  const candidate = normalizeCandidate(candidateInput);
  const preferences = normalizePreferences(context.user?.preferences || {});
  const remaining = normalizeRemaining(context.remainingNutrition || {});
  const historyProfile = context.historyProfile || buildUserBehaviorProfile(context.history || []);
  const weights = mergeWeights(context.weights);

  const features = {
    macroMatch: computeMacroMatch(candidate, remaining),
    calorieFit: computeCalorieFit(candidate, remaining),
    userPreference: computeUserPreference(candidate, preferences),
    historyScore: computeHistoryScore(candidate, historyProfile),
    goalAlignment: computeGoalAlignment(candidate, preferences),
    allergyPenalty: computeAllergyPenalty(candidate),
  };

  const positiveWeightTotal =
    weights.macroMatch +
    weights.calorieFit +
    weights.userPreference +
    weights.historyScore +
    weights.goalAlignment;

  const rawScore =
    weights.macroMatch * features.macroMatch +
    weights.calorieFit * features.calorieFit +
    weights.userPreference * features.userPreference +
    weights.historyScore * features.historyScore +
    weights.goalAlignment * features.goalAlignment -
    weights.allergyPenalty * features.allergyPenalty;

  const normalizedScore = clamp01(
    (rawScore + weights.allergyPenalty) /
      Math.max(positiveWeightTotal + weights.allergyPenalty, 0.0001)
  );

  const explanation = buildExplanation({
    features,
    candidate,
    remaining,
    preferences,
  });

  return {
    score: round(normalizedScore * 100, 2),
    normalizedScore: round(normalizedScore, 4),
    features: {
      macroMatch: round(features.macroMatch),
      calorieFit: round(features.calorieFit),
      userPreference: round(features.userPreference),
      historyScore: round(features.historyScore),
      goalAlignment: round(features.goalAlignment),
      allergyPenalty: round(features.allergyPenalty),
    },
    message: explanation.message,
    details: explanation.details,
    weightsUsed: weights,
  };
}

function rankCandidates(candidates = [], context = {}) {
  const historyProfile = context.historyProfile || buildUserBehaviorProfile(context.history || []);

  const scored = candidates.map((candidate) => {
    const recommendation = scoreCandidate(candidate, {
      ...context,
      historyProfile,
    });

    return {
      ...candidate,
      recommendation,
    };
  });

  return scored.sort((a, b) => b.recommendation.score - a.recommendation.score);
}

module.exports = {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  buildUserBehaviorProfile,
  scoreCandidate,
  rankCandidates,
};
