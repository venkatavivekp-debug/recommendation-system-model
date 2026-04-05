const crypto = require('crypto');
const AppError = require('../utils/appError');
const { decrypt, maskCardNumber } = require('../utils/crypto');
const userModel = require('../models/userModel');
const {
  normalizePreferences,
  normalizeContentPreferences,
} = require('./userDefaultsService');
const { normalizeAllergies } = require('../utils/allergy');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function mapCardForResponse(card) {
  let masked = '****';

  try {
    masked = maskCardNumber(decrypt(card.cardNumberEncrypted));
  } catch (error) {
    masked = '****';
  }

  return {
    id: card.id,
    cardHolderName: card.cardHolderName,
    expiry: card.expiry,
    maskedCardNumber: masked,
    createdAt: card.createdAt,
  };
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const preferences = normalizePreferences(user.preferences);
  const contentPreferences = normalizeContentPreferences(user.contentPreferences);
  const iotPreferences = user.iotPreferences && typeof user.iotPreferences === 'object'
    ? {
        allowWearableData: Boolean(user.iotPreferences.allowWearableData),
        provider: String(user.iotPreferences.provider || 'manual'),
        manualSteps: Number(user.iotPreferences.manualSteps || 0),
        manualCaloriesBurned: Number(user.iotPreferences.manualCaloriesBurned || 0),
        manualActivityLevel: Number(user.iotPreferences.manualActivityLevel || 0.5),
        syncedSteps: Number(user.iotPreferences.syncedSteps || 0),
        syncedCaloriesBurned: Number(user.iotPreferences.syncedCaloriesBurned || 0),
        syncedActivityLevel: Number(user.iotPreferences.syncedActivityLevel || 0.5),
        lastSyncedAt: user.iotPreferences.lastSyncedAt || null,
      }
    : {
        allowWearableData: false,
        provider: 'manual',
        manualSteps: 0,
        manualCaloriesBurned: 0,
        manualActivityLevel: 0.5,
        syncedSteps: 0,
        syncedCaloriesBurned: 0,
        syncedActivityLevel: 0.5,
        lastSyncedAt: null,
      };

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    status: user.status,
    role: String(user.role || 'user').toLowerCase(),
    promotionOptIn: Boolean(user.promotionOptIn),
    address: user.address || null,
    favorites: Array.isArray(user.favorites) ? user.favorites : [],
    favoriteRestaurants: Array.isArray(user.favoriteRestaurants) ? user.favoriteRestaurants : [],
    favoriteFoods: Array.isArray(user.favoriteFoods) ? user.favoriteFoods : [],
    allergies: normalizeAllergies(user.allergies),
    savedRecipeIds: Array.isArray(user.savedRecipeIds) ? user.savedRecipeIds : [],
    savedContent: Array.isArray(user.savedContent) ? user.savedContent : [],
    preferences,
    contentPreferences,
    iotPreferences,
    userPreferenceWeights:
      user.userPreferenceWeights && typeof user.userPreferenceWeights === 'object'
        ? user.userPreferenceWeights
        : {},
    paymentCards: (user.paymentCards || []).map(mapCardForResponse),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    verifiedAt: user.verifiedAt || null,
  };
}

async function getUserByEmail(email) {
  return userModel.findUserByEmail(email);
}

async function getUserById(userId) {
  return userModel.findUserById(userId);
}

async function getUserOrThrow(userId) {
  const user = await userModel.findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  return user;
}

async function createUser(payload) {
  return userModel.createUser(payload);
}

async function updateUser(userId, updates) {
  const updated = await userModel.updateUserById(userId, updates);
  if (!updated) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  return updated;
}

async function getAllUsers() {
  return userModel.getAllUsers();
}

async function replaceAllUsers(users) {
  return userModel.replaceAllUsers(users);
}

module.exports = {
  hashToken,
  sanitizeUser,
  getUserByEmail,
  getUserById,
  getUserOrThrow,
  createUser,
  updateUser,
  getAllUsers,
  replaceAllUsers,
};
