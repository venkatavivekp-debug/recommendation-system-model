const mongoose = require('mongoose');

const recipeReviewSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    recipeId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true },
    rating: { type: Number, required: true },
    comment: { type: String, default: '' },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.RecipeReviewDocument || mongoose.model('RecipeReviewDocument', recipeReviewSchema);
