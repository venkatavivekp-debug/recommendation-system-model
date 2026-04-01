const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fats: { type: Number, default: 0 },
    fiber: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
  },
  { _id: false }
);

const restaurantSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    cuisine: { type: String, required: true },
    description: { type: String, default: '' },
    menu: { type: [menuItemSchema], default: [] },
    ownerId: { type: String, required: true, index: true },
    website: { type: String, default: '' },
    contact: { type: String, default: '' },
    rating: { type: Number, default: 0 },
    estimatedCalories: { type: Number, default: 0 },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.RestaurantDocument ||
  mongoose.model('RestaurantDocument', restaurantSchema);
