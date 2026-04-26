const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const dashboardService = require('../services/dashboardService');
const userService = require('../services/userService');
const fallbackReliabilityService = require('../services/fallbackReliabilityService');
const { withTimeout } = require('../utils/timeout');

const DASHBOARD_TIMEOUT_MS = 9000;

const getDashboardSummary = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  let summary;
  try {
    summary = await withTimeout(
      dashboardService.getDashboardSummary(user),
      DASHBOARD_TIMEOUT_MS,
      'dashboard-timeout'
    );
  } catch (_error) {
    summary = fallbackReliabilityService.getDashboardFallback(user);
  }
  return sendSuccess(res, summary, 'Dashboard summary retrieved');
});

module.exports = {
  getDashboardSummary,
};
