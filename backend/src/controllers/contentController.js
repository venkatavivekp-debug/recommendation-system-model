const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { sendSuccess } = require('../utils/response');
const contentRecommendationService = require('../services/contentRecommendationService');
const userService = require('../services/userService');

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const getRecommendations = asyncHandler(async (req, res) => {
  const user = await userService.getUserOrThrow(req.auth.userId);
  const contextType = String(req.query.contextType || req.body?.contextType || 'daily').trim();
  const data = await contentRecommendationService.getUnifiedRecommendations(user, {
    contextType,
    activityType: req.query.activityType || req.body?.activityType,
    etaMinutes: toNumber(req.query.etaMinutes || req.body?.etaMinutes, null),
    durationMinutes: toNumber(req.query.durationMinutes || req.body?.durationMinutes, null),
    sessionMinutes: toNumber(req.query.sessionMinutes || req.body?.sessionMinutes, null),
    movieLimit: 8,
    songLimit: 8,
    candidatePoolSize: 220,
    logImpressions: true,
  });

  return sendSuccess(res, data, 'Content recommendations generated');
});

const logFeedback = asyncHandler(async (req, res) => {
  const itemId = String(req.body?.itemId || '').trim();
  const contextType = String(req.body?.contextType || '').trim();
  const action = String(req.body?.action || '').trim();

  if (!itemId || !contextType || !action) {
    throw new AppError('itemId, contextType, and action are required', 400, 'VALIDATION_ERROR');
  }

  const data = await contentRecommendationService.recordContentFeedback(req.auth.userId, {
    contentType: req.body?.contentType,
    itemId,
    title: req.body?.title,
    contextType,
    action,
    score: req.body?.score,
    confidence: req.body?.confidence,
    reason: req.body?.reason,
    features: req.body?.features,
  });

  return sendSuccess(res, data, 'Content feedback recorded');
});

const saveForLater = asyncHandler(async (req, res) => {
  const itemId = String(req.body?.itemId || req.body?.id || '').trim();
  const title = String(req.body?.title || '').trim();

  if (!itemId || !title) {
    throw new AppError('itemId and title are required', 400, 'VALIDATION_ERROR');
  }

  const data = await contentRecommendationService.saveContentForLater(req.auth.userId, {
    itemId,
    title,
    contentType: req.body?.contentType,
    artist: req.body?.artist,
    genre: req.body?.genre,
    mood: req.body?.mood,
    reason: req.body?.reason,
    confidence: req.body?.confidence,
    confidencePct: req.body?.confidencePct,
    sourceUrl: req.body?.sourceUrl,
    contextType: req.body?.contextType,
    features: req.body?.features,
  });

  return sendSuccess(res, data, 'Content saved for later');
});

const getSaved = asyncHandler(async (req, res) => {
  const data = await contentRecommendationService.getSavedContent(req.auth.userId, {
    limit: toNumber(req.query.limit, 30),
    contentType: req.query.contentType,
  });
  return sendSuccess(res, data, 'Saved content retrieved');
});

module.exports = {
  getRecommendations,
  logFeedback,
  saveForLater,
  getSaved,
};
