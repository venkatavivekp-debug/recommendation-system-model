const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const authService = require('../services/authService');
const userService = require('../services/userService');

const register = asyncHandler(async (req, res) => {
  const body = req.validatedBody || req.body || {};
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || '');

  if (!firstName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existingUser = await userService.getUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  try {
    await authService.register({
      firstName,
      lastName,
      email,
      password,
      promotionOptIn: false,
    });
  } catch (error) {
    if (error?.code === 'CONFLICT') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    throw error;
  }

  return res.status(201).json({ message: 'Registered successfully' });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { email, token } = req.validatedBody;
  const user = await authService.verifyEmail(email, token);
  return sendSuccess(res, { user }, 'Email verified successfully');
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validatedBody);
  return sendSuccess(res, result, 'Login successful');
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout();
  return sendSuccess(res, result, 'Logout successful');
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.validatedBody.email);
  return sendSuccess(res, result, 'Password reset instructions generated');
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.validatedBody);
  return sendSuccess(res, result, 'Password reset completed');
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.auth.userId, req.validatedBody);
  return sendSuccess(res, result, 'Password changed');
});

module.exports = {
  register,
  verifyEmail,
  login,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
};
