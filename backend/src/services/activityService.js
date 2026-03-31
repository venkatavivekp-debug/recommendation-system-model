const { randomUUID } = require('crypto');
const activityModel = require('../models/activityModel');

async function createActivity(userId, payload) {
  const record = {
    id: randomUUID(),
    userId,
    foodName: payload.foodName,
    restaurantName: payload.restaurantName,
    restaurantAddress: payload.restaurantAddress || '',
    caloriesConsumed: payload.caloriesConsumed,
    caloriesBurned: payload.caloriesBurned,
    distanceMiles: payload.distanceMiles,
    travelMode: payload.travelMode,
    recommendationMessage: payload.recommendationMessage || '',
    nutrition: {
      calories: payload.nutrition?.calories || payload.caloriesConsumed,
      protein: payload.nutrition?.protein || 0,
      carbs: payload.nutrition?.carbs || 0,
      fats: payload.nutrition?.fats || 0,
    },
    createdAt: new Date().toISOString(),
  };

  return activityModel.createActivity(record);
}

async function getActivityHistory(userId, limit = 25) {
  return activityModel.listActivitiesByUser(userId, limit);
}

module.exports = {
  createActivity,
  getActivityHistory,
};
