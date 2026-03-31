const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const shareService = require('../services/shareService');

const shareDiet = asyncHandler(async (req, res) => {
  const data = await shareService.shareDiet(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Diet shared successfully', 201);
});

const getSharedDietInbox = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 80;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 300)) : 80;
  const data = await shareService.listSharedDietInbox(req.auth.userId, safeLimit);
  return sendSuccess(res, data, 'Shared diet inbox retrieved');
});

module.exports = {
  shareDiet,
  getSharedDietInbox,
};
