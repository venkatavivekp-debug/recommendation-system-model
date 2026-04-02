const { normalizePreferences } = require('./userDefaultsService');

const DEFAULT_RECOMMENDATION_WEIGHTS = {
  macroMatch: 0.28,
  calorieFit: 0.2,
  userPreference: 0.16,
  historyScore: 0.16,
  goalAlignment: 0.16,
  allergyPenalty: 0.3,
};

const MODE_DEFINITIONS = [
  {
    id: 'high_protein_fit',
    label: 'High protein fit',
    details: 'Best match for your remaining protein target',
  },
  {
    id: 'low_calorie_fit',
    label: 'Low calorie fit',
    details: 'Strong fit for calorie control and goal alignment',
  },
  {
    id: 'cuisine_preference_fit',
    label: 'Cuisine preference fit',
    details: 'Most aligned with your diet and cuisine preferences',
  },
  {
    id: 'history_preference_fit',
    label: 'History preference fit',
    details: 'Most consistent with your recent selections',
  },
  {
    id: 'proximity_convenience_fit',
    label: 'Convenience proximity fit',
    details: 'Best nearby option with low travel effort',
  },
];

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

function computeProximityScore(candidate) {
  if (!Number.isFinite(candidate.distance)) {
    return 0.45;
  }

  return clamp01(1 - candidate.distance / 12);
}

function includesAnyKeyword(text, keywords = []) {
  const normalized = normalizeText(text);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function computeTimeContextScore(candidate, nowDate = new Date()) {
  const date = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const hour = date.getHours();
  const bucket =
    hour < 11
      ? 'breakfast'
      : hour < 16
        ? 'lunch'
        : hour < 22
          ? 'dinner'
          : 'late';

  const text = [candidate.foodName, candidate.name, candidate.cuisineType].join(' ');

  const patterns = {
    breakfast: ['egg', 'oat', 'breakfast', 'bagel', 'coffee', 'pancake'],
    lunch: ['bowl', 'salad', 'sandwich', 'rice', 'wrap', 'grill'],
    dinner: ['steak', 'chicken', 'salmon', 'pasta', 'burrito', 'dinner'],
    late: ['snack', 'light', 'salad', 'yogurt', 'smoothie'],
  };

  if (includesAnyKeyword(text, patterns[bucket] || [])) {
    return 1;
  }

  return 0.55;
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

function computeModeScores({ features, preferences, remaining, intent = 'delivery' }) {
  const dominantMacro = dominantRemainingMacro(remaining);
  const goal = normalizeText(preferences.fitnessGoal || 'maintain');
  const normalizedIntent = normalizeText(intent || 'delivery');

  const scores = MODE_DEFINITIONS.map((mode) => {
    let score = 0;

    if (mode.id === 'high_protein_fit') {
      score =
        features.macroMatch * 0.5 +
        features.goalAlignment * 0.2 +
        features.calorieFit * 0.12 +
        features.historyScore * 0.08 +
        features.timeContextScore * 0.1;
      if (dominantMacro === 'protein') {
        score += 0.08;
      }
    }

    if (mode.id === 'low_calorie_fit') {
      score =
        features.calorieFit * 0.48 +
        features.goalAlignment * 0.22 +
        features.userPreference * 0.1 +
        features.proximityScore * 0.1 +
        features.timeContextScore * 0.1;
      if (goal === 'lose-weight') {
        score += 0.08;
      }
    }

    if (mode.id === 'cuisine_preference_fit') {
      score =
        features.userPreference * 0.5 +
        features.calorieFit * 0.16 +
        features.macroMatch * 0.16 +
        features.goalAlignment * 0.08 +
        features.timeContextScore * 0.1;
    }

    if (mode.id === 'history_preference_fit') {
      score =
        features.historyScore * 0.52 +
        features.userPreference * 0.15 +
        features.macroMatch * 0.14 +
        features.calorieFit * 0.09 +
        features.timeContextScore * 0.1;
    }

    if (mode.id === 'proximity_convenience_fit') {
      score =
        features.proximityScore * 0.45 +
        features.calorieFit * 0.14 +
        features.userPreference * 0.14 +
        features.macroMatch * 0.12 +
        features.goalAlignment * 0.05 +
        features.timeContextScore * 0.1;
      if (normalizedIntent === 'pickup' || normalizedIntent === 'go-there') {
        score += 0.08;
      }
      if (normalizedIntent === 'delivery') {
        score += 0.02;
      }
    }

    score -= features.allergyPenalty * 0.65;

    return {
      id: mode.id,
      label: mode.label,
      reason: mode.details,
      score: clamp01(score),
    };
  });

  const sorted = scores.sort((a, b) => b.score - a.score);
  return {
    winner: sorted[0],
    backups: sorted.slice(1, 3),
    all: sorted,
  };
}

function buildWinnerMessage(winnerMode, explanation) {
  if (winnerMode?.id === 'high_protein_fit') {
    return 'Best match based on your remaining protein target and recent meal context.';
  }
  if (winnerMode?.id === 'low_calorie_fit') {
    return 'Best low-calorie match for your current goal and remaining intake.';
  }
  if (winnerMode?.id === 'cuisine_preference_fit') {
    return 'Best match for your preferred diet and cuisine profile.';
  }
  if (winnerMode?.id === 'history_preference_fit') {
    return 'Best match based on your recent food selections and consistency.';
  }
  if (winnerMode?.id === 'proximity_convenience_fit') {
    return 'Best nearby option with strongest convenience and route fit.';
  }

  return explanation?.message || 'Best overall fit for your current context.';
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
  const intent = normalizeText(context.intent || context.mode || 'delivery');

  const features = {
    macroMatch: computeMacroMatch(candidate, remaining),
    calorieFit: computeCalorieFit(candidate, remaining),
    userPreference: computeUserPreference(candidate, preferences),
    historyScore: computeHistoryScore(candidate, historyProfile),
    goalAlignment: computeGoalAlignment(candidate, preferences),
    allergyPenalty: computeAllergyPenalty(candidate),
    proximityScore: computeProximityScore(candidate),
    timeContextScore: computeTimeContextScore(candidate, context.nowDate || new Date()),
  };
  const proteinMatch = macroFit(candidate.protein, remaining.protein, 24);

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

  const modeScores = computeModeScores({
    features,
    preferences,
    remaining,
    intent,
  });

  const winnerScore = clamp01(modeScores.winner?.score || normalizedScore);
  const finalNormalizedScore = clamp01(winnerScore * 0.74 + normalizedScore * 0.26);
  const winnerMessage = buildWinnerMessage(modeScores.winner, explanation);

  return {
    item: {
      id: candidate.id,
      name: candidate.name,
      foodName: candidate.foodName,
      cuisineType: candidate.cuisineType,
      distance: candidate.distance,
    },
    score: round(finalNormalizedScore * 100, 2),
    normalizedScore: round(finalNormalizedScore, 4),
    confidencePct: round(finalNormalizedScore * 100, 1),
    reason: winnerMessage,
    factors: {
      proteinMatch: round(proteinMatch),
      calorieFit: round(features.calorieFit),
      preferenceMatch: round(features.userPreference),
      distanceScore: round(features.proximityScore),
    },
    features: {
      macroMatch: round(features.macroMatch),
      calorieFit: round(features.calorieFit),
      userPreference: round(features.userPreference),
      historyScore: round(features.historyScore),
      goalAlignment: round(features.goalAlignment),
      proximityScore: round(features.proximityScore),
      timeContextScore: round(features.timeContextScore),
      allergyPenalty: round(features.allergyPenalty),
    },
    message: winnerMessage,
    details: Array.from(new Set([modeScores.winner?.reason, ...explanation.details].filter(Boolean))),
    strategy: 'time_mcl_winner_take_all_v1',
    winnerMode: modeScores.winner,
    backupModes: modeScores.backups,
    modeScores: modeScores.all,
    baseScore: round(normalizedScore, 4),
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

  return scored
    .sort((a, b) => {
      const scoreDiff = b.recommendation.score - a.recommendation.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const aDistance = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Number.POSITIVE_INFINITY;
      const bDistance = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Number.POSITIVE_INFINITY;
      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }

      const aName = normalizeText(a.name || a.foodName || '');
      const bName = normalizeText(b.name || b.foodName || '');
      if (aName < bName) {
        return -1;
      }
      if (aName > bName) {
        return 1;
      }

      return 0;
    })
    .map((item, index) => ({
      ...item,
      recommendation: {
        ...item.recommendation,
        winnerTakeAllSelected: index === 0,
        rank: index + 1,
      },
    }));
}

module.exports = {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  buildUserBehaviorProfile,
  scoreCandidate,
  rankCandidates,
};
