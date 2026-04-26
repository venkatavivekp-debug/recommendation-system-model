const { isMongoEnabled } = require('../config/database');
const RecommendationInteractionDocument = require('./mongo/recommendationInteractionDocument');
const dataStore = require('./dataStore');

const MAX_INTERACTIONS = 24000;

function normalizeRecords(records = []) {
  return (Array.isArray(records) ? records : [records]).filter(Boolean);
}

function appendInteractions(data, records = []) {
  data.recommendationInteractions = data.recommendationInteractions || [];
  data.recommendationInteractions.push(...records);
  if (data.recommendationInteractions.length > MAX_INTERACTIONS) {
    data.recommendationInteractions = data.recommendationInteractions.slice(-MAX_INTERACTIONS);
  }
  return data;
}

async function createInteraction(record) {
  if (isMongoEnabled()) {
    const created = await RecommendationInteractionDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    return appendInteractions(data, [record]);
  });

  return record;
}

async function createInteractions(records = []) {
  const safeRecords = normalizeRecords(records);
  if (!safeRecords.length) {
    return [];
  }

  if (isMongoEnabled()) {
    const created = await RecommendationInteractionDocument.insertMany(safeRecords, {
      ordered: false,
    });
    return created.map((row) => row.toObject());
  }

  await dataStore.updateData((data) => {
    return appendInteractions(data, safeRecords);
  });

  return safeRecords;
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
  createInteractions,
  listInteractionsByUser,
  listAllInteractions,
};
