const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const dashboardService = require('../services/dashboardService');
const userService = require('../services/userService');

const getDashboardSummary = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const summary = await dashboardService.getDashboardSummary(user);
  return sendSuccess(res, summary, 'Dashboard summary retrieved');
});

module.exports = {
  getDashboardSummary,
};
