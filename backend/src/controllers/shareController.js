const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const shareService = require('../services/shareService');

const shareViaEmail = asyncHandler(async (req, res) => {
  const data = await shareService.shareViaEmail(req.auth.userId, req.body || {});
  return sendSuccess(res, data, 'Email share sent successfully', 201);
});

module.exports = {
  shareViaEmail,
};
