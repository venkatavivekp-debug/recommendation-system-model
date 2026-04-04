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

const contentPreferencesSchema = new mongoose.Schema(
  {
    favoriteGenres: { type: [String], default: [] },
    preferredMoods: { type: [String], default: [] },
    dislikedGenres: { type: [String], default: [] },
    preferredLanguages: { type: [String], default: ['english'] },
    typicalWatchTime: { type: Number, default: 45 },
    musicGenres: { type: [String], default: [] },
    musicMoods: { type: [String], default: [] },
    workoutMusicPreference: { type: String, default: 'high-energy' },
    walkingMusicPreference: { type: String, default: 'chill' },
    typicalMusicContexts: { type: [String], default: ['walking', 'workout'] },
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
    role: { type: String, default: 'user' },
    address: { type: String, default: null },
    paymentCards: { type: [paymentCardSchema], default: [] },
    favorites: { type: [String], default: [] },
    favoriteRestaurants: { type: [String], default: [] },
    favoriteFoods: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    savedRecipeIds: { type: [String], default: [] },
    preferences: { type: preferencesSchema, default: () => ({}) },
    contentPreferences: { type: contentPreferencesSchema, default: () => ({}) },
    userPreferenceWeights: { type: Object, default: {} },
    mlRecommendationModel: { type: Object, default: {} },
    contentRecommendationModel: { type: Object, default: {} },
    verificationTokenHash: { type: String, default: null },
    verificationTokenExpiresAt: { type: String, default: null },
    verifiedAt: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

module.exports = mongoose.models.UserDocument || mongoose.model('UserDocument', userSchema);
