const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const foodLookupService = require('../services/foodLookupService');
const userService = require('../services/userService');

const lookupFood = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const allergies = Array.isArray(user.allergies) ? user.allergies : [];

  const item = await foodLookupService.lookupFood({
    ...req.validatedBody,
    allergies,
  });

  const alternatives = await foodLookupService.globalSearchFoods({
    query: req.validatedBody.query,
    allergies,
    limit: 6,
  });

  return sendSuccess(
    res,
    {
      item,
      alternatives,
    },
    'Food lookup completed'
  );
});

const searchGlobalFoods = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const allergies = Array.isArray(user.allergies) ? user.allergies : [];

  const results = await foodLookupService.globalSearchFoods({
    query: req.validatedBody.query,
    allergies,
    limit: 12,
  });

  return sendSuccess(
    res,
    {
      results,
      count: results.length,
    },
    'Food search completed'
  );
});

module.exports = {
  lookupFood,
  searchGlobalFoods,
};
