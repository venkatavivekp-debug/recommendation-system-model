const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const calendarService = require('../services/calendarService');

const getCalendarHistory = asyncHandler(async (req, res) => {
  const months = req.query.months ? Number(req.query.months) : 4;
  const data = await calendarService.getHistory(req.auth.userId, months);
  return sendSuccess(res, data, 'Calendar history retrieved');
});

const getCalendarDay = asyncHandler(async (req, res) => {
  const data = await calendarService.getDayDetails(req.auth.userId, req.validatedParams.date);
  return sendSuccess(res, data, 'Calendar day snapshot retrieved');
});

const createCalendarPlan = asyncHandler(async (req, res) => {
  const data = await calendarService.createOrUpdatePlan(req.auth.userId, req.validatedBody);
  return sendSuccess(res, data, 'Calendar plan saved', 201);
});

const getUpcomingCalendarPlans = asyncHandler(async (req, res) => {
  const data = await calendarService.getUpcoming(req.auth.userId);
  return sendSuccess(res, data, 'Upcoming plans retrieved');
});

module.exports = {
  getCalendarHistory,
  getCalendarDay,
  createCalendarPlan,
  getUpcomingCalendarPlans,
};
