const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const adminService = require('../services/adminService');

const getAllUsers = asyncHandler(async (req, res) => {
  const data = await adminService.listAllUsers();
  return sendSuccess(res, data, 'Users retrieved');
});

const getAllRestaurants = asyncHandler(async (req, res) => {
  const data = await adminService.listAllRestaurants();
  return sendSuccess(res, data, 'Restaurants retrieved');
});

const deleteRecipe = asyncHandler(async (req, res) => {
  const data = await adminService.removeRecipe(req.params.id);
  return sendSuccess(res, data, 'Recipe removed');
});

const changeUserRole = asyncHandler(async (req, res) => {
  const data = await adminService.updateUserRole(req.params.id, req.body?.role);
  return sendSuccess(res, data, 'User role updated');
});

const getContentModelPerformance = asyncHandler(async (req, res) => {
  const data = await adminService.getContentModelPerformance();
  return sendSuccess(res, data, 'Content model performance retrieved');
});

const getRecommendationModelAnalysis = asyncHandler(async (req, res) => {
  const data = await adminService.getRecommendationModelAnalysis();
  return sendSuccess(res, data, 'Recommendation model analysis retrieved');
});

const getAdaptiveSummary = asyncHandler(async (req, res) => {
  const data = await adminService.getAdaptiveSummary();
  return sendSuccess(res, data, 'Adaptive validation summary retrieved');
});

module.exports = {
  getAllUsers,
  getAllRestaurants,
  deleteRecipe,
  changeUserRole,
  getContentModelPerformance,
  getRecommendationModelAnalysis,
  getAdaptiveSummary,
};
