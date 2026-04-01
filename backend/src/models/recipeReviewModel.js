const { isMongoEnabled } = require('../config/database');
const RecipeReviewDocument = require('./mongo/recipeReviewDocument');
const dataStore = require('./dataStore');

async function createReview(record) {
  if (isMongoEnabled()) {
    const created = await RecipeReviewDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.recipeReviews = data.recipeReviews || [];
    data.recipeReviews.push(record);
    return data;
  });

  return record;
}

async function listReviewsByRecipe(recipeId, limit = 200) {
  if (isMongoEnabled()) {
    return RecipeReviewDocument.find({ recipeId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.recipeReviews || [])
    .filter((review) => review.recipeId === recipeId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function deleteReviewsByRecipe(recipeId) {
  if (isMongoEnabled()) {
    await RecipeReviewDocument.deleteMany({ recipeId });
    return;
  }

  await dataStore.updateData((data) => {
    data.recipeReviews = (data.recipeReviews || []).filter((review) => review.recipeId !== recipeId);
    return data;
  });
}

module.exports = {
  createReview,
  listReviewsByRecipe,
  deleteReviewsByRecipe,
};
