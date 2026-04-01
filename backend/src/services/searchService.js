const { randomUUID } = require('crypto');
const recommendationService = require('./recommendationService');
const nutritionPlannerService = require('./nutritionPlannerService');
const userService = require('./userService');
const searchHistoryModel = require('../models/searchHistoryModel');
const { detectAllergyWarnings } = require('../utils/allergy');
const nutritionService = require('./nutritionService');
const { buildRestaurantImage, buildFoodImage } = require('../utils/media');

const REAL_RESTAURANT_CATALOG = [
  {
    name: "McDonald's",
    cuisineType: 'Fast Food',
    rating: 4.2,
    userRatingsTotal: 18000,
    websiteUrl: 'https://www.mcdonalds.com',
    uberEatsUrl: 'https://www.ubereats.com/brand/mcdonalds',
    doorDashUrl: 'https://www.doordash.com/business/mcdonald-s-32071/',
    address: 'Times Square, New York, NY',
    latOffset: 0.0048,
    lngOffset: 0.0031,
    menu: [
      {
        foodName: 'Grilled Chicken Sandwich',
        nutrition: {
          calories: 390,
          protein: 34,
          carbs: 44,
          fats: 8,
          fiber: 3,
          ingredients: ['chicken breast', 'bun', 'lettuce', 'tomato'],
          dietTags: ['non-veg', 'high-protein'],
        },
      },
      {
        foodName: 'Egg McMuffin',
        nutrition: {
          calories: 310,
          protein: 17,
          carbs: 30,
          fats: 13,
          fiber: 2,
          ingredients: ['egg', 'english muffin', 'cheese'],
          dietTags: ['non-veg'],
        },
      },
    ],
  },
  {
    name: 'KFC',
    cuisineType: 'Fried Chicken',
    rating: 4.0,
    userRatingsTotal: 14000,
    websiteUrl: 'https://www.kfc.com',
    uberEatsUrl: 'https://www.ubereats.com/brand/kfc',
    doorDashUrl: 'https://www.doordash.com/business/kfc-37725/',
    address: 'Midtown West, New York, NY',
    latOffset: 0.0072,
    lngOffset: 0.0026,
    menu: [
      {
        foodName: 'Grilled Chicken Breast',
        nutrition: {
          calories: 220,
          protein: 37,
          carbs: 1,
          fats: 7,
          fiber: 0,
          ingredients: ['chicken breast', 'spices'],
          dietTags: ['non-veg', 'high-protein', 'low-calorie'],
        },
      },
      {
        foodName: 'Original Chicken Sandwich',
        nutrition: {
          calories: 650,
          protein: 34,
          carbs: 49,
          fats: 35,
          fiber: 4,
          ingredients: ['fried chicken', 'bun', 'pickles'],
          dietTags: ['non-veg'],
        },
      },
    ],
  },
  {
    name: 'Subway',
    cuisineType: 'Sandwiches',
    rating: 4.3,
    userRatingsTotal: 16500,
    websiteUrl: 'https://www.subway.com',
    uberEatsUrl: 'https://www.ubereats.com/brand/subway',
    doorDashUrl: 'https://www.doordash.com/business/subway-29287/',
    address: 'Herald Square, New York, NY',
    latOffset: 0.0035,
    lngOffset: -0.0027,
    menu: [
      {
        foodName: 'Rotisserie-Style Chicken Bowl',
        nutrition: {
          calories: 310,
          protein: 37,
          carbs: 17,
          fats: 9,
          fiber: 4,
          ingredients: ['chicken', 'spinach', 'tomato', 'onion'],
          dietTags: ['non-veg', 'high-protein', 'low-calorie'],
        },
      },
      {
        foodName: 'Veggie Delite',
        nutrition: {
          calories: 230,
          protein: 10,
          carbs: 44,
          fats: 3,
          fiber: 6,
          ingredients: ['lettuce', 'tomato', 'cucumber', 'bread'],
          dietTags: ['veg'],
        },
      },
    ],
  },
  {
    name: 'Chipotle',
    cuisineType: 'Mexican',
    rating: 4.4,
    userRatingsTotal: 15300,
    websiteUrl: 'https://www.chipotle.com',
    uberEatsUrl: 'https://www.ubereats.com/brand/chipotle',
    doorDashUrl: 'https://www.doordash.com/business/chipotle-mexican-grill-5339/',
    address: 'Union Square, New York, NY',
    latOffset: -0.0043,
    lngOffset: 0.0039,
    menu: [
      {
        foodName: 'Chicken Burrito Bowl',
        nutrition: {
          calories: 570,
          protein: 42,
          carbs: 56,
          fats: 19,
          fiber: 11,
          ingredients: ['chicken', 'rice', 'beans', 'salsa', 'lettuce'],
          dietTags: ['non-veg', 'high-protein'],
        },
      },
      {
        foodName: 'Sofritas Bowl',
        nutrition: {
          calories: 500,
          protein: 22,
          carbs: 58,
          fats: 20,
          fiber: 13,
          ingredients: ['tofu', 'rice', 'beans', 'salsa', 'lettuce'],
          dietTags: ['veg', 'vegan'],
        },
      },
    ],
  },
  {
    name: 'Taco Bell',
    cuisineType: 'Tex-Mex',
    rating: 4.1,
    userRatingsTotal: 13200,
    websiteUrl: 'https://www.tacobell.com',
    uberEatsUrl: 'https://www.ubereats.com/brand/taco-bell',
    doorDashUrl: 'https://www.doordash.com/business/taco-bell-30763/',
    address: 'Chelsea, New York, NY',
    latOffset: -0.0064,
    lngOffset: -0.0029,
    menu: [
      {
        foodName: 'Power Menu Bowl - Chicken',
        nutrition: {
          calories: 470,
          protein: 26,
          carbs: 50,
          fats: 18,
          fiber: 9,
          ingredients: ['chicken', 'beans', 'rice', 'lettuce', 'cheese'],
          dietTags: ['non-veg'],
        },
      },
      {
        foodName: 'Bean Burrito',
        nutrition: {
          calories: 360,
          protein: 13,
          carbs: 54,
          fats: 10,
          fiber: 9,
          ingredients: ['beans', 'tortilla', 'cheese', 'onion'],
          dietTags: ['veg'],
        },
      },
    ],
  },
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function chooseMenuItem(restaurant, keyword, macroFocus) {
  const normalizedKeyword = normalizeText(keyword);
  const byKeyword = restaurant.menu.find((item) =>
    normalizeText(item.foodName).includes(normalizedKeyword)
  );
  if (byKeyword) {
    return byKeyword;
  }

  if (macroFocus === 'protein') {
    return [...restaurant.menu].sort(
      (a, b) => Number(b.nutrition.protein || 0) - Number(a.nutrition.protein || 0)
    )[0];
  }

  if (macroFocus === 'carb') {
    return [...restaurant.menu].sort(
      (a, b) => Number(b.nutrition.carbs || 0) - Number(a.nutrition.carbs || 0)
    )[0];
  }

  return restaurant.menu[0];
}

function estimateDistanceMiles(index) {
  return Number((0.7 + index * 0.85).toFixed(2));
}

function buildRealBrandResults(payload, user) {
  const lat = toNumber(payload.lat, 0);
  const lng = toNumber(payload.lng, 0);
  const radiusMiles = Math.max(1, Math.min(toNumber(payload.radius, 5), 20));

  return REAL_RESTAURANT_CATALOG.map((restaurant, index) => {
    const selectedItem = chooseMenuItem(restaurant, payload.keyword, payload.macroFocus);
    const nutrition = selectedItem.nutrition || nutritionService.buildNutrition(selectedItem.foodName, restaurant.name);
    const distance = estimateDistanceMiles(index);
    const resultLat = lat + restaurant.latOffset;
    const resultLng = lng + restaurant.lngOffset;
    const allergyWarnings = detectAllergyWarnings(user.allergies || [], nutrition.ingredients || []);

    return {
      placeId: `${restaurant.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${index + 1}`,
      name: restaurant.name,
      address: restaurant.address,
      cuisineType: restaurant.cuisineType,
      distance,
      rating: restaurant.rating,
      userRatingsTotal: restaurant.userRatingsTotal,
      reviewSnippet: `${restaurant.name} is a popular ${restaurant.cuisineType.toLowerCase()} choice with reliable menu nutrition.`,
      lat: resultLat,
      lng: resultLng,
      foodName: selectedItem.foodName,
      nutrition,
      allergyWarnings,
      restaurantImage: buildRestaurantImage(restaurant.name, restaurant.cuisineType),
      foodImage: buildFoodImage(selectedItem.foodName),
      links: {
        uberEats: restaurant.uberEatsUrl,
        doorDash: restaurant.doorDashUrl,
        mapsDirections: `https://www.google.com/maps/dir/?api=1&destination=${resultLat},${resultLng}`,
        website: restaurant.websiteUrl,
      },
    };
  }).filter((item) => item.distance <= radiusMiles);
}

async function searchFoodAndFitness(payload, userId) {
  const user = await userService.getUserOrThrow(userId);
  const preferredDietFromProfile = user.preferences?.preferredDiet || 'balanced';
  const effectiveDiet =
    payload.preferredDiet || (preferredDietFromProfile !== 'balanced' ? preferredDietFromProfile : null);

  const enriched = buildRealBrandResults(payload, user);

  const filtered = enriched.filter((item) =>
    nutritionService.matchesFilters(item.nutrition, {
      minCalories: payload.minCalories,
      maxCalories: payload.maxCalories,
      macroFocus: payload.macroFocus,
      preferredDiet: effectiveDiet,
    })
  );

  const remainingSnapshot = await nutritionPlannerService.getRemainingNutrition(userId);
  const ranked = await recommendationService.rankResults(filtered, user, remainingSnapshot);

  await searchHistoryModel.addSearchRecord({
    id: randomUUID(),
    userId,
    keyword: payload.keyword,
    lat: payload.lat,
    lng: payload.lng,
    radius: payload.radius,
    resultCount: ranked.length,
    createdAt: new Date().toISOString(),
  });

  return {
    keyword: payload.keyword,
    radius: payload.radius,
    count: ranked.length,
    userPreferenceContext: {
      preferredDiet: effectiveDiet || 'non-veg',
      macroPreference: user.preferences?.macroPreference || 'balanced',
      preferredCuisine: user.preferences?.preferredCuisine || '',
      fitnessGoal: user.preferences?.fitnessGoal || 'maintain',
      dailyCalorieGoal: user.preferences?.dailyCalorieGoal || 2200,
    },
    remainingNutrition: remainingSnapshot.remaining,
    recommendationModel: 'hybrid_v1',
    results: ranked,
  };
}

module.exports = {
  searchFoodAndFitness,
};
