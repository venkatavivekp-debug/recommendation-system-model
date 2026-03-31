const { isMongoEnabled } = require('../config/database');
const SearchHistoryDocument = require('./mongo/searchHistoryDocument');
const dataStore = require('./dataStore');

async function addSearchRecord(record) {
  if (isMongoEnabled()) {
    await SearchHistoryDocument.create(record);
    return;
  }

  await dataStore.updateData((data) => {
    data.searchHistory.push(record);
    if (data.searchHistory.length > 500) {
      data.searchHistory = data.searchHistory.slice(-500);
    }
    return data;
  });
}

async function getRecentSearchesByUser(userId, limit = 10) {
  if (isMongoEnabled()) {
    return SearchHistoryDocument.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const data = await dataStore.readData();
  return data.searchHistory
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

module.exports = {
  addSearchRecord,
  getRecentSearchesByUser,
};
