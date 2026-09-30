const { randomUUID } = require('crypto');
const recommendationService = require('./recommendationService');
const nutritionPlannerService = require('./nutritionPlannerService');
const userService = require('./userService');
const searchHistoryModel = require('../models/searchHistoryModel');
const googlePlacesService = require('./googlePlacesService');
const restaurantProviderService = require('./restaurantProviderService');
const feedbackStorageService = require('./feedbackStorageService');
const banditDecisionService = require('./banditDecisionService');
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


const KNOWN_RESTAURANT_NUTRITION = [
  {
    match: /mcdonald/i,
    nutrition: {
      calories: 700,
      protein: 25,
      carbs: 74,
      fats: 34,
      ingredients: ['beef patty', 'bun', 'cheese', 'lettuce'],
      dietTags: ['balanced', 'non-veg'],
    },
  },
  {
    match: /kfc/i,
    nutrition: {
      calories: 850,
      protein: 35,
      carbs: 66,
      fats: 46,
      ingredients: ['fried chicken', 'flour coating', 'oil', 'seasoning'],
      dietTags: ['high-protein', 'non-veg'],
    },
  },
  {
    match: /chipotle/i,
    nutrition: {
      calories: 650,
      protein: 40,
      carbs: 62,
      fats: 24,
      ingredients: ['chicken', 'rice', 'beans', 'salsa'],
      dietTags: ['balanced', 'high-protein', 'non-veg'],
    },
  },
  {
    match: /subway/i,
    nutrition: {
      calories: 400,
      protein: 20,
      carbs: 44,
      fats: 11,
      ingredients: ['whole wheat bread', 'turkey', 'lettuce', 'tomato'],
      dietTags: ['balanced', 'non-veg'],
    },
  },
  {
    match: /taco bell/i,
    nutrition: {
      calories: 550,
      protein: 18,
      carbs: 58,
      fats: 24,
      ingredients: ['tortilla', 'beef', 'lettuce', 'cheese'],
      dietTags: ['balanced', 'non-veg'],
    },
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


function resolveKnownNutrition(place, keyword) {
  if (place?.nutritionBaseline) {
    return {
      fiber: 4,
      ...place.nutritionBaseline,
    };
  }

  const matched = KNOWN_RESTAURANT_NUTRITION.find((entry) =>
    entry.match.test(String(place?.name || ''))
  );
  if (matched) {
    return {
      fiber: 4,
      ...matched.nutrition,
    };
  }

  return nutritionService.buildNutrition(keyword, place.placeId || place.name);
}


function toSearchResult(place, { keyword, user, origin, bodyWeightKg }) {
  const foodName = keyword;
  const nutrition = resolveKnownNutrition(place, foodName);
  const distance = normalizePlaceDistance(place, origin);
  const travel = buildTravelEstimates(distance, bodyWeightKg);
  const allergyWarnings = detectAllergyWarnings(user.allergies || [], nutrition.ingredients || []);
  const links = buildSearchLinks(place.name, foodName, place.lat, place.lng, place.websiteUrl || place.websiteSearchUrl || '');

  return {
    placeId: place.placeId || `${normalizeText(place.name).replace(/[^a-z0-9]/g, '-')}`,
    name: place.name,
    address: place.address || 'Address unavailable',
    cuisineType: place.cuisineType || 'Restaurant',
    distance: Number(distance.toFixed(2)),
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    userRatingsTotal: Number(place.userRatingsTotal || 0),
    reviewSnippet: place.reviewSnippet || '',
    lat: Number(place.lat),
    lng: Number(place.lng),
    foodName,
    nutrition: { ...nutrition, estimated: true },
    nutritionSource: 'illustrative_estimate',
    legacyIds: place.legacyIds || [],
    provider: place.provider,
    sourceMetadata: place.sourceMetadata,
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

  const discovery = await restaurantProviderService.searchNearbyRestaurants({
    keyword: payload.keyword,
    lat: origin.lat,
    lng: origin.lng,
    radiusMiles,
  });

  const enriched = discovery.candidates.map((place) =>
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
  const candidates = filtered.length ? filtered : enriched;

  const remainingSnapshot = await nutritionPlannerService.getRemainingNutrition(userId, {
    lat: origin.lat,
    lng: origin.lng,
    radius: radiusMiles,
  });

  const ranked = await recommendationService.rankResults(candidates, user, remainingSnapshot, {
    intent: payload.intent || 'delivery',
    feedbackContext: 'search',
    limit: 10,
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
    candidateSource: { ...discovery.source, filteredCount: filtered.length, rankedPoolCount: candidates.length, finalCount: ranked.length },
    filterRelaxed: filtered.length === 0 && enriched.length > 0,
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

async function buildFallbackSearchResponse(payload, userId) {
  const keyword = String(payload?.keyword || 'healthy meal').trim() || 'healthy meal';
  const user = await userService.getUserOrThrow(userId);
  const origin = normalizeSearchOrigin(payload?.lat, payload?.lng);
  const radiusMiles = clamp(toNumber(payload?.radius, 5), 1, 20);
  const bodyWeightKg = toNumber(user.bodyWeightKg, 70);
  const places = googlePlacesService.buildAthensFallbackPlaces({ keyword, lat: origin.lat, lng: origin.lng, radiusMiles });
  const mapped = places
    .map((place) =>
      toSearchResult(place, {
        keyword,
        user,
        origin,
        bodyWeightKg,
      })
    );
  const feedbackSignals = await feedbackStorageService.getFoodFeedbackProfile(userId);
  const results = banditDecisionService.rankCandidatesWithBandit(mapped, { domain: 'food', feedbackSignals, explorationRate: 0 }).slice(0, 10);

  const preferences = user.preferences || {};
  const remainingNutrition = {
    calories: Number(preferences.dailyCalorieGoal || 2200),
    protein: Number(preferences.proteinGoal || 140),
    carbs: Number(preferences.carbsGoal || 220),
    fats: Number(preferences.fatsGoal || 70),
    fiber: Number(preferences.fiberGoal || 30),
  };

  return {
    keyword,
    radius: radiusMiles,
    count: results.length,
    filterRelaxed: false,
    fallbackUsed: true,
    candidateSource: { provider: 'local', fallback: true, fallbackReason: 'search_unavailable' },
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
      preferredDiet: preferences.preferredDiet || 'non-veg',
      macroPreference: preferences.macroPreference || 'balanced',
      preferredCuisine: preferences.preferredCuisine || '',
      fitnessGoal: preferences.fitnessGoal || 'maintain',
      dailyCalorieGoal: preferences.dailyCalorieGoal || 2200,
    },
    remainingNutrition,
    recommendationModel: 'fallback_recommendation_v1',
    contentSuggestions: {},
    results,
    defaults: {
      athensCenter: ATHENS_GEORGIA_CENTER,
    },
  };
}

module.exports = {
  searchFoodAndFitness,
  buildFallbackSearchResponse,
};
