const { randomUUID } = require('crypto');
const googlePlacesService = require('./googlePlacesService');
const nutritionService = require('./nutritionService');
const searchHistoryModel = require('../models/searchHistoryModel');

async function searchFoodAndFitness(payload, userId) {
  const places = await googlePlacesService.searchNearbyRestaurants({
    keyword: payload.keyword,
    lat: payload.lat,
    lng: payload.lng,
    radiusMiles: payload.radius,
  });

  const enriched = places.map((place) => {
    const nutrition = nutritionService.buildNutrition(payload.keyword, place.placeId);

    return {
      ...place,
      nutrition,
    };
  });

  const filtered = enriched.filter((item) =>
    nutritionService.matchesFilters(item.nutrition, {
      minCalories: payload.minCalories,
      maxCalories: payload.maxCalories,
      macroFocus: payload.macroFocus,
    })
  );

  await searchHistoryModel.addSearchRecord({
    id: randomUUID(),
    userId,
    keyword: payload.keyword,
    lat: payload.lat,
    lng: payload.lng,
    radius: payload.radius,
    resultCount: filtered.length,
    createdAt: new Date().toISOString(),
  });

  return {
    keyword: payload.keyword,
    radius: payload.radius,
    count: filtered.length,
    results: filtered,
  };
}

module.exports = {
  searchFoodAndFitness,
};
