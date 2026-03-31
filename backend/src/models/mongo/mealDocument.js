const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    foodName: { type: String, required: true },
    calories: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fats: { type: Number, required: true },
    fiber: { type: Number, required: true },
    source: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.models.MealDocument || mongoose.model('MealDocument', mealSchema);
