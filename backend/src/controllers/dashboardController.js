const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const dashboardService = require('../services/dashboardService');
const userService = require('../services/userService');
const demoFallbackService = require('../services/demoFallbackService');

const getDashboardSummary = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  let summary;
  try {
    summary = await Promise.race([
      dashboardService.getDashboardSummary(user),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('dashboard-timeout')), 4500)
      ),
    ]);
  } catch (_error) {
    summary = demoFallbackService.getDashboardFallback(user);
  }
  return sendSuccess(res, summary, 'Dashboard summary retrieved');
});

module.exports = {
  getDashboardSummary,
};
