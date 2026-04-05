const crypto = require('crypto');
const { randomUUID } = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/appError');
const { hashPassword, comparePassword } = require('../utils/password');
const { signJwt, createRandomToken } = require('../utils/token');
const passwordResetTokenModel = require('../models/passwordResetTokenModel');
const emailService = require('./emailService');
const userService = require('./userService');
const {
  createDefaultPreferences,
  createDefaultContentPreferences,
} = require('./userDefaultsService');

function getJwtPayload(user) {
  return {
    sub: user.id,
    role: user.role,
    email: user.email,
  };
}

async function register(payload) {
  const existing = await userService.getUserByEmail(payload.email);
  if (existing) {
    throw new AppError('Email already registered', 409, 'CONFLICT');
  }

  const passwordHash = await hashPassword(payload.password);
  const now = new Date().toISOString();

  const user = await userService.createUser({
    id: randomUUID(),
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    passwordHash,
    promotionOptIn: payload.promotionOptIn,
    status: 'ACTIVE',
    role: 'user',
    address: null,
    paymentCards: [],
    favorites: [],
    favoriteRestaurants: [],
    favoriteFoods: [],
    allergies: [],
    savedRecipeIds: [],
    savedContent: [],
    preferences: createDefaultPreferences(),
    contentPreferences: createDefaultContentPreferences(),
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return {
    user: userService.sanitizeUser(user),
  };
}

async function verifyEmail(email, token) {
  const user = await userService.getUserByEmail(email.toLowerCase());
  if (!user) {
    throw new AppError('Invalid verification request', 400, 'VALIDATION_ERROR');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const isExpired = !user.verificationTokenExpiresAt || new Date(user.verificationTokenExpiresAt) < new Date();

  if (user.verificationTokenHash !== tokenHash || isExpired) {
    throw new AppError('Verification token is invalid or expired', 400, 'VALIDATION_ERROR');
  }

  const updated = await userService.updateUser(user.id, {
    status: 'ACTIVE',
    verificationTokenHash: null,
    verificationTokenExpiresAt: null,
    verifiedAt: new Date().toISOString(),
  });

  return userService.sanitizeUser(updated);
}

async function login({ email, password }) {
  const user = await userService.getUserByEmail(email);

  if (!user) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  if (user.status !== 'ACTIVE') {
    throw new AppError('Account is not active. Please verify your email first.', 403, 'ACCOUNT_INACTIVE');
  }

  return {
    token: signJwt(getJwtPayload(user)),
    user: userService.sanitizeUser(user),
  };
}

async function forgotPassword(email) {
  const user = await userService.getUserByEmail(email);

  if (!user) {
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  const rawToken = createRandomToken();
  const tokenHash = userService.hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.resetTokenExpiresMinutes * 60 * 1000).toISOString();

  await passwordResetTokenModel.cleanupExpiredTokens();

  await passwordResetTokenModel.createResetToken({
    id: randomUUID(),
    userId: user.id,
    tokenHash,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString(),
  });

  emailService.sendPasswordResetEmail(user.email, rawToken);

  return {
    message: 'If the email exists, a reset link has been sent.',
    resetToken: env.nodeEnv === 'development' ? rawToken : undefined,
  };
}

async function resetPassword({ token, newPassword }) {
  const tokenHash = userService.hashToken(token);
  const tokenRecord = await passwordResetTokenModel.findValidToken(tokenHash);

  if (!tokenRecord) {
    throw new AppError('Reset token is invalid or expired', 400, 'VALIDATION_ERROR');
  }

  const user = await userService.getUserById(tokenRecord.userId);
  if (!user) {
    throw new AppError('User no longer exists', 404, 'NOT_FOUND');
  }

  const passwordHash = await hashPassword(newPassword);

  await userService.updateUser(user.id, {
    passwordHash,
  });

  await passwordResetTokenModel.markTokenAsUsed(tokenRecord.id);

  return { message: 'Password reset successfully' };
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await userService.getUserOrThrow(userId);
  const passwordMatches = await comparePassword(currentPassword, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError('Current password is incorrect', 400, 'VALIDATION_ERROR');
  }

  const passwordHash = await hashPassword(newPassword);
  await userService.updateUser(user.id, { passwordHash });

  return { message: 'Password changed successfully' };
}

async function logout() {
  return { message: 'Logout successful. Remove token on client.' };
}

module.exports = {
  register,
  verifyEmail,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  logout,
};
