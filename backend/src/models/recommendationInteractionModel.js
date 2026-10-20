const { isMongoEnabled } = require('../config/database');
const RecommendationInteractionDocument = require('./mongo/recommendationInteractionDocument');
const dataStore = require('./dataStore');
// Keep high-volume impressions out of profile/meal reads in the local JSON adapter.
const impressionStore = new dataStore.DataStore(`${dataStore.filePath}.impressions.json`, { compact: true });

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
    return RecommendationInteractionDocument.findOneAndUpdate(
      { id: record.id, userId: record.userId }, { $setOnInsert: record }, { upsert: true, new: true }
    ).lean();
  }

  await dataStore.updateData((data) => {
    if ((data.recommendationInteractions || []).some(row => row.id === record.id)) return data;
    return appendInteractions(data, [record]);
  });

  return record;
}

async function findInteraction(userId, id) {
  if (isMongoEnabled()) return RecommendationInteractionDocument.findOne({ userId, id }).lean();
  const impressions = await impressionStore.readData();
  const found = (impressions.recommendationInteractions || []).find(row => row.userId === userId && row.id === id);
  if (found) return found;
  const data = await dataStore.readData();
  return (data.recommendationInteractions || []).find(row => row.userId === userId && row.id === id) || null;
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

  const store = safeRecords.every(row => row.action === 'shown' && row.context?.adaptive) ? impressionStore : dataStore;
  await store.updateData((data) => {
    return appendInteractions(data, safeRecords);
  });

  return safeRecords;
}

async function listInteractionsByUser(userId, limit = 500, { feedbackOnly = false } = {}) {
  const actions = ['selected', 'chosen', 'save', 'saved', 'helpful', 'ignored', 'not_interested', 'dismissed'];
  if (isMongoEnabled()) {
    return RecommendationInteractionDocument.find({ userId, ...(feedbackOnly ? { action: { $in: actions } } : {}) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();
  }

  const data = await dataStore.readData();
  return (data.recommendationInteractions || [])
    .filter((row) => row.userId === userId)
    .filter((row) => !feedbackOnly || actions.includes(row.action))
    .reverse()
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

async function deleteInteractionsByUserIds(userIds = []) {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean);
  if (!ids.length) {
    return { deletedCount: 0 };
  }

  if (isMongoEnabled()) {
    const result = await RecommendationInteractionDocument.deleteMany({ userId: { $in: ids } });
    return { deletedCount: result.deletedCount || 0 };
  }

  let deletedCount = 0;
  await impressionStore.updateData(data => {
    data.recommendationInteractions = (data.recommendationInteractions || []).filter(row => {
      if (!ids.includes(row.userId)) return true;
      deletedCount += 1;
      return false;
    });
    return data;
  });
  await dataStore.updateData((data) => {
    const rows = data.recommendationInteractions || [];
    data.recommendationInteractions = rows.filter((row) => {
      const keep = !ids.includes(row.userId);
      if (!keep) {
        deletedCount += 1;
      }
      return keep;
    });
    return data;
  });

  return { deletedCount };
}

module.exports = {
  createInteraction,
  findInteraction,
  createInteractions,
  listInteractionsByUser,
  listAllInteractions,
  deleteInteractionsByUserIds,
};
