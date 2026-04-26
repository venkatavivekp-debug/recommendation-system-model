const feedbackLearningService = require('./feedbackLearningService');

function normalizeFoodFeedbackPayload(payload = {}) {
  return {
    domain: 'food',
    itemId: payload.itemId || payload.placeId || payload.id || '',
    itemName: payload.itemName || payload.foodName || payload.name || payload.title || '',
    action: payload.action || 'selected',
    contextType: payload.contextType || payload.mode || 'daily',
    mode: payload.mode || payload.contextType || 'daily',
    rank: payload.rank || payload.candidateRank || 0,
    score: payload.score || payload.recommendationScore || 0,
    confidence: payload.confidence || 0,
    features: payload.features || {},
    context: {
      restaurantName: payload.restaurantName || payload.name || null,
      foodName: payload.foodName || payload.itemName || null,
      cuisine: payload.cuisine || payload.cuisineType || null,
      sourceType: payload.sourceType || null,
      recommendationReason: payload.reason || payload.recommendationReason || null,
    },
  };
}

async function recordFoodFeedback(userId, payload = {}) {
  return feedbackLearningService.recordDomainFeedback(
    userId,
    normalizeFoodFeedbackPayload(payload)
  );
}

async function getFoodFeedbackProfile(userId, options = {}) {
  return feedbackLearningService.buildFeedbackProfile(userId, {
    ...options,
    domain: 'food',
  });
}

module.exports = {
  recordFoodFeedback,
  getFoodFeedbackProfile,
};
