const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const profileService = require('../services/profileService');

const getMe = asyncHandler(async (req, res) => {
  const profile = await profileService.getMyProfile(req.auth.userId);
  return sendSuccess(res, { profile }, 'Profile retrieved');
});

const updateMe = asyncHandler(async (req, res) => {
  const profile = await profileService.updateMyProfile(req.auth.userId, req.validatedBody);
  return sendSuccess(res, { profile }, 'Profile updated');
});

const addCard = asyncHandler(async (req, res) => {
  const profile = await profileService.addPaymentCard(req.auth.userId, req.validatedBody);
  return sendSuccess(res, { profile }, 'Payment card added', 201);
});

const removeCard = asyncHandler(async (req, res) => {
  const profile = await profileService.removePaymentCard(req.auth.userId, req.params.cardId);
  return sendSuccess(res, { profile }, 'Payment card removed');
});

module.exports = {
  getMe,
  updateMe,
  addCard,
  removeCard,
};
