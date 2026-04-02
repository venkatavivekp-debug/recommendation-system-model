const googlePlacesService = require('./googlePlacesService');
const nutritionService = require('./nutritionService');
const mealService = require('./mealService');
const userService = require('./userService');
const { normalizePreferences } = require('./userDefaultsService');
const mealBuilderService = require('./mealBuilderService');
const exerciseService = require('./exerciseService');
const recommendationService = require('./recommendationService');
const recommendationEngine = require('./recommendationEngine');
const calendarPlanModel = require('../models/calendarPlanModel');
const { detectAllergyWarnings } = require('../utils/allergy');
const {
  ATHENS_GEORGIA_CENTER,
  normalizeSearchOrigin,
  buildTravelEstimates,
} = require('../utils/travel');

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

function buildGrocerySuggestions(preferredDiet, allergies = []) {
  const stores = ['Walmart', 'Target'];

  return grocerySuggestionItems(preferredDiet).map((item, index) => {
    const store = stores[index % stores.length];
    const query = encodeURIComponent(item.query);
    const allergyWarnings = detectAllergyWarnings(allergies, [item.label, item.query]);
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
      allergyWarnings,
    };
  });
}

function buildRestaurantFallbacks(target, user, origin = ATHENS_GEORGIA_CENTER) {
  const favorites = Array.isArray(user.favoriteRestaurants) ? user.favoriteRestaurants : [];
  const fallbackRestaurants = [
    { name: 'The Place', address: '229 E Broad St, Athens, GA', cuisine: 'Southern', lat: 33.9594, lng: -83.3738 },
    { name: "Mamma's Boy", address: '197 Oak St, Athens, GA', cuisine: 'Breakfast', lat: 33.9539, lng: -83.3655 },
    { name: 'Taqueria Tsunami', address: '320 E Clayton St, Athens, GA', cuisine: 'Mexican Fusion', lat: 33.9588, lng: -83.3731 },
    { name: 'Chipotle Athens', address: '1850 Epps Bridge Pkwy, Athens, GA', cuisine: 'Mexican', lat: 33.9329, lng: -83.4419 },
  ];

  const merged = favorites.length
    ? [
        ...favorites.map((name, index) => ({
          name,
          address: 'Athens, Georgia',
          cuisine: user.preferences?.preferredCuisine || 'Restaurant',
          lat: ATHENS_GEORGIA_CENTER.lat + index * 0.005,
          lng: ATHENS_GEORGIA_CENTER.lng + index * 0.004,
        })),
        ...fallbackRestaurants,
      ]
    : fallbackRestaurants;

  return merged.slice(0, 5).map((restaurant, index) => {
    const allergyWarnings = detectAllergyWarnings(user.allergies || [], [target.keyword, restaurant.name]);
    const approxDistance = Math.max(
      0.3,
      Math.sqrt(
        Math.pow(Number(origin.lat || ATHENS_GEORGIA_CENTER.lat) - restaurant.lat, 2) +
          Math.pow(Number(origin.lng || ATHENS_GEORGIA_CENTER.lng) - restaurant.lng, 2)
      ) * 58
    );
    const travel = buildTravelEstimates(approxDistance, Number(user.bodyWeightKg || 70));
    const mapsDirections = `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`;

    return {
      name: restaurant.name,
      address: restaurant.address,
      rating: null,
      distance: Number(approxDistance.toFixed(2)),
      cuisine: restaurant.cuisine || user.preferences?.preferredCuisine || 'Healthy',
      suggestedMeal: target.keyword,
      nutritionEstimate: nutritionService.buildNutrition(target.keyword, `fallback-${restaurant.name}-${index}`),
      userRatingsTotal: 0,
      reviewSnippet: `Athens fallback recommendation for ${target.keyword}.`,
      restaurantImage: null,
      foodImage: null,
      explanation: target.explanation,
      orderLinks: {
        uberEats: `https://www.ubereats.com/search?q=${encodeURIComponent(`${restaurant.name} ${target.keyword}`)}`,
        doorDash: `https://www.doordash.com/search/store/${encodeURIComponent(`${restaurant.name} ${target.keyword}`)}`,
      },
      visitLink: mapsDirections,
      viewLink: `https://www.google.com/search?q=${encodeURIComponent(`${restaurant.name} restaurant`)}`,
      allergyWarnings,
      confidence: index === 0 ? 'high' : 'medium',
      route: {
        walking: {
          steps: travel.walking.estimatedSteps,
          caloriesBurned: travel.walking.estimatedCaloriesBurned,
          minutes: travel.walking.estimatedMinutes,
        },
        driving: {
          minutes: travel.driving.durationMinutes,
        },
        distanceMiles: travel.walking.distanceMiles,
      },
    };
  });
}

async function buildRestaurantSuggestions(user, target, locationOptions) {
  const origin = normalizeSearchOrigin(locationOptions.lat, locationOptions.lng);
  const lat = toNumber(origin.lat);
  const lng = toNumber(origin.lng);
  const radius = Number(locationOptions.radius || 5);
  const bodyWeightKg = Number(user.bodyWeightKg || 70);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return buildRestaurantFallbacks(target, user, origin);
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
      return buildRestaurantFallbacks(target, user, origin);
    }

    return places.slice(0, 5).map((place) => {
      const allergyWarnings = detectAllergyWarnings(user.allergies || [], [
        target.keyword,
        place.name,
        place.cuisineType,
      ]);
      const travel = buildTravelEstimates(place.distance, bodyWeightKg);

      return {
        name: place.name,
        address: place.address,
        rating: place.rating,
        distance: place.distance,
        cuisine: place.cuisineType,
        suggestedMeal: target.keyword,
        nutritionEstimate: nutritionService.buildNutrition(target.keyword, place.placeId),
        userRatingsTotal: place.userRatingsTotal || 0,
        reviewSnippet: place.reviewSnippet || '',
        restaurantImage: place.restaurantImage || null,
        foodImage: place.foodImage || null,
        explanation: target.explanation,
        orderLinks: {
          uberEats: `https://www.ubereats.com/search?q=${encodeURIComponent(`${place.name} ${target.keyword}`)}`,
          doorDash: `https://www.doordash.com/search/store/${encodeURIComponent(`${place.name} ${target.keyword}`)}`,
        },
        visitLink: `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`,
        viewLink:
          place.mapsUrl || `https://www.google.com/search?q=${encodeURIComponent(`${place.name} restaurant`)}`,
        allergyWarnings,
        confidence: 'high',
        route: {
          walking: {
            steps: travel.walking.estimatedSteps,
            caloriesBurned: travel.walking.estimatedCaloriesBurned,
            minutes: travel.walking.estimatedMinutes,
          },
          driving: {
            minutes: travel.driving.durationMinutes,
          },
          distanceMiles: travel.walking.distanceMiles,
        },
      };
    });
  } catch (error) {
    return buildRestaurantFallbacks(target, user, origin);
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

function buildExerciseAdjustment(exerciseSummary, goals, consumed, remaining, target) {
  const burnedCalories = Number(exerciseSummary?.totalCaloriesBurned || 0);
  const workoutsDone = Number(exerciseSummary?.workoutsDone || 0);
  const strengthWorkouts = Number(exerciseSummary?.strengthWorkouts || 0);
  const totalSteps = Number(exerciseSummary?.totalSteps || 0);

  const netCalorieAllowance = clampOneDecimal(goals.dailyCalorieGoal + burnedCalories - consumed.calories);
  const caloriesFlex = Math.max(0, Math.round(burnedCalories));

  const explanationLabels = [];
  if (caloriesFlex >= 100) {
    explanationLabels.push(`You burned ${caloriesFlex} kcal today, so you have additional calorie flexibility.`);
  }
  if (strengthWorkouts > 0) {
    explanationLabels.push('High protein is recommended after strength training to support recovery.');
  }
  if (totalSteps >= 7000) {
    explanationLabels.push('Great step volume today. Keep hydration and balanced carbs for energy.');
  }
  if (remaining.calories < 0 && burnedCalories > 0) {
    explanationLabels.push('Exercise reduced your net surplus, but lighter options still help stay on target.');
  }
  if (explanationLabels.length === 0) {
    explanationLabels.push(
      target.primaryMacro === 'protein'
        ? 'Protein-forward options remain the best next step for your macro target.'
        : 'Choose a macro-balanced meal that fits your remaining plan.'
    );
  }

  return {
    burnedCalories: clampOneDecimal(burnedCalories),
    workoutsDone,
    strengthWorkouts,
    steps: Math.round(totalSteps),
    netCalorieAllowance,
    remainingWithExercise: {
      calories: netCalorieAllowance,
      protein: remaining.protein,
      carbs: remaining.carbs,
      fats: remaining.fats,
      fiber: remaining.fiber,
    },
    explanationLabels,
    message:
      caloriesFlex >= 100
        ? `You burned ${caloriesFlex} kcal today. You can eat about ${caloriesFlex} extra kcal while staying near your plan.`
        : 'Calories burned today are modest. Keep portions aligned with remaining daily targets.',
  };
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

function toDateKey(dateValue) {
  return new Date(dateValue).toISOString().slice(0, 10);
}

function buildWeeklyBalancePlan({
  plannedCalories,
  dailyCalorieGoal,
  targetDate,
  referenceDate = new Date(),
}) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const eventDate = new Date(`${targetDate}T00:00:00.000Z`);
  const diffDays = Math.max(
    1,
    Math.ceil((eventDate.getTime() - today.getTime()) / 86400000)
  );
  const planningWindowDays = Math.min(7, Math.max(1, diffDays));
  const expectedExtraCalories = Math.max(0, Math.round(Number(plannedCalories || 0) - Number(dailyCalorieGoal || 0)));
  const reductionPerDay =
    expectedExtraCalories > 0
      ? Math.max(0, Math.round(expectedExtraCalories / planningWindowDays))
      : 0;

  const saferDailyTarget = Math.min(reductionPerDay, 350);
  const message =
    expectedExtraCalories > 0
      ? `You planned +${expectedExtraCalories} kcal on ${toDateKey(eventDate)}. Reduce about ${saferDailyTarget} kcal/day for ${planningWindowDays} day(s) to balance safely.`
      : 'Planned intake is within your normal target. No weekly adjustment needed.';

  const suggestions =
    expectedExtraCalories > 0
      ? [
          `Reduce about ${saferDailyTarget} kcal/day across the next ${planningWindowDays} day(s).`,
          'Prioritize protein to maintain recovery and satiety while reducing calories.',
          'Use lower-calorie swaps for snacks and sauces instead of aggressive meal skipping.',
          'Add light walking or easy cardio to support balance without extreme restriction.',
        ]
      : [
          'Keep your normal intake pattern and protein consistency.',
          'Stay hydrated and maintain regular meal timing.',
        ];

  if (reductionPerDay > 350) {
    suggestions.push('Your planned surplus is high. Consider spreading balance across more than one week.');
  }

  return {
    expectedExtraCalories,
    reductionPerDay: saferDailyTarget,
    planningWindowDays,
    isCheatDay: expectedExtraCalories > 0,
    message,
    suggestions,
  };
}

async function getRemainingNutrition(userId, options = {}) {
  const user = await userService.getUserOrThrow(userId);
  const preferences = normalizePreferences(user.preferences);
  const today = await mealService.getTodayMeals(userId);
  const consumed = today.totals;
  const remaining = buildRemaining(preferences, consumed);
  const target = buildMacroTarget(remaining, preferences);
  const exerciseToday = await exerciseService.getTodayExerciseSummary(userId);
  const exerciseAdjustment = buildExerciseAdjustment(
    exerciseToday.summary,
    preferences,
    consumed,
    remaining,
    target
  );

  const [restaurantOptions, mealHistory] = await Promise.all([
    buildRestaurantSuggestions(user, target, options),
    mealService.getMealHistory(userId, 260),
  ]);
  const rankedRestaurantOptions = await recommendationService.rankResults(
    restaurantOptions,
    user,
    { remaining },
    { history: mealHistory.meals || [] }
  );
  const rawFoodSuggestions = buildRawFoodSuggestions(remaining, preferences.preferredDiet);
  const grocerySuggestions = buildGrocerySuggestions(preferences.preferredDiet, user.allergies || []);
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
  const rankedRecipeCards = recommendationEngine
    .rankCandidates(
      (generatedRecipes.recipes || []).map((recipe) => ({
        ...recipe,
        name: recipe.recipeName,
        foodName: recipe.recipeName,
        cuisineType: preferences.preferredCuisine || 'home cooking',
        nutrition: {
          calories: recipe.estimatedMacros?.calories || 0,
          protein: recipe.estimatedMacros?.protein || 0,
          carbs: recipe.estimatedMacros?.carbs || 0,
          fats: recipe.estimatedMacros?.fats || 0,
          fiber: recipe.estimatedMacros?.fiber || 0,
          ingredients: (recipe.ingredients || []).map((item) =>
            typeof item === 'string' ? item : item.name
          ),
          dietTags: [preferences.preferredDiet || 'non-veg'],
        },
        allergyWarnings: recipe.allergyNotes || [],
      })),
      {
        user,
        remainingNutrition: remaining,
        history: mealHistory.meals || [],
      }
    )
    .map((item) => ({
      ...item,
      recommendationLabel:
        item.recommendation?.message || item.recommendationLabel || 'Balanced option',
    }));
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 31);
  const upcomingPlans = await calendarPlanModel.listUpcomingPlans(
    userId,
    from.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10)
  );
  const recommendationMessage = `${buildRecommendedSummary(remaining, target)} ${exerciseAdjustment.message}`;

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
    exerciseAdjusted: exerciseAdjustment.remainingWithExercise,
    progress: {
      calories: progressPercent(preferences.dailyCalorieGoal, consumed.calories),
      protein: progressPercent(preferences.proteinGoal, consumed.protein),
      carbs: progressPercent(preferences.carbsGoal, consumed.carbs),
      fats: progressPercent(preferences.fatsGoal, consumed.fats),
      fiber: progressPercent(preferences.fiberGoal, consumed.fiber),
    },
    recommendedForRemainingDay: {
      message: recommendationMessage,
      exerciseAdjustments: exerciseAdjustment,
      restaurantOptions: rankedRestaurantOptions,
      rawFoodSuggestions,
      grocerySuggestions,
      mealBuilder: mealBuilder.suggestions,
      recipes: rankedRecipeCards,
      upcomingPlans,
    },
  };
}

module.exports = {
  getRemainingNutrition,
  buildWeeklyBalancePlan,
};
