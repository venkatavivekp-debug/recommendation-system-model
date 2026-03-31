const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const mealService = require('../services/mealService');

const createMeal = asyncHandler(async (req, res) => {
  const meal = await mealService.createMeal(req.auth.userId, req.validatedBody);
  return sendSuccess(res, { meal }, 'Meal logged', 201);
});

const updateMeal = asyncHandler(async (req, res) => {
  const meal = await mealService.updateMeal(req.auth.userId, req.params.mealId, req.validatedBody);
  return sendSuccess(res, { meal }, 'Meal updated');
});

const deleteMeal = asyncHandler(async (req, res) => {
  const meal = await mealService.deleteMeal(req.auth.userId, req.params.mealId);
  return sendSuccess(res, { meal }, 'Meal deleted');
});

const getTodayMeals = asyncHandler(async (req, res) => {
  const data = await mealService.getTodayMeals(req.auth.userId);
  return sendSuccess(res, data, 'Today meals retrieved');
});

const getMealHistory = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 120;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 120;
  const data = await mealService.getMealHistory(req.auth.userId, safeLimit);
  return sendSuccess(res, data, 'Meal history retrieved');
});

module.exports = {
  createMeal,
  updateMeal,
  deleteMeal,
  getTodayMeals,
  getMealHistory,
};
