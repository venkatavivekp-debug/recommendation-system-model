const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    foodName: { type: String, required: true },
    restaurantName: { type: String, required: true },
    restaurantAddress: { type: String, default: '' },
    caloriesConsumed: { type: Number, required: true },
    caloriesBurned: { type: Number, required: true },
    distanceMiles: { type: Number, required: true },
    travelMode: { type: String, required: true },
    recommendationMessage: { type: String, default: '' },
    nutrition: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fats: { type: Number, default: 0 },
    },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.ActivityDocument || mongoose.model('ActivityDocument', activitySchema);
