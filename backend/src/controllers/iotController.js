const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const iotService = require('../services/iotService');

const getContext = asyncHandler(async (req, res) => {
  const context = await iotService.getIoTContext(req.auth.userId);
  return sendSuccess(res, { context }, 'IoT context retrieved');
});

const updatePreferences = asyncHandler(async (req, res) => {
  const data = await iotService.updateIoTPreferences(req.auth.userId, req.body || {});
  return sendSuccess(res, data, 'IoT preferences updated');
});

const syncData = asyncHandler(async (req, res) => {
  const data = await iotService.syncIoTData(req.auth.userId, req.body || {});
  return sendSuccess(res, data, 'IoT data synced');
});

module.exports = {
  getContext,
  updatePreferences,
  syncData,
};

