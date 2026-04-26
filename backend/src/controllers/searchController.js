const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { withTimeout } = require('../utils/timeout');
const searchService = require('../services/searchService');

const SEARCH_TIMEOUT_MS = 4500;

const search = asyncHandler(async (req, res) => {
  let data;
  try {
    data = await withTimeout(
      searchService.searchFoodAndFitness(req.validatedBody, req.auth.userId),
      SEARCH_TIMEOUT_MS,
      'search-timeout'
    );
  } catch (_error) {
    data = await searchService.buildFallbackSearchResponse(req.validatedBody, req.auth.userId);
  }
  return sendSuccess(res, data, 'Search completed');
});

module.exports = {
  search,
};
