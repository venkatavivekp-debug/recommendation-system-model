const { isMongoEnabled } = require('../config/database');
const RecommendationInteractionDocument = require('./mongo/recommendationInteractionDocument');
const dataStore = require('./dataStore');

async function createInteraction(record) {
  if (isMongoEnabled()) {
    const created = await RecommendationInteractionDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.recommendationInteractions = data.recommendationInteractions || [];
    data.recommendationInteractions.push(record);
    if (data.recommendationInteractions.length > 24000) {
      data.recommendationInteractions = data.recommendationInteractions.slice(-24000);
    }
    return data;
  });

  return record;
}

async function listInteractionsByUser(userId, limit = 500) {
  if (isMongoEnabled()) {
    return RecommendationInteractionDocument.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const data = await dataStore.readData();
  return (data.recommendationInteractions || [])
    .filter((row) => row.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function listAllInteractions(limit = 5000) {
  if (isMongoEnabled()) {
    return RecommendationInteractionDocument.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const data = await dataStore.readData();
  return (data.recommendationInteractions || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

module.exports = {
  createInteraction,
  listInteractionsByUser,
  listAllInteractions,
};
