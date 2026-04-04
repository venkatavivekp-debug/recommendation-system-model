const { randomUUID } = require('crypto');
const env = require('../config/env');
const recommendationService = require('./recommendationService');
const nutritionPlannerService = require('./nutritionPlannerService');
const userService = require('./userService');
const searchHistoryModel = require('../models/searchHistoryModel');
const googlePlacesService = require('./googlePlacesService');
const nutritionService = require('./nutritionService');
const contentRecommendationService = require('./contentRecommendationService');
const { detectAllergyWarnings } = require('../utils/allergy');
const { buildRestaurantImage, buildFoodImage } = require('../utils/media');
const { haversineMiles } = require('../utils/geo');
const {
  ATHENS_GEORGIA_CENTER,
  normalizeSearchOrigin,
  buildTravelEstimates,
} = require('../utils/travel');

const PLACE_CACHE_TTL_MS = 5 * 60 * 1000;
const placeSearchCache = new Map();

const ATHENS_RESTAURANT_FALLBACKS = [
  {
    name: "The Place",
    cuisineType: 'Southern',
    rating: 4.6,
    userRatingsTotal: 1800,
    websiteUrl: 'https://www.theplaceathens.com',
    address: '229 E Broad St, Athens, GA 30601',
    lat: 33.9594,
    lng: -83.3738,
  },
  {
    name: "Mamma's Boy",
    cuisineType: 'Breakfast',
    rating: 4.5,
    userRatingsTotal: 2400,
    websiteUrl: 'https://mamasboyathens.com',
    address: '197 Oak St, Athens, GA 30601',
    lat: 33.9539,
    lng: -83.3655,
  },
  {
    name: 'Taqueria Tsunami',
    cuisineType: 'Mexican Fusion',
    rating: 4.4,
    userRatingsTotal: 1500,
    websiteUrl: 'https://taqueriatsunami.com',
    address: '320 E Clayton St, Athens, GA 30601',
    lat: 33.9588,
    lng: -83.3731,
  },
  {
    name: 'Your Pie Athens',
    cuisineType: 'Pizza',
    rating: 4.3,
    userRatingsTotal: 1300,
    websiteUrl: 'https://yourpie.com',
    address: '175 N Lumpkin St, Athens, GA 30601',
    lat: 33.9586,
    lng: -83.3774,
  },
  {
    name: 'Chipotle Athens',
    cuisineType: 'Mexican',
    rating: 4.2,
    userRatingsTotal: 2200,
    websiteUrl: 'https://www.chipotle.com',
    address: '1850 Epps Bridge Pkwy, Athens, GA 30606',
    lat: 33.9329,
    lng: -83.4419,
  },
  {
    name: "McDonald's Athens",
    cuisineType: 'Fast Food',
    rating: 4.0,
    userRatingsTotal: 3300,
    websiteUrl: 'https://www.mcdonalds.com',
    address: '121 Alps Rd, Athens, GA 30606',
    lat: 33.9485,
    lng: -83.4161,
  },
  {
    name: 'KFC Athens',
    cuisineType: 'Fried Chicken',
    rating: 3.9,
    userRatingsTotal: 1200,
    websiteUrl: 'https://www.kfc.com',
    address: '196 Alps Rd, Athens, GA 30606',
    lat: 33.9437,
    lng: -83.4107,
  },
  {
    name: 'Subway Athens',
    cuisineType: 'Sandwiches',
    rating: 4.1,
    userRatingsTotal: 1000,
    websiteUrl: 'https://www.subway.com',
    address: '437 E Broad St, Athens, GA 30601',
    lat: 33.9598,
    lng: -83.371,
  },
  {
    name: 'Taco Bell Athens',
    cuisineType: 'Tex-Mex',
    rating: 4.0,
    userRatingsTotal: 1700,
    websiteUrl: 'https://www.tacobell.com',
    address: '1905 W Broad St, Athens, GA 30606',
    lat: 33.9514,
    lng: -83.4063,
  },
  {
    name: 'Chick-fil-A Athens',
    cuisineType: 'Chicken',
    rating: 4.4,
    userRatingsTotal: 4300,
    websiteUrl: 'https://www.chick-fil-a.com',
    address: '1875 W Broad St, Athens, GA 30606',
    lat: 33.951,
    lng: -83.4043,
  },
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildSearchLinks(name, foodName, lat, lng, websiteUrl = '') {
  const phrase = `${name || ''} ${foodName || ''}`.trim();
  const website = websiteUrl || `https://www.google.com/search?q=${encodeURIComponent(`${name} restaurant`)}`;

  return {
    uberEats: `https://www.ubereats.com/search?q=${encodeURIComponent(phrase)}`,
    doorDash: `https://www.doordash.com/search/store/${encodeURIComponent(phrase)}`,
    mapsDirections: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    website,
  };
}

function normalizePlaceDistance(place, origin) {
  if (Number.isFinite(Number(place.distance))) {
    return Number(place.distance);
  }

  return haversineMiles(origin.lat, origin.lng, Number(place.lat), Number(place.lng));
}

function buildAthensFallbackPlaces({ keyword, origin, radiusMiles }) {
  const normalizedKeyword = normalizeText(keyword);

  return ATHENS_RESTAURANT_FALLBACKS.map((item, index) => {
    const distance = haversineMiles(origin.lat, origin.lng, item.lat, item.lng);
    return {
      placeId: `athens-fallback-${index + 1}`,
      name: item.name,
      address: item.address,
      rating: item.rating,
      userRatingsTotal: item.userRatingsTotal,
      cuisineType: item.cuisineType,
      lat: item.lat,
      lng: item.lng,
      distance,
      reviewSnippet:
        normalizedKeyword.length > 1
          ? `${item.name} is a solid ${item.cuisineType.toLowerCase()} choice in Athens for ${keyword}.`
          : `${item.name} is a popular Athens ${item.cuisineType.toLowerCase()} option.`,
      restaurantImage: buildRestaurantImage(item.name, item.cuisineType),
      foodImage: buildFoodImage(keyword),
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}`,
      websiteUrl: item.websiteUrl,
      sourceType: 'athens_fallback',
    };
  })
    .filter((place) => place.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}

function isMockPlaceResult(places = []) {
  if (!Array.isArray(places) || !places.length) {
    return false;
  }

  return places.every((item) => String(item.placeId || '').startsWith('mock-place-'));
}

function buildCacheKey({ keyword, origin, radiusMiles }) {
  return [
    normalizeText(keyword),
    Number(origin.lat).toFixed(3),
    Number(origin.lng).toFixed(3),
    Number(radiusMiles).toFixed(1),
  ].join('|');
}

function getCachedPlaces(cacheKey) {
  const cached = placeSearchCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > PLACE_CACHE_TTL_MS) {
    placeSearchCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setCachedPlaces(cacheKey, places) {
  placeSearchCache.set(cacheKey, {
    createdAt: Date.now(),
    data: Array.isArray(places) ? places : [],
  });
}

async function fetchPlaceCandidates({ keyword, origin, radiusMiles }) {
  const cacheKey = buildCacheKey({ keyword, origin, radiusMiles });
  const cached = getCachedPlaces(cacheKey);
  if (cached) {
    return cached;
  }

  if (!env.googleApiKey) {
    const fallback = buildAthensFallbackPlaces({ keyword, origin, radiusMiles });
    setCachedPlaces(cacheKey, fallback);
    return fallback;
  }

  try {
    const places = await googlePlacesService.searchNearbyRestaurants({
      keyword,
      lat: origin.lat,
      lng: origin.lng,
      radiusMiles,
      enrichDetails: true,
    });

    if (!places.length || isMockPlaceResult(places)) {
      const fallback = buildAthensFallbackPlaces({ keyword, origin, radiusMiles });
      setCachedPlaces(cacheKey, fallback);
      return fallback;
    }

    const normalized = places
      .map((item) => ({
        ...item,
        sourceType: 'google_places',
      }))
      .slice(0, 25);
    setCachedPlaces(cacheKey, normalized);
    return normalized;
  } catch (error) {
    const fallback = buildAthensFallbackPlaces({ keyword, origin, radiusMiles });
    setCachedPlaces(cacheKey, fallback);
    return fallback;
  }
}

function toSearchResult(place, { keyword, user, origin, bodyWeightKg }) {
  const foodName = keyword;
  const nutrition = nutritionService.buildNutrition(foodName, place.placeId || place.name);
  const distance = normalizePlaceDistance(place, origin);
  const travel = buildTravelEstimates(distance, bodyWeightKg);
  const allergyWarnings = detectAllergyWarnings(user.allergies || [], nutrition.ingredients || []);
  const links = buildSearchLinks(place.name, foodName, place.lat, place.lng, place.websiteUrl || place.websiteSearchUrl || '');

  return {
    placeId: place.placeId || `${normalizeText(place.name).replace(/[^a-z0-9]/g, '-')}`,
    name: place.name,
    address: place.address || 'Athens, Georgia',
    cuisineType: place.cuisineType || 'Restaurant',
    distance: Number(distance.toFixed(2)),
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    userRatingsTotal: Number(place.userRatingsTotal || 0),
    reviewSnippet: place.reviewSnippet || '',
    lat: Number(place.lat),
    lng: Number(place.lng),
    foodName,
    nutrition,
    allergyWarnings,
    restaurantImage: place.restaurantImage || buildRestaurantImage(place.name, place.cuisineType || 'Restaurant'),
    foodImage: place.foodImage || buildFoodImage(foodName),
    links,
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
    sourceType: place.sourceType || 'google_places',
  };
}

async function searchFoodAndFitness(payload, userId) {
  const user = await userService.getUserOrThrow(userId);
  const preferredDietFromProfile = user.preferences?.preferredDiet || 'balanced';
  const effectiveDiet =
    payload.preferredDiet || (preferredDietFromProfile !== 'balanced' ? preferredDietFromProfile : null);

  const origin = normalizeSearchOrigin(payload.lat, payload.lng);
  const radiusMiles = clamp(toNumber(payload.radius, 5), 1, 20);
  const bodyWeightKg = toNumber(user.bodyWeightKg, 70);

  const places = await fetchPlaceCandidates({
    keyword: payload.keyword,
    origin,
    radiusMiles,
  });

  const enriched = places.map((place) =>
    toSearchResult(place, {
      keyword: payload.keyword,
      user,
      origin,
      bodyWeightKg,
    })
  );

  const filtered = enriched.filter((item) =>
    nutritionService.matchesFilters(item.nutrition, {
      minCalories: payload.minCalories,
      maxCalories: payload.maxCalories,
      macroFocus: payload.macroFocus,
      preferredDiet: effectiveDiet,
    })
  );

  const remainingSnapshot = await nutritionPlannerService.getRemainingNutrition(userId, {
    lat: origin.lat,
    lng: origin.lng,
    radius: radiusMiles,
  });

  const ranked = await recommendationService.rankResults(filtered, user, remainingSnapshot, {
    intent: payload.intent || 'delivery',
    keyword: payload.keyword,
  });

  const topResult = ranked[0] || null;
  let contentSuggestions = {};
  try {
    contentSuggestions = await contentRecommendationService.getContextBundle(
      user,
      [
        {
          key: 'whileEating',
          contextType:
            payload.intent === 'pickup' || payload.intent === 'go-there' ? 'eat_out' : 'eat_in',
          sessionMinutes: 45,
          limit: 3,
        },
        {
          key: 'walkingMusic',
          contextType: 'walking',
          etaMinutes: Number(topResult?.route?.walking?.minutes || 24),
          activityType: 'walking',
          limit: 3,
        },
      ],
      { logImpressions: false }
    );
  } catch (error) {
    contentSuggestions = {};
  }

  await searchHistoryModel.addSearchRecord({
    id: randomUUID(),
    userId,
    keyword: payload.keyword,
    lat: origin.lat,
    lng: origin.lng,
    radius: radiusMiles,
    resultCount: ranked.length,
    createdAt: new Date().toISOString(),
  });

  return {
    keyword: payload.keyword,
    radius: radiusMiles,
    count: ranked.length,
    searchLocation: {
      lat: origin.lat,
      lng: origin.lng,
      source: origin.source,
      label:
        origin.source === 'user_location'
          ? 'Using your current location'
          : 'Using Athens, Georgia fallback location',
    },
    userPreferenceContext: {
      preferredDiet: effectiveDiet || 'non-veg',
      macroPreference: user.preferences?.macroPreference || 'balanced',
      preferredCuisine: user.preferences?.preferredCuisine || '',
      fitnessGoal: user.preferences?.fitnessGoal || 'maintain',
      dailyCalorieGoal: user.preferences?.dailyCalorieGoal || 2200,
    },
    remainingNutrition: remainingSnapshot.remaining,
    recommendationModel: 'time_mcl_winner_take_all_v1',
    contentSuggestions,
    results: ranked,
    defaults: {
      athensCenter: ATHENS_GEORGIA_CENTER,
    },
  };
}

module.exports = {
  searchFoodAndFitness,
};
