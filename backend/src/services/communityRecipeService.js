const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const communityRecipeModel = require('../models/communityRecipeModel');
const recipeReviewModel = require('../models/recipeReviewModel');
const userService = require('./userService');
const friendService = require('./friendService');
const { detectAllergyWarnings } = require('../utils/allergy');

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
  const ingredientNames = (recipe.ingredients || []).map((item) =>
    typeof item === 'string' ? item : item?.name
  );
  const allergyWarnings = detectAllergyWarnings(currentUser.allergies || [], [
    ...ingredientNames,
    ...(recipe.allergyNotes || []),
  ]);

  return {
    ...recipe,
    visibility: recipe.visibility || 'public',
    sharedWithUserIds: Array.isArray(recipe.sharedWithUserIds) ? recipe.sharedWithUserIds : [],
    rating,
    reviewCount,
    reviews: reviews.slice(0, 8),
    isSaved,
    allergyWarnings,
  };
}

function normalizeVisibility(value) {
  const normalized = String(value || 'public').toLowerCase();
  if (['private', 'friends', 'public'].includes(normalized)) {
    return normalized;
  }

  return 'public';
}

function canViewRecipe(recipe, viewerId, friendIdSet) {
  if (!recipe) {
    return false;
  }

  if (recipe.createdBy === viewerId) {
    return true;
  }

  const visibility = normalizeVisibility(recipe.visibility);
  const sharedList = Array.isArray(recipe.sharedWithUserIds) ? recipe.sharedWithUserIds : [];
  if (sharedList.includes(viewerId)) {
    return true;
  }

  if (visibility === 'public') {
    return true;
  }

  if (visibility === 'friends') {
    return friendIdSet.has(recipe.createdBy);
  }

  return false;
}

async function listCommunityRecipes(userId, limit = 40) {
  const [user, recipes, friendIdSet] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.listRecipes(Math.max(1, Math.min(limit, 200))),
    friendService.getFriendIdSet(userId),
  ]);

  const visibleRecipes = recipes.filter((recipe) => canViewRecipe(recipe, user.id, friendIdSet));
  const recipeCards = await Promise.all(
    visibleRecipes.map(async (recipe) => {
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
  const [user, recipe, friendIdSet] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.findRecipeById(recipeId),
    friendService.getFriendIdSet(userId),
  ]);

  if (!recipe) {
    throw new AppError('Recipe not found', 404, 'NOT_FOUND');
  }
  if (!canViewRecipe(recipe, user.id, friendIdSet)) {
    throw new AppError('You are not allowed to view this recipe', 403, 'FORBIDDEN');
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
    visibility: normalizeVisibility(payload.visibility || 'public'),
    sharedWithUserIds: [],
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

async function shareRecipe(userId, payload) {
  const [user, recipe] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.findRecipeById(payload.recipeId),
  ]);

  if (!recipe) {
    throw new AppError('Recipe not found', 404, 'NOT_FOUND');
  }
  if (recipe.createdBy !== user.id) {
    throw new AppError('Only the recipe owner can share or change visibility', 403, 'FORBIDDEN');
  }

  const updates = {};
  if (payload.visibility) {
    updates.visibility = normalizeVisibility(payload.visibility);
  }

  if (payload.targetUserId) {
    const isFriend = await friendService.areFriends(user.id, payload.targetUserId);
    if (!isFriend) {
      throw new AppError('You can share recipes only with friends', 403, 'FORBIDDEN');
    }
    const nextShared = Array.from(
      new Set([...(Array.isArray(recipe.sharedWithUserIds) ? recipe.sharedWithUserIds : []), payload.targetUserId])
    );
    updates.sharedWithUserIds = nextShared;
  }

  if (!Object.keys(updates).length) {
    throw new AppError('Provide visibility or targetUserId to share', 400, 'VALIDATION_ERROR');
  }

  const updated = await communityRecipeModel.updateRecipeById(recipe.id, updates);
  const reviews = await recipeReviewModel.listReviewsByRecipe(recipe.id, 80);
  return {
    recipe: toRecipeCard(updated, reviews, user),
  };
}

async function listFriendRecipes(userId, limit = 40) {
  const [user, recipes, friendIdSet] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.listRecipes(Math.max(1, Math.min(limit, 200))),
    friendService.getFriendIdSet(userId),
  ]);

  const visible = recipes.filter((recipe) => {
    if (recipe.createdBy === user.id) {
      return false;
    }

    const shared = Array.isArray(recipe.sharedWithUserIds) ? recipe.sharedWithUserIds : [];
    if (shared.includes(user.id)) {
      return true;
    }

    return normalizeVisibility(recipe.visibility) === 'friends' && friendIdSet.has(recipe.createdBy);
  });

  const cards = await Promise.all(
    visible.map(async (recipe) => {
      const reviews = await recipeReviewModel.listReviewsByRecipe(recipe.id, 80);
      return toRecipeCard(recipe, reviews, user);
    })
  );

  return {
    recipes: cards,
    total: cards.length,
  };
}

async function listPublicRecipes(userId, limit = 40) {
  const [user, recipes] = await Promise.all([
    userService.getUserOrThrow(userId),
    communityRecipeModel.listRecipes(Math.max(1, Math.min(limit, 200))),
  ]);

  const publicRecipes = recipes.filter((recipe) => normalizeVisibility(recipe.visibility) === 'public');
  const cards = await Promise.all(
    publicRecipes.map(async (recipe) => {
      const reviews = await recipeReviewModel.listReviewsByRecipe(recipe.id, 80);
      return toRecipeCard(recipe, reviews, user);
    })
  );

  return {
    recipes: cards,
    total: cards.length,
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
  const friendIdSet = await friendService.getFriendIdSet(user.id);
  if (!canViewRecipe(recipe, user.id, friendIdSet)) {
    throw new AppError('You are not allowed to access this recipe', 403, 'FORBIDDEN');
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
  shareRecipe,
  listFriendRecipes,
  listPublicRecipes,
  addRecipeReview,
  toggleSaveRecipe,
};
