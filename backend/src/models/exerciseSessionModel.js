const { isMongoEnabled } = require('../config/database');
const ExerciseSessionDocument = require('./mongo/exerciseSessionDocument');
const WearableConnectionDocument = require('./mongo/wearableConnectionDocument');
const dataStore = require('./dataStore');

async function createSession(record) {
  if (isMongoEnabled()) {
    const created = await ExerciseSessionDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.exerciseSessions = data.exerciseSessions || [];
    data.exerciseSessions.push(record);
    if (data.exerciseSessions.length > 6000) {
      data.exerciseSessions = data.exerciseSessions.slice(-6000);
    }
    return data;
  });

  return record;
}

async function listSessionsByUser(userId, limit = 200) {
  if (isMongoEnabled()) {
    return ExerciseSessionDocument.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.exerciseSessions || [])
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function listSessionsByUserBetween(userId, startIso, endIso) {
  if (isMongoEnabled()) {
    return ExerciseSessionDocument.find({
      userId,
      createdAt: {
        $gte: startIso,
        $lte: endIso,
      },
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  const start = new Date(startIso);
  const end = new Date(endIso);
  const data = await dataStore.readData();

  return (data.exerciseSessions || [])
    .filter((item) => {
      if (item.userId !== userId) {
        return false;
      }

      const createdAt = new Date(item.createdAt);
      return createdAt >= start && createdAt <= end;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function replaceWearableConnection(userId, provider, connected) {
  if (isMongoEnabled()) {
    const syncedAt = new Date().toISOString();
    const row = await WearableConnectionDocument.findOneAndUpdate(
      { userId, provider },
      {
        $set: {
          userId,
          provider,
          connected,
          syncedAt,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).lean();
    return row;
  }

  let row = null;
  await dataStore.updateData((data) => {
    data.wearableConnections = data.wearableConnections || [];

    const index = data.wearableConnections.findIndex(
      (item) => item.userId === userId && item.provider === provider
    );

    const next = {
      userId,
      provider,
      connected,
      syncedAt: new Date().toISOString(),
    };

    if (index >= 0) {
      data.wearableConnections[index] = next;
    } else {
      data.wearableConnections.push(next);
    }

    row = next;
    return data;
  });

  return row;
}

async function listWearableConnections(userId) {
  if (isMongoEnabled()) {
    return WearableConnectionDocument.find({ userId }).sort({ syncedAt: -1 }).lean();
  }

  const data = await dataStore.readData();
  return (data.wearableConnections || []).filter((item) => item.userId === userId);
}

async function findSessionByIdForUser(userId, sessionId) {
  if (isMongoEnabled()) {
    return ExerciseSessionDocument.findOne({ id: sessionId, userId }).lean();
  }

  const data = await dataStore.readData();
  return (data.exerciseSessions || []).find((item) => item.userId === userId && item.id === sessionId) || null;
}

async function updateSessionByIdForUser(userId, sessionId, fields) {
  if (isMongoEnabled()) {
    return ExerciseSessionDocument.findOneAndUpdate(
      { id: sessionId, userId },
      { ...fields },
      { new: true }
    ).lean();
  }

  let updated = null;
  await dataStore.updateData((data) => {
    data.exerciseSessions = data.exerciseSessions || [];
    const index = data.exerciseSessions.findIndex((item) => item.userId === userId && item.id === sessionId);
    if (index === -1) {
      return data;
    }

    data.exerciseSessions[index] = {
      ...data.exerciseSessions[index],
      ...fields,
    };
    updated = data.exerciseSessions[index];
    return data;
  });

  return updated;
}

async function deleteSessionByIdForUser(userId, sessionId) {
  if (isMongoEnabled()) {
    const found = await ExerciseSessionDocument.findOne({ id: sessionId, userId }).lean();
    if (!found) {
      return null;
    }
    await ExerciseSessionDocument.deleteOne({ id: sessionId, userId });
    return found;
  }

  let removed = null;
  await dataStore.updateData((data) => {
    data.exerciseSessions = data.exerciseSessions || [];
    const index = data.exerciseSessions.findIndex((item) => item.userId === userId && item.id === sessionId);
    if (index === -1) {
      return data;
    }
    removed = data.exerciseSessions[index];
    data.exerciseSessions.splice(index, 1);
    return data;
  });

  return removed;
}

module.exports = {
  createSession,
  listSessionsByUser,
  listSessionsByUserBetween,
  replaceWearableConnection,
  listWearableConnections,
  findSessionByIdForUser,
  updateSessionByIdForUser,
  deleteSessionByIdForUser,
};
