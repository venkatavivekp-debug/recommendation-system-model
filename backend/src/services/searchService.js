const { randomUUID } = require('crypto');
const googlePlacesService = require('./googlePlacesService');
const nutritionService = require('./nutritionService');
const recommendationService = require('./recommendationService');
const nutritionPlannerService = require('./nutritionPlannerService');
const userService = require('./userService');
const searchHistoryModel = require('../models/searchHistoryModel');
const { detectAllergyWarnings } = require('../utils/allergy');

async function searchFoodAndFitness(payload, userId) {
  const user = await userService.getUserOrThrow(userId);
  const preferredDietFromProfile = user.preferences?.preferredDiet || 'balanced';
  const effectiveDiet =
    payload.preferredDiet || (preferredDietFromProfile !== 'balanced' ? preferredDietFromProfile : null);

  const places = await googlePlacesService.searchNearbyRestaurants({
    keyword: payload.keyword,
    lat: payload.lat,
    lng: payload.lng,
    radiusMiles: payload.radius,
    enrichDetails: true,
  });

  const enriched = places.map((place) => {
    const nutrition = nutritionService.buildNutrition(payload.keyword, place.placeId);
    const allergyWarnings = detectAllergyWarnings(user.allergies || [], nutrition.ingredients || []);

    return {
      ...place,
      foodName: place.foodName || payload.keyword,
      nutrition,
      allergyWarnings,
      links: {
        uberEats: `https://www.ubereats.com/search?q=${encodeURIComponent(
          `${place.name} ${place.foodName || payload.keyword}`
        )}`,
        doorDash: `https://www.doordash.com/search/store/${encodeURIComponent(
          `${place.name} ${place.foodName || payload.keyword}`
        )}`,
        mapsDirections: `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`,
        website:
          place.websiteUrl ||
          place.mapsUrl ||
          place.websiteSearchUrl ||
          `https://www.google.com/search?q=${encodeURIComponent(`${place.name} restaurant`)}`,
      },
    };
  });

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
