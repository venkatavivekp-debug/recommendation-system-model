const crypto = require('crypto');
const AppError = require('../utils/appError');
const { decrypt, maskCardNumber } = require('../utils/crypto');
const userModel = require('../models/userModel');
const { normalizePreferences } = require('./userDefaultsService');
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
    preferences,
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
