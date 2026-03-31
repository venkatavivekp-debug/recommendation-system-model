const googlePlacesService = require('./googlePlacesService');
const mealService = require('./mealService');
const userService = require('./userService');
const { normalizePreferences } = require('./userDefaultsService');
const mealBuilderService = require('./mealBuilderService');
const calendarService = require('./calendarService');

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampOneDecimal(value) {
  return Number(Number(value || 0).toFixed(1));
}

function buildRemaining(goals, consumed) {
  return {
    calories: clampOneDecimal(goals.dailyCalorieGoal - consumed.calories),
    protein: clampOneDecimal(goals.proteinGoal - consumed.protein),
    carbs: clampOneDecimal(goals.carbsGoal - consumed.carbs),
    fats: clampOneDecimal(goals.fatsGoal - consumed.fats),
    fiber: clampOneDecimal(goals.fiberGoal - consumed.fiber),
  };
}

function mealKeywordForMacro(primaryMacro, preferredDiet) {
  const diet = String(preferredDiet || 'non-veg').toLowerCase();

  if (primaryMacro === 'protein') {
    if (diet === 'vegan') {
      return 'tofu protein bowl';
    }
    if (diet === 'veg') {
      return 'paneer protein bowl';
    }

    return 'grilled chicken bowl';
  }

  if (primaryMacro === 'carbs') {
    return 'rice bowl';
  }

  if (primaryMacro === 'fats') {
    return 'avocado salmon bowl';
  }

  if (primaryMacro === 'fiber') {
    return 'veggie salad';
  }

  return 'healthy meal';
}

function sortMacroPriority(remaining) {
  const entries = [
    { macro: 'protein', amount: remaining.protein },
    { macro: 'carbs', amount: remaining.carbs },
    { macro: 'fats', amount: remaining.fats },
    { macro: 'fiber', amount: remaining.fiber },
  ];

  return entries.sort((a, b) => b.amount - a.amount);
}

function buildRawFoodSuggestions(remaining, preferredDiet) {
  const diet = String(preferredDiet || 'non-veg').toLowerCase();
  const suggestions = [];

  if (remaining.protein > 10) {
    if (diet === 'vegan') {
      suggestions.push({
        item: 'Tofu',
        quantity: '220g',
        macros: { calories: 210, protein: 26, carbs: 6, fats: 12, fiber: 2 },
        rationale: 'High protein with plant-based fit',
      });
    } else if (diet === 'veg') {
      suggestions.push({
        item: 'Paneer',
        quantity: '150g',
        macros: { calories: 395, protein: 28, carbs: 8, fats: 29, fiber: 0 },
        rationale: 'Strong protein boost for vegetarian profile',
      });
    } else {
      suggestions.push({
        item: 'Chicken breast',
        quantity: '200g',
        macros: { calories: 330, protein: 62, carbs: 0, fats: 7, fiber: 0 },
        rationale: 'Lean protein for remaining target',
      });
    }
  }

  if (remaining.carbs > 20) {
    suggestions.push({
      item: 'Cooked rice',
      quantity: '150g',
      macros: { calories: 195, protein: 4, carbs: 45, fats: 0.4, fiber: 1 },
      rationale: 'Simple carb source to fill remaining carbs',
    });
  }

  if (remaining.fats > 8) {
    suggestions.push({
      item: 'Almonds',
      quantity: '30g',
      macros: { calories: 174, protein: 6, carbs: 6, fats: 15, fiber: 3 },
      rationale: 'Healthy fats with additional fiber',
    });
  }

  if (remaining.fiber > 6) {
    suggestions.push({
      item: 'Broccoli',
      quantity: '200g',
      macros: { calories: 70, protein: 5, carbs: 14, fats: 1, fiber: 6 },
      rationale: 'Fiber-focused option with low calories',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      item: 'Greek yogurt with berries',
      quantity: '1 bowl',
      macros: { calories: 220, protein: 20, carbs: 24, fats: 4, fiber: 3 },
      rationale: 'Balanced option when macros are mostly complete',
    });
  }

  return suggestions.slice(0, 4);
}

function grocerySuggestionItems(preferredDiet) {
  const diet = String(preferredDiet || 'non-veg').toLowerCase();

  const base = [
    { query: 'brown rice', label: 'Brown Rice 1kg', priceEstimate: '$4.99', rating: 4.6 },
    { query: 'mixed vegetables frozen', label: 'Mixed Vegetables', priceEstimate: '$3.49', rating: 4.4 },
    { query: 'broccoli fresh', label: 'Fresh Broccoli', priceEstimate: '$2.29', rating: 4.5 },
  ];

  if (diet === 'vegan') {
    base.unshift({ query: 'firm tofu', label: 'Firm Tofu', priceEstimate: '$2.99', rating: 4.3 });
  } else if (diet === 'veg') {
    base.unshift({ query: 'paneer', label: 'Paneer Pack', priceEstimate: '$5.99', rating: 4.2 });
  } else {
    base.unshift({
      query: 'chicken breast',
      label: 'Chicken Breast',
      priceEstimate: '$8.99',
      rating: 4.5,
    });
  }

  return base;
}

function buildGrocerySuggestions(preferredDiet) {
  const stores = ['Walmart', 'Target'];

  return grocerySuggestionItems(preferredDiet).map((item, index) => {
    const store = stores[index % stores.length];
    const query = encodeURIComponent(item.query);
    const baseUrl =
      store === 'Walmart'
        ? `https://www.walmart.com/search?q=${query}`
        : `https://www.target.com/s?searchTerm=${query}`;

    return {
      item: item.label,
      store,
      priceEstimate: item.priceEstimate,
      rating: item.rating,
      link: baseUrl,
    };
  });
}

function buildRestaurantFallbacks(target, user) {
  const favorites = Array.isArray(user.favoriteRestaurants) ? user.favoriteRestaurants : [];
  const fallbackNames =
    favorites.length > 0 ? favorites : ['Local Healthy Kitchen', 'Protein Bowl Hub', 'Balanced Plate Cafe'];

  return fallbackNames.slice(0, 3).map((name, index) => ({
    name,
    address: 'Search nearby in app for exact location',
    rating: null,
    distance: null,
    cuisine: user.preferences?.preferredCuisine || 'Healthy',
    suggestedMeal: target.keyword,
    explanation: target.explanation,
    orderLinks: {
      uberEats: `https://www.ubereats.com/search?q=${encodeURIComponent(`${name} ${target.keyword}`)}`,
      doorDash: `https://www.doordash.com/search/store/${encodeURIComponent(`${name} ${target.keyword}`)}`,
    },
    visitLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
    viewLink: `https://www.google.com/search?q=${encodeURIComponent(`${name} restaurant`)}`,
    confidence: index === 0 ? 'high' : 'medium',
  }));
}

async function buildRestaurantSuggestions(user, target, locationOptions) {
  const lat = toNumber(locationOptions.lat);
  const lng = toNumber(locationOptions.lng);
  const radius = Number(locationOptions.radius || 5);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return buildRestaurantFallbacks(target, user);
  }

  try {
    const places = await googlePlacesService.searchNearbyRestaurants({
      keyword: target.keyword,
      lat,
      lng,
      radiusMiles: radius,
      enrichDetails: true,
    });

    if (!places.length) {
      return buildRestaurantFallbacks(target, user);
    }

    return places.slice(0, 5).map((place) => ({
      name: place.name,
      address: place.address,
      rating: place.rating,
      distance: place.distance,
      cuisine: place.cuisineType,
      suggestedMeal: target.keyword,
      explanation: target.explanation,
      orderLinks: {
        uberEats: `https://www.ubereats.com/search?q=${encodeURIComponent(`${place.name} ${target.keyword}`)}`,
        doorDash: `https://www.doordash.com/search/store/${encodeURIComponent(`${place.name} ${target.keyword}`)}`,
      },
      visitLink: `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`,
      viewLink:
        place.mapsUrl || `https://www.google.com/search?q=${encodeURIComponent(`${place.name} restaurant`)}`,
      confidence: 'high',
    }));
  } catch (error) {
    return buildRestaurantFallbacks(target, user);
  }
}

function buildRecommendedSummary(remaining, target) {
  if (remaining.calories < 0) {
    return 'You are over your calorie goal today. Prefer lighter meals and walking options.';
  }

  if (target.primaryMacro === 'protein') {
    return 'Best match for your remaining protein goal. Prioritize lean or plant protein choices.';
  }

  if (target.primaryMacro === 'carbs') {
    return 'You still need carbs for energy. Pick balanced carb meals without overshooting calories.';
  }

  if (target.primaryMacro === 'fiber') {
    return 'Fiber is still low today. Include vegetables, legumes, or whole grains in your next meal.';
  }

  return 'Choose a balanced nearby option that fits your remaining calories and macros.';
}

function buildMacroTarget(remaining, preferences) {
  const sorted = sortMacroPriority(remaining);
  const primary = sorted[0]?.macro || 'balanced';
  const keyword = mealKeywordForMacro(primary, preferences.preferredDiet);

  return {
    primaryMacro: primary,
    keyword,
    explanation:
      primary === 'protein'
        ? 'Best match for your remaining protein goal'
        : primary === 'carbs'
          ? 'Supports your remaining carb target'
          : primary === 'fats'
            ? 'Improves healthy fats completion'
            : primary === 'fiber'
              ? 'Helps close your fiber gap'
              : 'Balanced option for remaining day',
  };
}

function progressPercent(goal, consumed) {
  if (!Number.isFinite(goal) || goal <= 0) {
    return 0;
  }

  return Number(((consumed / goal) * 100).toFixed(1));
}

async function getRemainingNutrition(userId, options = {}) {
  const user = await userService.getUserOrThrow(userId);
  const preferences = normalizePreferences(user.preferences);
  const today = await mealService.getTodayMeals(userId);
  const consumed = today.totals;
  const remaining = buildRemaining(preferences, consumed);
  const target = buildMacroTarget(remaining, preferences);

  const restaurantOptions = await buildRestaurantSuggestions(user, target, options);
  const rawFoodSuggestions = buildRawFoodSuggestions(remaining, preferences.preferredDiet);
  const grocerySuggestions = buildGrocerySuggestions(preferences.preferredDiet);
  const mealBuilder = mealBuilderService.buildMealBuilderPlan({
    remaining,
    allergies: user.allergies || [],
    preferences,
    maxSuggestions: 3,
  });
  const generatedRecipes = mealBuilderService.generateRecipeSuggestions({
    remaining,
    allergies: user.allergies || [],
    preferences,
    maxSuggestions: 3,
  });
  const upcomingPlans = await calendarService.getUpcoming(userId);
  const recommendationMessage = buildRecommendedSummary(remaining, target);

  return {
    goals: {
      dailyCalorieGoal: preferences.dailyCalorieGoal,
      proteinGoal: preferences.proteinGoal,
      carbsGoal: preferences.carbsGoal,
      fatsGoal: preferences.fatsGoal,
      fiberGoal: preferences.fiberGoal,
    },
    consumedToday: consumed,
    remaining,
    progress: {
      calories: progressPercent(preferences.dailyCalorieGoal, consumed.calories),
      protein: progressPercent(preferences.proteinGoal, consumed.protein),
      carbs: progressPercent(preferences.carbsGoal, consumed.carbs),
      fats: progressPercent(preferences.fatsGoal, consumed.fats),
      fiber: progressPercent(preferences.fiberGoal, consumed.fiber),
    },
    recommendedForRemainingDay: {
      message: recommendationMessage,
      restaurantOptions,
      rawFoodSuggestions,
      grocerySuggestions,
      mealBuilder: mealBuilder.suggestions,
      recipes: generatedRecipes.recipes,
      upcomingPlans: upcomingPlans.plans,
    },
  };
}

module.exports = {
  getRemainingNutrition,
};
