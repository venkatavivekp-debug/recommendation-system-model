const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const { isToday, isPast } = require('../utils/dateLock');
const mealModel = require('../models/mealModel');

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function aggregateMeals(meals) {
  return meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + Number(meal.calories || 0),
      protein: acc.protein + Number(meal.protein || 0),
      carbs: acc.carbs + Number(meal.carbs || 0),
      fats: acc.fats + Number(meal.fats || 0),
      fiber: acc.fiber + Number(meal.fiber || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );
}

function toRoundedTotals(totals) {
  return {
    calories: Number(totals.calories.toFixed(0)),
    protein: Number(totals.protein.toFixed(1)),
    carbs: Number(totals.carbs.toFixed(1)),
    fats: Number(totals.fats.toFixed(1)),
    fiber: Number(totals.fiber.toFixed(1)),
  };
}

function groupMealsByDay(meals) {
  const map = new Map();

  meals.forEach((meal) => {
    const dateKey = String(meal.createdAt || '').slice(0, 10);
    const current = map.get(dateKey) || {
      date: dateKey,
      meals: [],
      totals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
    };

    current.meals.push(meal);
    current.totals.calories += Number(meal.calories || 0);
    current.totals.protein += Number(meal.protein || 0);
    current.totals.carbs += Number(meal.carbs || 0);
    current.totals.fats += Number(meal.fats || 0);
    current.totals.fiber += Number(meal.fiber || 0);
    map.set(dateKey, current);
  });

  return Array.from(map.values())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((item) => ({
      ...item,
      totals: toRoundedTotals(item.totals),
    }));
}

function assertDayEditable(dateValue) {
  if (isPast(dateValue)) {
    throw new AppError('Past data cannot be modified', 400, 'DATA_LOCKED');
  }

  if (!isToday(dateValue)) {
    throw new AppError('Only today data can be modified', 400, 'DATA_LOCKED');
  }
}

async function createMeal(userId, payload) {
  const createdAt = payload.timestamp || new Date().toISOString();
  assertDayEditable(createdAt);

  const record = {
    id: randomUUID(),
    userId,
    foodName: payload.foodName,
    brand: payload.brand || null,
    calories: payload.calories,
    protein: payload.protein,
    carbs: payload.carbs,
    fats: payload.fats,
    fiber: payload.fiber,
    source: payload.sourceType || payload.source || 'custom',
    sourceType: payload.sourceType || payload.source || 'custom',
    mealType: payload.mealType || null,
    portion: Number(payload.portion || 1),
    ingredients: Array.isArray(payload.ingredients) ? payload.ingredients : [],
    allergyWarnings: Array.isArray(payload.allergyWarnings) ? payload.allergyWarnings : [],
    createdAt,
  };

  return mealModel.createMeal(record);
}

async function getTodayMeals(userId) {
  const meals = await mealModel.listMealsByUserBetween(
    userId,
    startOfToday().toISOString(),
    endOfToday().toISOString()
  );

  return {
    meals,
    totals: toRoundedTotals(aggregateMeals(meals)),
  };
}

async function getMealHistory(userId, limit = 120) {
  const meals = await mealModel.listMealsByUser(userId, limit);
  return {
    meals,
    byDay: groupMealsByDay(meals),
  };
}

async function updateMeal(userId, mealId, payload) {
  const existing = await mealModel.findMealByIdForUser(userId, mealId);
  if (!existing) {
    throw new AppError('Meal not found', 404, 'NOT_FOUND');
  }

  assertDayEditable(existing.createdAt);

  if (payload.timestamp) {
    assertDayEditable(payload.timestamp);
  }

  const updated = await mealModel.updateMealByIdForUser(userId, mealId, {
    foodName: payload.foodName,
    brand: payload.brand || null,
    calories: payload.calories,
    protein: payload.protein,
    carbs: payload.carbs,
    fats: payload.fats,
    fiber: payload.fiber,
    source: payload.sourceType || payload.source || existing.source || 'custom',
    sourceType: payload.sourceType || payload.source || existing.sourceType || 'custom',
    mealType: payload.mealType || null,
    portion: Number(payload.portion || existing.portion || 1),
    ingredients: Array.isArray(payload.ingredients) ? payload.ingredients : [],
    allergyWarnings: Array.isArray(payload.allergyWarnings) ? payload.allergyWarnings : [],
    createdAt: payload.timestamp || existing.createdAt,
  });

  return updated;
}

async function deleteMeal(userId, mealId) {
  const existing = await mealModel.findMealByIdForUser(userId, mealId);
  if (!existing) {
    throw new AppError('Meal not found', 404, 'NOT_FOUND');
  }

  assertDayEditable(existing.createdAt);

  await mealModel.deleteMealByIdForUser(userId, mealId);
  return existing;
}

module.exports = {
  createMeal,
  updateMeal,
  deleteMeal,
  getTodayMeals,
  getMealHistory,
  aggregateMeals,
  toRoundedTotals,
  isToday,
  isPast,
};
