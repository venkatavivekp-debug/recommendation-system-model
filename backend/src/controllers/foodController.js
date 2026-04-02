const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const foodLookupService = require('../services/foodLookupService');
const foodResolutionService = require('../services/foodResolutionService');
const foodVisionService = require('../services/foodVisionService');
const userService = require('../services/userService');
const { ATHENS_GEORGIA_CENTER } = require('../utils/travel');

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

function toNumberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const detectFood = asyncHandler(async (req, res) => {
  const detection = await foodVisionService.detectFood({
    file: req.file,
    imageBase64: req.body?.imageBase64,
    fileName: req.body?.fileName,
    mimeType: req.body?.mimeType,
  });

  const resolution = await foodResolutionService.resolveFood({
    userId: req.auth.userId,
    foodName: detection.foodName,
    lat: toNumberOrFallback(req.body?.lat, ATHENS_GEORGIA_CENTER.lat),
    lng: toNumberOrFallback(req.body?.lng, ATHENS_GEORGIA_CENTER.lng),
    radius: toNumberOrFallback(req.body?.radius, 5),
  });

  return sendSuccess(
    res,
    {
      detection,
      resolution,
    },
    'Food detected and resolved'
  );
});

const resolveFood = asyncHandler(async (req, res) => {
  const foodName = String(req.body?.foodName || req.validatedBody?.query || '').trim();
  if (!foodName) {
    throw new AppError('foodName is required', 400, 'VALIDATION_ERROR');
  }

  const resolution = await foodResolutionService.resolveFood({
    userId: req.auth.userId,
    foodName,
    lat: req.body?.lat,
    lng: req.body?.lng,
    radius: req.body?.radius,
  });

  return sendSuccess(
    res,
    {
      query: foodName,
      resolution,
    },
    'Food resolution completed'
  );
});

module.exports = {
  lookupFood,
  searchGlobalFoods,
  detectFood,
  resolveFood,
};
