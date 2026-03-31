const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const friendService = require('../services/friendService');

const requestFriend = asyncHandler(async (req, res) => {
  const data = await friendService.sendFriendRequest(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Friend request sent', 201);
});

const acceptFriend = asyncHandler(async (req, res) => {
  const data = await friendService.acceptFriendRequest(req.auth.userId, req.validatedBody.requestId);
  return sendSuccess(res, data, 'Friend request accepted');
});

const rejectFriend = asyncHandler(async (req, res) => {
  const data = await friendService.rejectFriendRequest(req.auth.userId, req.validatedBody.requestId);
  return sendSuccess(res, data, 'Friend request rejected');
});

const listFriends = asyncHandler(async (req, res) => {
  const data = await friendService.listFriends(req.auth.userId);
  return sendSuccess(res, data, 'Friends retrieved');
});

const listRequests = asyncHandler(async (req, res) => {
  const data = await friendService.listFriendRequests(req.auth.userId);
  return sendSuccess(res, data, 'Friend requests retrieved');
});

const searchUsers = asyncHandler(async (req, res) => {
  const data = await friendService.searchUsersByEmail(req.auth.userId, req.validatedQuery.email);
  return sendSuccess(res, data, 'User search complete');
});

module.exports = {
  requestFriend,
  acceptFriend,
  rejectFriend,
  listFriends,
  listRequests,
  searchUsers,
};
