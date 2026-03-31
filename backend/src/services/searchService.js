const { randomUUID } = require('crypto');
const googlePlacesService = require('./googlePlacesService');
const nutritionService = require('./nutritionService');
const recommendationService = require('./recommendationService');
const userService = require('./userService');
const searchHistoryModel = require('../models/searchHistoryModel');

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

    return {
      ...place,
      foodName: place.foodName || payload.keyword,
      nutrition,
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

  const ranked = recommendationService.rankResults(filtered, user);

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
      preferredDiet: effectiveDiet || 'balanced',
      macroPreference: user.preferences?.macroPreference || 'balanced',
      preferredCuisine: user.preferences?.preferredCuisine || '',
      fitnessGoal: user.preferences?.fitnessGoal || 'maintain',
      dailyCalorieGoal: user.preferences?.dailyCalorieGoal || 2200,
    },
    results: ranked,
  };
}

module.exports = {
  searchFoodAndFitness,
};
