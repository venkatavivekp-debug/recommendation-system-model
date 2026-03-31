const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const activityService = require('../services/activityService');

const createActivity = asyncHandler(async (req, res) => {
  const activity = await activityService.createActivity(req.auth.userId, req.validatedBody);
  return sendSuccess(res, { activity }, 'Activity saved', 201);
});

const listActivities = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 25;
  const activities = await activityService.getActivityHistory(req.auth.userId, Number.isFinite(limit) ? limit : 25);
  return sendSuccess(res, { activities }, 'Activity history retrieved');
});

module.exports = {
  createActivity,
  listActivities,
};
