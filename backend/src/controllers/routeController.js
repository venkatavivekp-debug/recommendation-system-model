const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const routeService = require('../services/routeService');

const getRouteSummary = asyncHandler(async (req, res) => {
  const data = await routeService.buildRouteSummary(req.validatedBody);
  return sendSuccess(res, data, 'Route summary generated');
});

module.exports = {
  getRouteSummary,
};
