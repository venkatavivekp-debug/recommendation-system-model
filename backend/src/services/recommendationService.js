const { createDefaultPreferences, normalizePreferences } = require('./userDefaultsService');

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function computeOffsetMiles(calories) {
  const kcal = Number(calories || 0);
  return {
    walkingMiles: Number((kcal / 100).toFixed(1)),
    runningMiles: Number((kcal / 160).toFixed(1)),
  };
}

function cuisineMatches(preferredCuisine, result) {
  const pref = normalizeText(preferredCuisine);
  if (!pref) {
    return false;
  }

  return normalizeText(result.cuisineType).includes(pref);
}

function buildRecommendation(result, user) {
  const preferences = normalizePreferences(user?.preferences || createDefaultPreferences());
  const favoriteRestaurants = new Set((user?.favoriteRestaurants || []).map((item) => normalizeText(item)));
  const favoriteFoods = new Set((user?.favoriteFoods || []).map((item) => normalizeText(item)));

  const explanations = [];
  let score = 100;

  score -= result.distance * 6;

  if (preferences.macroPreference === 'protein') {
    score += (result.nutrition.protein - result.nutrition.carbs) * 0.4;
    if (result.nutrition.protein >= result.nutrition.carbs) {
      explanations.push('Best match for your high-protein goal');
    }
  }

  if (preferences.macroPreference === 'carb') {
    score += (result.nutrition.carbs - result.nutrition.protein) * 0.4;
    if (result.nutrition.carbs >= result.nutrition.protein) {
      explanations.push('Aligned with your carb-focused preference');
    }
  }

  if (cuisineMatches(preferences.preferredCuisine, result)) {
    score += 14;
    explanations.push('Cuisine matches your preference');
  }

  const goalPerMeal = preferences.dailyCalorieGoal / 3;
  if (result.nutrition.calories > goalPerMeal * 1.35) {
    score -= 18;
    explanations.push('Higher-calorie option than your current goal');
  } else if (result.nutrition.calories <= goalPerMeal) {
    score += 8;
    explanations.push('Calorie-friendly for your daily target');
  }

  if (preferences.fitnessGoal === 'weight-loss' && result.nutrition.calories < goalPerMeal) {
    score += 12;
    explanations.push('Supports your weight-loss preference');
  }

  if (preferences.fitnessGoal === 'muscle-gain' && result.nutrition.protein >= 30) {
    score += 10;
    explanations.push('Protein-rich option for muscle gain');
  }

  if (favoriteRestaurants.has(normalizeText(result.name))) {
    score += 16;
    explanations.push('Previously liked restaurant');
  }

  if (favoriteFoods.has(normalizeText(result.foodName))) {
    score += 10;
    explanations.push('Previously liked food');
  }

  if (explanations.length === 0) {
    explanations.push(result.distance <= 1.2 ? 'Closer option with balanced nutrition' : 'Balanced option');
  }

  return {
    score: Number(score.toFixed(2)),
    message: explanations[0],
    details: explanations,
    offsetSuggestion: computeOffsetMiles(result.nutrition.calories),
  };
}

function rankResults(results, user) {
  const scored = results.map((result) => {
    const recommendation = buildRecommendation(result, user);
    return {
      ...result,
      recommendation,
    };
  });

  return scored.sort((a, b) => b.recommendation.score - a.recommendation.score);
}

module.exports = {
  rankResults,
  computeOffsetMiles,
};
