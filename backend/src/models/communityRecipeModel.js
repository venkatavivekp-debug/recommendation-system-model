const { isMongoEnabled } = require('../config/database');
const CommunityRecipeDocument = require('./mongo/communityRecipeDocument');
const dataStore = require('./dataStore');

async function createRecipe(record) {
  if (isMongoEnabled()) {
    const created = await CommunityRecipeDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.communityRecipes = data.communityRecipes || [];
    data.communityRecipes.push(record);
    return data;
  });

  return record;
}

async function listRecipes(limit = 100) {
  if (isMongoEnabled()) {
    return CommunityRecipeDocument.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.communityRecipes || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function findRecipeById(recipeId) {
  if (isMongoEnabled()) {
    return CommunityRecipeDocument.findOne({ id: recipeId }).lean();
  }

  const data = await dataStore.readData();
  return (data.communityRecipes || []).find((recipe) => recipe.id === recipeId) || null;
}

async function updateRecipeById(recipeId, fields) {
  if (isMongoEnabled()) {
    return CommunityRecipeDocument.findOneAndUpdate({ id: recipeId }, { ...fields }, { new: true }).lean();
  }

  let updated = null;
  await dataStore.updateData((data) => {
    data.communityRecipes = data.communityRecipes || [];
    const index = data.communityRecipes.findIndex((recipe) => recipe.id === recipeId);
    if (index === -1) {
      return data;
    }

    data.communityRecipes[index] = {
      ...data.communityRecipes[index],
      ...fields,
    };

    updated = data.communityRecipes[index];
    return data;
  });

  return updated;
}

async function deleteRecipeById(recipeId) {
  if (isMongoEnabled()) {
    const found = await CommunityRecipeDocument.findOne({ id: recipeId }).lean();
    if (!found) {
      return null;
    }

    await CommunityRecipeDocument.deleteOne({ id: recipeId });
    return found;
  }

  let removed = null;
  await dataStore.updateData((data) => {
    data.communityRecipes = data.communityRecipes || [];
    const index = data.communityRecipes.findIndex((recipe) => recipe.id === recipeId);
    if (index === -1) {
      return data;
    }

    removed = data.communityRecipes[index];
    data.communityRecipes.splice(index, 1);
    return data;
  });

  return removed;
}

module.exports = {
  createRecipe,
  listRecipes,
  findRecipeById,
  updateRecipeById,
  deleteRecipeById,
};
