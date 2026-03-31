const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const mealModel = require('../models/mealModel');
const exerciseSessionModel = require('../models/exerciseSessionModel');
const dietShareModel = require('../models/dietShareModel');
const userService = require('./userService');
const friendService = require('./friendService');

function toIsoStart(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).toISOString();
}

function toIsoEnd(dateKey) {
  return new Date(`${dateKey}T23:59:59.999Z`).toISOString();
}

function addDays(dateKey, offset) {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

function aggregateMeals(meals) {
  return meals.reduce(
    (acc, item) => ({
      calories: acc.calories + Number(item.calories || 0),
      protein: acc.protein + Number(item.protein || 0),
      carbs: acc.carbs + Number(item.carbs || 0),
      fats: acc.fats + Number(item.fats || 0),
      fiber: acc.fiber + Number(item.fiber || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );
}

function aggregateExercise(sessions) {
  return sessions.reduce(
    (acc, item) => ({
      caloriesBurned: acc.caloriesBurned + Number(item.caloriesBurned || 0),
      steps: acc.steps + Number(item.steps || 0),
      durationMinutes: acc.durationMinutes + Number(item.durationMinutes || 0),
    }),
    { caloriesBurned: 0, steps: 0, durationMinutes: 0 }
  );
}

function roundTotals(totals) {
  return {
    calories: Number((totals.calories || 0).toFixed(0)),
    protein: Number((totals.protein || 0).toFixed(1)),
    carbs: Number((totals.carbs || 0).toFixed(1)),
    fats: Number((totals.fats || 0).toFixed(1)),
    fiber: Number((totals.fiber || 0).toFixed(1)),
  };
}

async function buildDaySnapshot(userId, dateKey) {
  const [meals, exercises] = await Promise.all([
    mealModel.listMealsByUserBetween(userId, toIsoStart(dateKey), toIsoEnd(dateKey)),
    exerciseSessionModel.listSessionsByUserBetween(userId, toIsoStart(dateKey), toIsoEnd(dateKey)),
  ]);

  const mealTotals = roundTotals(aggregateMeals(meals));
  const exerciseTotals = aggregateExercise(exercises);

  return {
    mode: 'day',
    date: dateKey,
    caloriesConsumed: mealTotals.calories,
    caloriesBurned: Number((exerciseTotals.caloriesBurned || 0).toFixed(1)),
    netCalories: Number((mealTotals.calories - exerciseTotals.caloriesBurned).toFixed(1)),
    macros: mealTotals,
    meals,
    exercises,
    steps: Math.round(exerciseTotals.steps || 0),
  };
}

async function buildWeekSnapshot(userId, weekStart) {
  const dayKeys = Array.from({ length: 7 }).map((_, index) => addDays(weekStart, index));
  const daySnapshots = await Promise.all(dayKeys.map((date) => buildDaySnapshot(userId, date)));

  const totals = daySnapshots.reduce(
    (acc, day) => ({
      caloriesConsumed: acc.caloriesConsumed + Number(day.caloriesConsumed || 0),
      caloriesBurned: acc.caloriesBurned + Number(day.caloriesBurned || 0),
      protein: acc.protein + Number(day.macros.protein || 0),
      carbs: acc.carbs + Number(day.macros.carbs || 0),
      fats: acc.fats + Number(day.macros.fats || 0),
      fiber: acc.fiber + Number(day.macros.fiber || 0),
    }),
    { caloriesConsumed: 0, caloriesBurned: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );

  return {
    mode: 'week',
    weekStart,
    weekEnd: addDays(weekStart, 6),
    totals: {
      caloriesConsumed: Number(totals.caloriesConsumed.toFixed(0)),
      caloriesBurned: Number(totals.caloriesBurned.toFixed(1)),
      netCalories: Number((totals.caloriesConsumed - totals.caloriesBurned).toFixed(1)),
      protein: Number(totals.protein.toFixed(1)),
      carbs: Number(totals.carbs.toFixed(1)),
      fats: Number(totals.fats.toFixed(1)),
      fiber: Number(totals.fiber.toFixed(1)),
    },
    days: daySnapshots,
  };
}

async function shareDiet(senderId, payload) {
  const sender = await userService.getUserOrThrow(senderId);
  const target = await userService.getUserOrThrow(payload.targetUserId);

  if (sender.id === target.id) {
    throw new AppError('Cannot share diet data with yourself', 400, 'VALIDATION_ERROR');
  }

  const isFriend = await friendService.areFriends(sender.id, target.id);
  if (!isFriend) {
    throw new AppError('Diet sharing is allowed only with friends', 403, 'FORBIDDEN');
  }

  const mode = payload.week ? 'week' : 'day';
  const snapshot =
    mode === 'week'
      ? await buildWeekSnapshot(sender.id, payload.week)
      : await buildDaySnapshot(sender.id, payload.date);

  const record = await dietShareModel.createDietShare({
    id: randomUUID(),
    senderId: sender.id,
    targetUserId: target.id,
    mode,
    date: mode === 'day' ? payload.date : null,
    weekStart: mode === 'week' ? payload.week : null,
    message: String(payload.message || '').trim(),
    snapshot,
    createdAt: new Date().toISOString(),
  });

  return {
    share: record,
    targetUser: {
      id: target.id,
      firstName: target.firstName,
      lastName: target.lastName,
      email: target.email,
    },
  };
}

async function listSharedDietInbox(userId, limit = 80) {
  const rows = await dietShareModel.listDietSharesForUser(userId, Math.max(1, Math.min(limit, 300)));
  const users = await userService.getAllUsers();
  const byId = new Map(users.map((item) => [item.id, item]));

  return {
    shares: rows.map((row) => ({
      ...row,
      sender: byId.get(row.senderId)
        ? {
            id: byId.get(row.senderId).id,
            firstName: byId.get(row.senderId).firstName,
            lastName: byId.get(row.senderId).lastName,
            email: byId.get(row.senderId).email,
          }
        : null,
    })),
  };
}

module.exports = {
  shareDiet,
  listSharedDietInbox,
};
