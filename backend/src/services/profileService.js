const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const { encrypt } = require('../utils/crypto');
const userService = require('./userService');
const emailService = require('./emailService');
const { normalizePreferences } = require('./userDefaultsService');
const { normalizeAllergies } = require('../utils/allergy');

function getChangedFields(original, updates) {
  return Object.keys(updates).filter((key) => JSON.stringify(original[key]) !== JSON.stringify(updates[key]));
}

async function getMyProfile(userId) {
  const user = await userService.getUserOrThrow(userId);
  return userService.sanitizeUser(user);
}

function normalizeProfileUpdates(user, updates) {
  const normalized = { ...updates };

  if (Object.prototype.hasOwnProperty.call(normalized, 'dailyCalories')) {
    normalized.dailyCalorieGoal = normalized.dailyCalories;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'proteinTarget')) {
    normalized.proteinGoal = normalized.proteinTarget;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'carbTarget')) {
    normalized.carbsGoal = normalized.carbTarget;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'fatTarget')) {
    normalized.fatsGoal = normalized.fatTarget;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'fiberTarget')) {
    normalized.fiberGoal = normalized.fiberTarget;
  }

  const preferenceFields = [
    'dailyCalorieGoal',
    'proteinGoal',
    'carbsGoal',
    'fatsGoal',
    'fiberGoal',
    'dailyCalories',
    'proteinTarget',
    'carbTarget',
    'fatTarget',
    'fiberTarget',
    'preferredDiet',
    'macroPreference',
    'preferredCuisine',
    'fitnessGoal',
  ];

  const hasPreferenceUpdate = preferenceFields.some((field) => field in normalized);

  if (hasPreferenceUpdate || normalized.preferences) {
    normalized.preferences = normalizePreferences({
      ...(user.preferences || {}),
      ...(normalized.preferences || {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'dailyCalorieGoal')
        ? { dailyCalorieGoal: normalized.dailyCalorieGoal }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'proteinGoal')
        ? { proteinGoal: normalized.proteinGoal }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'carbsGoal')
        ? { carbsGoal: normalized.carbsGoal }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'fatsGoal')
        ? { fatsGoal: normalized.fatsGoal }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'fiberGoal')
        ? { fiberGoal: normalized.fiberGoal }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'preferredDiet')
        ? { preferredDiet: normalized.preferredDiet }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'macroPreference')
        ? { macroPreference: normalized.macroPreference }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'preferredCuisine')
        ? { preferredCuisine: normalized.preferredCuisine }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(normalized, 'fitnessGoal')
        ? { fitnessGoal: normalized.fitnessGoal }
        : {}),
    });
  }

  preferenceFields.forEach((field) => {
    if (field in normalized) {
      delete normalized[field];
    }
  });

  if (normalized.favoriteRestaurants && !Array.isArray(normalized.favoriteRestaurants)) {
    throw new AppError('favoriteRestaurants must be an array', 400, 'VALIDATION_ERROR');
  }

  if (normalized.favoriteFoods && !Array.isArray(normalized.favoriteFoods)) {
    throw new AppError('favoriteFoods must be an array', 400, 'VALIDATION_ERROR');
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'allergies')) {
    normalized.allergies = normalizeAllergies(normalized.allergies);
  }

  return normalized;
}

async function updateMyProfile(userId, updates) {
  if ('email' in updates) {
    throw new AppError('Email cannot be edited', 400, 'VALIDATION_ERROR');
  }

  if ('paymentCards' in updates) {
    throw new AppError('Use payment card endpoints for card changes', 400, 'VALIDATION_ERROR');
  }

  const user = await userService.getUserOrThrow(userId);
  const normalizedUpdates = normalizeProfileUpdates(user, updates);
  const changedFields = getChangedFields(user, normalizedUpdates);

  if (!changedFields.length) {
    return userService.sanitizeUser(user);
  }

  const updated = await userService.updateUser(userId, normalizedUpdates);
  emailService.sendProfileUpdatedEmail(updated.email, changedFields);

  return userService.sanitizeUser(updated);
}

async function addPaymentCard(userId, cardPayload) {
  const user = await userService.getUserOrThrow(userId);
  const existingCards = user.paymentCards || [];

  if (existingCards.length >= 3) {
    throw new AppError('Maximum of 3 payment cards allowed', 400, 'VALIDATION_ERROR');
  }

  const nextCard = {
    id: randomUUID(),
    cardNumberEncrypted: encrypt(cardPayload.cardNumber),
    expiry: cardPayload.expiry,
    cardHolderName: cardPayload.cardHolderName,
    createdAt: new Date().toISOString(),
  };

  const updated = await userService.updateUser(userId, {
    paymentCards: [...existingCards, nextCard],
  });

  emailService.sendProfileUpdatedEmail(updated.email, ['paymentCards']);

  return userService.sanitizeUser(updated);
}

async function updatePaymentCard(userId, cardId, cardPayload) {
  const user = await userService.getUserOrThrow(userId);
  const existingCards = user.paymentCards || [];

  const targetCard = existingCards.find((card) => card.id === cardId);
  if (!targetCard) {
    throw new AppError('Payment card not found', 404, 'NOT_FOUND');
  }

  const updatedCards = existingCards.map((card) => {
    if (card.id !== cardId) {
      return card;
    }

    return {
      ...card,
      cardNumberEncrypted: cardPayload.cardNumber
        ? encrypt(cardPayload.cardNumber)
        : card.cardNumberEncrypted,
      expiry: cardPayload.expiry || card.expiry,
      cardHolderName: cardPayload.cardHolderName || card.cardHolderName,
      updatedAt: new Date().toISOString(),
    };
  });

  const updated = await userService.updateUser(userId, {
    paymentCards: updatedCards,
  });

  emailService.sendProfileUpdatedEmail(updated.email, ['paymentCards']);
  return userService.sanitizeUser(updated);
}

async function removePaymentCard(userId, cardId) {
  const user = await userService.getUserOrThrow(userId);
  const existingCards = user.paymentCards || [];

  const hasCard = existingCards.some((card) => card.id === cardId);
  if (!hasCard) {
    throw new AppError('Payment card not found', 404, 'NOT_FOUND');
  }

  const updated = await userService.updateUser(userId, {
    paymentCards: existingCards.filter((card) => card.id !== cardId),
  });

  emailService.sendProfileUpdatedEmail(updated.email, ['paymentCards']);

  return userService.sanitizeUser(updated);
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  addPaymentCard,
  updatePaymentCard,
  removePaymentCard,
};
