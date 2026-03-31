const { isMongoEnabled } = require('../config/database');
const MealDocument = require('./mongo/mealDocument');
const dataStore = require('./dataStore');

async function createMeal(record) {
  if (isMongoEnabled()) {
    const created = await MealDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.meals = data.meals || [];
    data.meals.push(record);
    if (data.meals.length > 5000) {
      data.meals = data.meals.slice(-5000);
    }
    return data;
  });

  return record;
}

async function listMealsByUser(userId, limit = 100) {
  if (isMongoEnabled()) {
    return MealDocument.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.meals || [])
    .filter((meal) => meal.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function listMealsByUserBetween(userId, startIso, endIso) {
  if (isMongoEnabled()) {
    return MealDocument.find({
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

  return (data.meals || [])
    .filter((meal) => {
      if (meal.userId !== userId) {
        return false;
      }

      const createdAt = new Date(meal.createdAt);
      return createdAt >= start && createdAt <= end;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function findMealByIdForUser(userId, mealId) {
  if (isMongoEnabled()) {
    return MealDocument.findOne({ id: mealId, userId }).lean();
  }

  const data = await dataStore.readData();
  return (data.meals || []).find((meal) => meal.userId === userId && meal.id === mealId) || null;
}

async function updateMealByIdForUser(userId, mealId, fields) {
  if (isMongoEnabled()) {
    return MealDocument.findOneAndUpdate({ id: mealId, userId }, { ...fields }, { new: true }).lean();
  }

  let updated = null;
  await dataStore.updateData((data) => {
    data.meals = data.meals || [];
    const index = data.meals.findIndex((meal) => meal.userId === userId && meal.id === mealId);
    if (index === -1) {
      return data;
    }

    data.meals[index] = {
      ...data.meals[index],
      ...fields,
    };

    updated = data.meals[index];
    return data;
  });

  return updated;
}

async function deleteMealByIdForUser(userId, mealId) {
  let removed = null;

  if (isMongoEnabled()) {
    const found = await MealDocument.findOne({ id: mealId, userId }).lean();
    if (!found) {
      return null;
    }

    await MealDocument.deleteOne({ id: mealId, userId });
    return found;
  }

  await dataStore.updateData((data) => {
    data.meals = data.meals || [];
    const index = data.meals.findIndex((meal) => meal.userId === userId && meal.id === mealId);
    if (index === -1) {
      return data;
    }

    removed = data.meals[index];
    data.meals.splice(index, 1);
    return data;
  });

  return removed;
}

module.exports = {
  createMeal,
  listMealsByUser,
  listMealsByUserBetween,
  findMealByIdForUser,
  updateMealByIdForUser,
  deleteMealByIdForUser,
};
