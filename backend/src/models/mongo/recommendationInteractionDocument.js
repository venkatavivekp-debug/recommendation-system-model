const mongoose = require('mongoose');

const recommendationInteractionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    eventType: { type: String, required: true, default: 'shown' },
    itemName: { type: String, default: '' },
    sourceType: { type: String, default: 'unknown' },
    recommendationScore: { type: Number, default: 0 },
    context: { type: Object, default: {} },
    nutrition: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fats: { type: Number, default: 0 },
      fiber: { type: Number, default: 0 },
    },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

recommendationInteractionSchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.RecommendationInteractionDocument ||
  mongoose.model('RecommendationInteractionDocument', recommendationInteractionSchema);
