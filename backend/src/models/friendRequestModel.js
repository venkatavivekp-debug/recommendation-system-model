const { isMongoEnabled } = require('../config/database');
const FriendRequestDocument = require('./mongo/friendRequestDocument');
const dataStore = require('./dataStore');

async function createFriendRequest(record) {
  if (isMongoEnabled()) {
    const created = await FriendRequestDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.friendRequests = data.friendRequests || [];
    data.friendRequests.push(record);
    return data;
  });

  return record;
}

async function findFriendRequestById(requestId) {
  if (isMongoEnabled()) {
    return FriendRequestDocument.findOne({ id: requestId }).lean();
  }

  const data = await dataStore.readData();
  return (data.friendRequests || []).find((row) => row.id === requestId) || null;
}

async function updateFriendRequestById(requestId, fields) {
  if (isMongoEnabled()) {
    return FriendRequestDocument.findOneAndUpdate({ id: requestId }, { ...fields }, { new: true }).lean();
  }

  let updated = null;
  await dataStore.updateData((data) => {
    data.friendRequests = data.friendRequests || [];
    const index = data.friendRequests.findIndex((row) => row.id === requestId);
    if (index === -1) {
      return data;
    }

    data.friendRequests[index] = {
      ...data.friendRequests[index],
      ...fields,
    };
    updated = data.friendRequests[index];
    return data;
  });

  return updated;
}

async function listFriendRequestsByUser(userId, limit = 200) {
  if (isMongoEnabled()) {
    return FriendRequestDocument.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const data = await dataStore.readData();
  return (data.friendRequests || [])
    .filter((row) => row.senderId === userId || row.receiverId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function findPendingRequestBetweenUsers(userAId, userBId) {
  if (isMongoEnabled()) {
    return FriendRequestDocument.findOne({
      status: 'PENDING',
      $or: [
        { senderId: userAId, receiverId: userBId },
        { senderId: userBId, receiverId: userAId },
      ],
    }).lean();
  }

  const data = await dataStore.readData();
  return (
    (data.friendRequests || []).find((row) => {
      if (row.status !== 'PENDING') {
        return false;
      }

      const direct = row.senderId === userAId && row.receiverId === userBId;
      const reverse = row.senderId === userBId && row.receiverId === userAId;
      return direct || reverse;
    }) || null
  );
}

module.exports = {
  createFriendRequest,
  findFriendRequestById,
  updateFriendRequestById,
  listFriendRequestsByUser,
  findPendingRequestBetweenUsers,
};
