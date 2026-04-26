const AppError = require('../utils/appError');
const userService = require('./userService');
const restaurantModel = require('../models/restaurantModel');
const communityRecipeModel = require('../models/communityRecipeModel');
const recipeReviewModel = require('../models/recipeReviewModel');
const evaluationService = require('./evaluationService');
const adaptiveValidationService = require('./adaptiveValidationService');

async function listAllUsers() {
  const users = await userService.getAllUsers();
  return {
    users: (users || []).map((user) => userService.sanitizeUser(user)),
  };
}

async function listAllRestaurants() {
  const restaurants = await restaurantModel.listRestaurants(400);
  return { restaurants };
}

async function removeRecipe(recipeId) {
  const recipe = await communityRecipeModel.deleteRecipeById(recipeId);
  if (!recipe) {
    throw new AppError('Recipe not found', 404, 'NOT_FOUND');
  }

  await recipeReviewModel.deleteReviewsByRecipe(recipeId);

  return {
    removedRecipe: recipe,
  };
}

async function updateUserRole(userId, role) {
  const normalizedRole = String(role || '').toLowerCase();
  if (!['admin', 'vendor', 'user'].includes(normalizedRole)) {
    throw new AppError('Role must be admin, vendor, or user', 400, 'VALIDATION_ERROR');
  }

  const user = await userService.getUserOrThrow(userId);
  const updated = await userService.updateUser(user.id, { role: normalizedRole });
  return {
    user: userService.sanitizeUser(updated),
  };
}

async function getContentModelPerformance() {
  const metrics = await evaluationService.getGlobalContentMetrics(6000);
  return {
    metrics,
  };
}

async function getRecommendationModelAnalysis() {
  const analysis = await evaluationService.getGlobalRecommendationModelAnalysis({
    perUserLimit: 45,
  });
  return { analysis };
}

async function getAdaptiveSummary() {
  return adaptiveValidationService.getAdaptiveSummary();
}

module.exports = {
  listAllUsers,
  listAllRestaurants,
  removeRecipe,
  updateUserRole,
  getContentModelPerformance,
  getRecommendationModelAnalysis,
  getAdaptiveSummary,
};
