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

async function deleteInteractionsByUserIds(userIds = []) {
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean);
  if (!ids.length) {
    return { deletedCount: 0 };
  }

  if (isMongoEnabled()) {
    const result = await UserContentInteractionDocument.deleteMany({ userId: { $in: ids } });
    return { deletedCount: result.deletedCount || 0 };
  }

  let deletedCount = 0;
  await dataStore.updateData((data) => {
    const rows = data.userContentInteractions || [];
    data.userContentInteractions = rows.filter((row) => {
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
  listInteractionsByUser,
  listAllInteractions,
  deleteInteractionsByUserIds,
};
