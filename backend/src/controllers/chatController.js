const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const chatService = require('../services/chatService');

const sendMessage = asyncHandler(async (req, res) => {
  const data = await chatService.sendMessage(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Message sent', 201);
});

const getMessages = asyncHandler(async (req, res) => {
  const safeLimit = Math.min(Math.max(Number(req.validatedQuery.limit || 120), 1), 400);
  const data = await chatService.listMessages(req.auth.userId, req.validatedQuery.peerUserId, safeLimit);
  return sendSuccess(res, data, 'Messages retrieved');
});

module.exports = {
  sendMessage,
  getMessages,
};
