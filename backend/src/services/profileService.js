const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const { encrypt } = require('../utils/crypto');
const userService = require('./userService');
const emailService = require('./emailService');

function getChangedFields(original, updates) {
  return Object.keys(updates).filter((key) => JSON.stringify(original[key]) !== JSON.stringify(updates[key]));
}

async function getMyProfile(userId) {
  const user = await userService.getUserOrThrow(userId);
  return userService.sanitizeUser(user);
}

async function updateMyProfile(userId, updates) {
  if ('email' in updates) {
    throw new AppError('Email cannot be edited', 400, 'VALIDATION_ERROR');
  }

  if ('paymentCards' in updates) {
    throw new AppError('Use payment card endpoints for card changes', 400, 'VALIDATION_ERROR');
  }

  const user = await userService.getUserOrThrow(userId);
  const changedFields = getChangedFields(user, updates);

  if (!changedFields.length) {
    return userService.sanitizeUser(user);
  }

  const updated = await userService.updateUser(userId, updates);
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
  removePaymentCard,
};
