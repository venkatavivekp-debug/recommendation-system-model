const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const searchService = require('../services/searchService');

const search = asyncHandler(async (req, res) => {
  const data = await searchService.searchFoodAndFitness(req.validatedBody, req.auth.userId);
  return sendSuccess(res, data, 'Search completed');
});

module.exports = {
  search,
};
