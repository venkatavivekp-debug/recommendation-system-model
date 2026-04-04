const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const authService = require('../services/authService');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.validatedBody);
  return sendSuccess(res, result, 'User registered successfully', 201);
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
