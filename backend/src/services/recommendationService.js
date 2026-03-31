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

function dominantRemainingMacro(remaining) {
  const entries = [
    { key: 'protein', value: Number(remaining?.protein || 0) },
    { key: 'carbs', value: Number(remaining?.carbs || 0) },
    { key: 'fats', value: Number(remaining?.fats || 0) },
    { key: 'fiber', value: Number(remaining?.fiber || 0) },
  ];

  entries.sort((a, b) => b.value - a.value);
  return entries[0];
}

function buildMacroScoring(result, remaining, explanations) {
  if (!remaining) {
    return 0;
  }

  const dominant = dominantRemainingMacro(remaining);
  let delta = 0;

  if (dominant.key === 'protein' && dominant.value > 10) {
    delta += result.nutrition.protein * 0.65;
    if (result.nutrition.protein >= 30) {
      explanations.push('Best match for your remaining protein goal');
    }
  }

  if (dominant.key === 'carbs' && dominant.value > 15) {
    delta += result.nutrition.carbs * 0.45;
    if (result.nutrition.carbs >= 35) {
      explanations.push('Supports your remaining carb target');
    }
  }

  if (dominant.key === 'fiber' && dominant.value > 6) {
    const ingredientText = (result.nutrition.ingredients || []).join(' ').toLowerCase();
    if (/(beans|chickpeas|spinach|broccoli|oats|quinoa)/i.test(ingredientText)) {
      delta += 18;
      explanations.push('Good option to improve your fiber intake');
    }
  }

  return delta;
}

function buildRecommendation(result, user, nutritionContext) {
  const preferences = normalizePreferences(user?.preferences || createDefaultPreferences());
  const favoriteRestaurants = new Set((user?.favoriteRestaurants || []).map((item) => normalizeText(item)));
  const favoriteFoods = new Set((user?.favoriteFoods || []).map((item) => normalizeText(item)));
  const remaining = nutritionContext?.remaining || null;

  const explanations = [];
  let score = 100;

  score -= result.distance * 6;
  score += buildMacroScoring(result, remaining, explanations);

  if (cuisineMatches(preferences.preferredCuisine, result)) {
    score += 12;
    explanations.push('Cuisine matches your preference');
  }

  const targetCaloriesPerMeal = preferences.dailyCalorieGoal / 3;
  if (result.nutrition.calories <= targetCaloriesPerMeal) {
    score += 8;
  }

  if (remaining && Number.isFinite(remaining.calories)) {
    if (remaining.calories >= 0 && result.nutrition.calories <= remaining.calories + 80) {
      score += 16;
      explanations.push('Low calorie option for weight loss');
    } else if (remaining.calories < 0) {
      score -= 15;
      explanations.push('You already exceeded your calorie goal today');
    } else if (result.nutrition.calories > remaining.calories + 250) {
      score -= 14;
      explanations.push('This option is likely above your remaining calorie budget');
    }
  }

  if (preferences.fitnessGoal === 'lose-weight' && result.nutrition.calories < targetCaloriesPerMeal) {
    score += 12;
  }

  if (preferences.fitnessGoal === 'gain-muscle' && result.nutrition.protein >= 32) {
    score += 11;
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
    explanations.push(result.distance <= 1.2 ? 'Closer option with lower calories' : 'Balanced option');
  }

  return {
    score: Number(score.toFixed(2)),
    message: explanations[0],
    details: explanations,
    offsetSuggestion: computeOffsetMiles(result.nutrition.calories),
  };
}

function rankResults(results, user, nutritionContext = null) {
  const scored = results.map((result) => {
    const recommendation = buildRecommendation(result, user, nutritionContext);
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
