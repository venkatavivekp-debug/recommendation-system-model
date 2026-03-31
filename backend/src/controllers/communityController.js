const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const communityRecipeService = require('../services/communityRecipeService');

const listRecipes = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 40;
  const data = await communityRecipeService.listCommunityRecipes(req.auth.userId, limit);
  return sendSuccess(res, data, 'Community recipes retrieved');
});

const getRecipe = asyncHandler(async (req, res) => {
  const recipe = await communityRecipeService.getRecipeById(req.auth.userId, req.params.recipeId);
  return sendSuccess(res, { recipe }, 'Recipe retrieved');
});

const createRecipe = asyncHandler(async (req, res) => {
  const data = await communityRecipeService.createCommunityRecipe(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Recipe created', 201);
});

const shareRecipe = asyncHandler(async (req, res) => {
  const data = await communityRecipeService.shareRecipe(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Recipe sharing updated');
});

const listFriendRecipes = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 40;
  const data = await communityRecipeService.listFriendRecipes(req.auth.userId, limit);
  return sendSuccess(res, data, 'Friend-visible recipes retrieved');
});

const listPublicRecipes = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 40;
  const data = await communityRecipeService.listPublicRecipes(req.auth.userId, limit);
  return sendSuccess(res, data, 'Public recipes retrieved');
});

const addReview = asyncHandler(async (req, res) => {
  const data = await communityRecipeService.addRecipeReview(
    req.auth.userId,
    req.params.recipeId,
    req.validatedBody
  );

  return sendSuccess(res, data, 'Recipe review submitted', 201);
});

const toggleSave = asyncHandler(async (req, res) => {
  const data = await communityRecipeService.toggleSaveRecipe(req.auth.userId, req.params.recipeId);
  return sendSuccess(res, data, data.saved ? 'Recipe saved' : 'Recipe removed from saved');
});

module.exports = {
  listRecipes,
  getRecipe,
  createRecipe,
  shareRecipe,
  listFriendRecipes,
  listPublicRecipes,
  addReview,
  toggleSave,
};
