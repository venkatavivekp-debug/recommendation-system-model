const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const exerciseService = require('../services/exerciseService');

const logWorkout = asyncHandler(async (req, res) => {
  const data = await exerciseService.logWorkout(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Workout logged', 201);
});

const logSteps = asyncHandler(async (req, res) => {
  const data = await exerciseService.logSteps(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Steps logged', 201);
});

const syncWearable = asyncHandler(async (req, res) => {
  const data = await exerciseService.syncWearable(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Wearable sync processed');
});

const getTodaySummary = asyncHandler(async (req, res) => {
  const data = await exerciseService.getTodayExerciseSummary(req.auth.userId);
  return sendSuccess(res, data, 'Today exercise summary retrieved');
});

const getHistory = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 240;
  const data = await exerciseService.getExerciseHistory(req.auth.userId, limit);
  return sendSuccess(res, data, 'Exercise history retrieved');
});

module.exports = {
  logWorkout,
  logSteps,
  syncWearable,
  getTodaySummary,
  getHistory,
};
