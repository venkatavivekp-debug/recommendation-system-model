const mongoose = require('mongoose');

const evaluationMetricSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    recommendationAccuracy: { type: Number, default: 0 },
    goalAdherenceScore: { type: Number, default: 0 },
    macroBalanceScore: { type: Number, default: 0 },
    predictionRmse: { type: Number, default: 0 },
    engagement: {
      mealsLogged: { type: Number, default: 0 },
      exercisesLogged: { type: Number, default: 0 },
      recommendationsClicked: { type: Number, default: 0 },
    },
    recommendationSummary: {
      totalRecommendations: { type: Number, default: 0 },
      acceptedRecommendations: { type: Number, default: 0 },
      windowDays: { type: Number, default: 30 },
    },
    prediction: {
      predictedCalories: { type: Number, default: 0 },
      actualCalories: { type: Number, default: 0 },
      confidence: { type: Number, default: 0 },
      modelType: { type: String, default: 'linear_regression' },
    },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

evaluationMetricSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports =
  mongoose.models.EvaluationMetricDocument ||
  mongoose.model('EvaluationMetricDocument', evaluationMetricSchema);
