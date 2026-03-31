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

const getProfile = getMe;
const updateProfile = updateMe;

const addCard = asyncHandler(async (req, res) => {
  const profile = await profileService.addPaymentCard(req.auth.userId, req.validatedBody);
  return sendSuccess(res, { profile }, 'Payment card added', 201);
});

const updateCard = asyncHandler(async (req, res) => {
  const profile = await profileService.updatePaymentCard(
    req.auth.userId,
    req.params.cardId,
    req.validatedBody
  );
  return sendSuccess(res, { profile }, 'Payment card updated');
});

const removeCard = asyncHandler(async (req, res) => {
  const profile = await profileService.removePaymentCard(req.auth.userId, req.params.cardId);
  return sendSuccess(res, { profile }, 'Payment card removed');
});

module.exports = {
  getProfile,
  updateProfile,
  getMe,
  updateMe,
  addCard,
  updateCard,
  removeCard,
};
