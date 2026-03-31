const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const nutritionPlannerService = require('../services/nutritionPlannerService');

const getRemainingNutrition = asyncHandler(async (req, res) => {
  const data = await nutritionPlannerService.getRemainingNutrition(req.auth.userId, req.validatedQuery || {});
  return sendSuccess(res, data, 'Remaining nutrition calculated');
});

module.exports = {
  getRemainingNutrition,
};
