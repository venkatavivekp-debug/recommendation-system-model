const mongoose = require('mongoose');

const recipeIngredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    amount: { type: String, required: true },
  },
  { _id: false }
);

const communityRecipeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    ingredients: { type: [recipeIngredientSchema], default: [] },
    steps: { type: [String], default: [] },
    macros: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fats: { type: Number, default: 0 },
      fiber: { type: Number, default: 0 },
    },
    prepTimeMinutes: { type: Number, default: 20 },
    allergyNotes: { type: [String], default: [] },
    whyFitsPlan: { type: String, default: '' },
    youtubeLink: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    createdBy: { type: String, required: true, index: true },
    createdByName: { type: String, required: true },
    savedByUserIds: { type: [String], default: [] },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.CommunityRecipeDocument ||
  mongoose.model('CommunityRecipeDocument', communityRecipeSchema);
