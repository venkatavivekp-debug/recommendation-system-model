const { isMongoEnabled } = require('../config/database');
const EvaluationMetricDocument = require('./mongo/evaluationMetricDocument');
const dataStore = require('./dataStore');

async function upsertByUserAndDate(userId, date, record) {
  if (isMongoEnabled()) {
    return EvaluationMetricDocument.findOneAndUpdate(
      { userId, date },
      {
        ...record,
        userId,
        date,
        updatedAt: new Date().toISOString(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  }

  let updated = null;
  await dataStore.updateData((data) => {
    data.evaluationMetrics = data.evaluationMetrics || [];

    const index = data.evaluationMetrics.findIndex(
      (item) => item.userId === userId && item.date === date
    );

    const next = {
      ...record,
      userId,
      date,
      updatedAt: new Date().toISOString(),
    };

    if (index >= 0) {
      data.evaluationMetrics[index] = {
        ...data.evaluationMetrics[index],
        ...next,
      };
      updated = data.evaluationMetrics[index];
    } else {
      data.evaluationMetrics.push(next);
      updated = next;
    }

    if (data.evaluationMetrics.length > 2400) {
      data.evaluationMetrics = data.evaluationMetrics.slice(-2400);
    }

    return data;
  });

  return updated;
}

async function listByUser(userId, limit = 60) {
  if (isMongoEnabled()) {
    return EvaluationMetricDocument.find({ userId }).sort({ date: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.evaluationMetrics || [])
    .filter((item) => item.userId === userId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
}

async function getByUserAndDate(userId, date) {
  if (isMongoEnabled()) {
    return EvaluationMetricDocument.findOne({ userId, date }).lean();
  }

  const data = await dataStore.readData();
  return (data.evaluationMetrics || []).find((item) => item.userId === userId && item.date === date) || null;
}

module.exports = {
  upsertByUserAndDate,
  listByUser,
  getByUserAndDate,
};
