const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const profileService = require('../services/profileService');

const getProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getMyProfile(req.auth.userId);
  return sendSuccess(res, { profile }, 'Profile retrieved');
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.updateMyProfile(
    req.auth.userId,
    req.body || {}
  );
  return sendSuccess(res, { profile }, 'Profile updated');
});

const getMe = getProfile;
const updateMe = updateProfile;

module.exports = {
  getProfile,
  updateProfile,
  getMe,
  updateMe,
};
