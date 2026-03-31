const { isMongoEnabled } = require('../config/database');
const FriendDocument = require('./mongo/friendDocument');
const dataStore = require('./dataStore');

async function createFriendship(record) {
  if (isMongoEnabled()) {
    const created = await FriendDocument.findOneAndUpdate(
      { userId: record.userId, friendId: record.friendId },
      { $setOnInsert: record },
      { upsert: true, new: true }
    ).lean();
    return created;
  }

  let created = null;
  await dataStore.updateData((data) => {
    data.friends = data.friends || [];
    const exists = data.friends.some(
      (row) => row.userId === record.userId && row.friendId === record.friendId
    );
    if (!exists) {
      data.friends.push(record);
      created = record;
    }
    return data;
  });

  return created || record;
}

async function listFriendsByUser(userId, limit = 500) {
  if (isMongoEnabled()) {
    return FriendDocument.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.friends || [])
    .filter((row) => row.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function areUsersFriends(userAId, userBId) {
  if (isMongoEnabled()) {
    const row = await FriendDocument.findOne({ userId: userAId, friendId: userBId }).lean();
    return Boolean(row);
  }

  const data = await dataStore.readData();
  return (data.friends || []).some((row) => row.userId === userAId && row.friendId === userBId);
}

module.exports = {
  createFriendship,
  listFriendsByUser,
  areUsersFriends,
};
