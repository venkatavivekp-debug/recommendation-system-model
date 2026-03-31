const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const communityRecipeModel = require('../models/communityRecipeModel');
const recipeReviewModel = require('../models/recipeReviewModel');
const userService = require('./userService');

function avgRating(reviews) {
  if (!reviews.length) {
    return null;
  }

  const total = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0);
  return Number((total / reviews.length).toFixed(2));
}

function toRecipeCard(recipe, reviews, currentUser) {
  const reviewCount = reviews.length;
  const rating = avgRating(reviews);
  const isSaved = (currentUser.savedRecipeIds || []).includes(recipe.id);

  return {
    ...recipe,
    rating,
    reviewCount,
    reviews: reviews.slice(0, 8),
    isSaved,
  };
}

async function listCommunityRecipes(userId, limit = 40) {
  const [user, recipes] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.listRecipes(Math.max(1, Math.min(limit, 200))),
  ]);

  const recipeCards = await Promise.all(
    recipes.map(async (recipe) => {
      const reviews = await recipeReviewModel.listReviewsByRecipe(recipe.id, 80);
      return toRecipeCard(recipe, reviews, user);
    })
  );

  return {
    recipes: recipeCards,
    total: recipeCards.length,
  };
}

async function getRecipeById(userId, recipeId) {
  const [user, recipe] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.findRecipeById(recipeId),
  ]);

  if (!recipe) {
    throw new AppError('Recipe not found', 404, 'NOT_FOUND');
  }

  const reviews = await recipeReviewModel.listReviewsByRecipe(recipe.id, 200);
  return toRecipeCard(recipe, reviews, user);
}

async function createCommunityRecipe(userId, payload) {
  const user = await userService.getUserOrThrow(userId);

  const recipe = {
    id: randomUUID(),
    title: payload.title,
    ingredients: payload.ingredients,
    steps: payload.steps,
    macros: payload.macros,
    prepTimeMinutes: payload.prepTimeMinutes,
    allergyNotes: payload.allergyNotes || [],
    whyFitsPlan: payload.whyFitsPlan || '',
    youtubeLink: payload.youtubeLink || '',
    imageUrl: payload.imageUrl || '',
    createdBy: user.id,
    createdByName: `${user.firstName} ${user.lastName}`.trim(),
    savedByUserIds: [],
    createdAt: new Date().toISOString(),
  };

  const created = await communityRecipeModel.createRecipe(recipe);
  return {
    recipe: toRecipeCard(created, [], user),
  };
}

async function addRecipeReview(userId, recipeId, payload) {
  const [user, recipe] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.findRecipeById(recipeId),
  ]);

  if (!recipe) {
    throw new AppError('Recipe not found', 404, 'NOT_FOUND');
  }

  const review = {
    id: randomUUID(),
    recipeId,
    userId,
    userName: `${user.firstName} ${user.lastName}`.trim(),
    rating: payload.rating,
    comment: payload.comment || '',
    createdAt: new Date().toISOString(),
  };

  await recipeReviewModel.createReview(review);

  const reviews = await recipeReviewModel.listReviewsByRecipe(recipeId, 200);
  return {
    recipe: toRecipeCard(recipe, reviews, user),
    review,
  };
}

async function toggleSaveRecipe(userId, recipeId) {
  const [user, recipe] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.findRecipeById(recipeId),
  ]);

  if (!recipe) {
    throw new AppError('Recipe not found', 404, 'NOT_FOUND');
  }

  const currentSaved = Array.isArray(user.savedRecipeIds) ? user.savedRecipeIds : [];
  const wasSaved = currentSaved.includes(recipeId);

  const nextSaved = wasSaved
    ? currentSaved.filter((id) => id !== recipeId)
    : [...currentSaved, recipeId];

  const recipeSavedBy = Array.isArray(recipe.savedByUserIds) ? recipe.savedByUserIds : [];
  const nextRecipeSavedBy = wasSaved
    ? recipeSavedBy.filter((id) => id !== userId)
    : [...recipeSavedBy, userId];

  await Promise.all([
    userService.updateUser(userId, { savedRecipeIds: nextSaved }),
    communityRecipeModel.updateRecipeById(recipeId, { savedByUserIds: nextRecipeSavedBy }),
  ]);

  return {
    saved: !wasSaved,
    savedRecipeIds: nextSaved,
  };
}

module.exports = {
  listCommunityRecipes,
  getRecipeById,
  createCommunityRecipe,
  addRecipeReview,
  toggleSaveRecipe,
};
