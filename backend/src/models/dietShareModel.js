const { isMongoEnabled } = require('../config/database');
const DietShareDocument = require('./mongo/dietShareDocument');
const dataStore = require('./dataStore');

async function createDietShare(record) {
  if (isMongoEnabled()) {
    const created = await DietShareDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.dietShares = data.dietShares || [];
    data.dietShares.push(record);
    return data;
  });

  return record;
}

async function listDietSharesForUser(userId, limit = 120) {
  if (isMongoEnabled()) {
    return DietShareDocument.find({ targetUserId: userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.dietShares || [])
    .filter((row) => row.targetUserId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

module.exports = {
  createDietShare,
  listDietSharesForUser,
};
