const { isMongoEnabled } = require('../config/database');
const ActivityDocument = require('./mongo/activityDocument');
const dataStore = require('./dataStore');

async function createActivity(record) {
  if (isMongoEnabled()) {
    const created = await ActivityDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.activities.push(record);
    if (data.activities.length > 2000) {
      data.activities = data.activities.slice(-2000);
    }
    return data;
  });

  return record;
}

async function listActivitiesByUser(userId, limit = 30) {
  if (isMongoEnabled()) {
    return ActivityDocument.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.activities || [])
    .filter((activity) => activity.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function listActivitiesByUserBetween(userId, startIso, endIso) {
  if (isMongoEnabled()) {
    return ActivityDocument.find({
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
  return (data.activities || [])
    .filter((activity) => {
      if (activity.userId !== userId) {
        return false;
      }

      const createdAt = new Date(activity.createdAt);
      return createdAt >= start && createdAt <= end;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  createActivity,
  listActivitiesByUser,
  listActivitiesByUserBetween,
};
