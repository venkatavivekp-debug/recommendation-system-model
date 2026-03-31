const mongoose = require('mongoose');

const paymentCardSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    cardNumberEncrypted: { type: String, required: true },
    expiry: { type: String, required: true },
    cardHolderName: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

const preferencesSchema = new mongoose.Schema(
  {
    dailyCalorieGoal: { type: Number, default: 2200 },
    proteinGoal: { type: Number, default: 140 },
    carbsGoal: { type: Number, default: 220 },
    fatsGoal: { type: Number, default: 70 },
    fiberGoal: { type: Number, default: 30 },
    preferredDiet: { type: String, default: 'non-veg' },
    macroPreference: { type: String, default: 'balanced' },
    preferredCuisine: { type: String, default: '' },
    fitnessGoal: { type: String, default: 'maintain' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    promotionOptIn: { type: Boolean, default: false },
    status: { type: String, default: 'INACTIVE' },
    role: { type: String, default: 'USER' },
    address: { type: String, default: null },
    paymentCards: { type: [paymentCardSchema], default: [] },
    favorites: { type: [String], default: [] },
    favoriteRestaurants: { type: [String], default: [] },
    favoriteFoods: { type: [String], default: [] },
    preferences: { type: preferencesSchema, default: () => ({}) },
    verificationTokenHash: { type: String, default: null },
    verificationTokenExpiresAt: { type: String, default: null },
    verifiedAt: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

module.exports = mongoose.models.UserDocument || mongoose.model('UserDocument', userSchema);
