const { isMongoEnabled } = require('../config/database');
const CalendarPlanDocument = require('./mongo/calendarPlanDocument');
const dataStore = require('./dataStore');

async function createPlan(record) {
  if (isMongoEnabled()) {
    const created = await CalendarPlanDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.calendarPlans = data.calendarPlans || [];
    data.calendarPlans.push(record);
    return data;
  });

  return record;
}

async function upsertPlan(userId, date, record) {
  if (isMongoEnabled()) {
    return CalendarPlanDocument.findOneAndUpdate(
      { userId, date },
      { ...record },
      { new: true, upsert: true }
    ).lean();
  }

  let upserted = record;

  await dataStore.updateData((data) => {
    data.calendarPlans = data.calendarPlans || [];
    const index = data.calendarPlans.findIndex((plan) => plan.userId === userId && plan.date === date);

    if (index >= 0) {
      data.calendarPlans[index] = {
        ...data.calendarPlans[index],
        ...record,
      };
      upserted = data.calendarPlans[index];
      return data;
    }

    data.calendarPlans.push(record);
    upserted = record;
    return data;
  });

  return upserted;
}

async function listPlansByUser(userId, limit = 200) {
  if (isMongoEnabled()) {
    return CalendarPlanDocument.find({ userId }).sort({ date: 1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.calendarPlans || [])
    .filter((plan) => plan.userId === userId)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, limit);
}

async function listPlansBetween(userId, fromDate, toDate) {
  if (isMongoEnabled()) {
    return CalendarPlanDocument.find({
      userId,
      date: {
        $gte: fromDate,
        $lte: toDate,
      },
    })
      .sort({ date: 1 })
      .lean();
  }

  const data = await dataStore.readData();
  return (data.calendarPlans || [])
    .filter((plan) => plan.userId === userId && plan.date >= fromDate && plan.date <= toDate)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

async function listUpcomingPlans(userId, fromDate, toDate) {
  if (isMongoEnabled()) {
    return CalendarPlanDocument.find({
      userId,
      date: {
        $gte: fromDate,
        $lte: toDate,
      },
    })
      .sort({ date: 1 })
      .lean();
  }

  const data = await dataStore.readData();
  return (data.calendarPlans || [])
    .filter((plan) => plan.userId === userId && plan.date >= fromDate && plan.date <= toDate)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

module.exports = {
  createPlan,
  upsertPlan,
  listPlansByUser,
  listPlansBetween,
  listUpcomingPlans,
};
