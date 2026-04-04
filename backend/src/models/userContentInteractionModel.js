const { isMongoEnabled } = require('../config/database');
const UserContentInteractionDocument = require('./mongo/userContentInteractionDocument');
const dataStore = require('./dataStore');

async function createInteraction(record) {
  if (isMongoEnabled()) {
    const created = await UserContentInteractionDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.userContentInteractions = data.userContentInteractions || [];
    data.userContentInteractions.push(record);
    if (data.userContentInteractions.length > 30000) {
      data.userContentInteractions = data.userContentInteractions.slice(-30000);
    }
    return data;
  });

  return record;
}

async function listInteractionsByUser(userId, limit = 500) {
  if (isMongoEnabled()) {
    return UserContentInteractionDocument.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const data = await dataStore.readData();
  return (data.userContentInteractions || [])
    .filter((row) => row.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function listAllInteractions(limit = 5000) {
  if (isMongoEnabled()) {
    return UserContentInteractionDocument.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const data = await dataStore.readData();
  return (data.userContentInteractions || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

module.exports = {
  createInteraction,
  listInteractionsByUser,
  listAllInteractions,
};
