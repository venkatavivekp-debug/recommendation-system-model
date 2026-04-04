const AppError = require('../utils/appError');
const mealModel = require('../models/mealModel');
const exerciseSessionModel = require('../models/exerciseSessionModel');
const userService = require('./userService');
const { sendShareEmail } = require('./emailService');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoStart(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).toISOString();
}

function toIsoEnd(dateKey) {
  return new Date(`${dateKey}T23:59:59.999Z`).toISOString();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function toDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function aggregateMeals(meals) {
  return meals.reduce(
    (acc, item) => ({
      calories: acc.calories + toNumber(item.calories, 0),
      protein: acc.protein + toNumber(item.protein, 0),
      carbs: acc.carbs + toNumber(item.carbs, 0),
      fats: acc.fats + toNumber(item.fats, 0),
      fiber: acc.fiber + toNumber(item.fiber, 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );
}

function aggregateExercise(sessions) {
  return sessions.reduce(
    (acc, item) => ({
      caloriesBurned: acc.caloriesBurned + toNumber(item.caloriesBurned, 0),
      steps: acc.steps + toNumber(item.steps, 0),
    }),
    { caloriesBurned: 0, steps: 0 }
  );
}

async function buildDietSnapshot(userId, dateKey) {
  const [meals, exercises] = await Promise.all([
    mealModel.listMealsByUserBetween(userId, toIsoStart(dateKey), toIsoEnd(dateKey)),
    exerciseSessionModel.listSessionsByUserBetween(userId, toIsoStart(dateKey), toIsoEnd(dateKey)),
  ]);

  const mealTotals = aggregateMeals(meals);
  const exerciseTotals = aggregateExercise(exercises);

  return {
    date: dateKey,
    summary: {
      caloriesConsumed: Number(mealTotals.calories.toFixed(0)),
      caloriesBurned: Number(exerciseTotals.caloriesBurned.toFixed(1)),
      netCalories: Number((mealTotals.calories - exerciseTotals.caloriesBurned).toFixed(1)),
      protein: Number(mealTotals.protein.toFixed(1)),
      carbs: Number(mealTotals.carbs.toFixed(1)),
      fats: Number(mealTotals.fats.toFixed(1)),
      fiber: Number(mealTotals.fiber.toFixed(1)),
      steps: Math.round(exerciseTotals.steps),
    },
    meals: meals.slice(0, 20),
    exercises: exercises.slice(0, 20),
  };
}

function normalizeShareType(type) {
  const safe = String(type || '').trim().toLowerCase();
  if (['diet', 'recipe', 'plan'].includes(safe)) {
    return safe;
  }
  return 'diet';
}

function buildEmailSubject(type, sender) {
  if (type === 'recipe') {
    return `${sender.firstName} shared a ContextFit recipe`;
  }
  if (type === 'plan') {
    return `${sender.firstName} shared a ContextFit nutrition plan`;
  }
  return `${sender.firstName} shared a ContextFit day summary`;
}

async function shareViaEmail(senderUserId, payload = {}) {
  const sender = await userService.getUserOrThrow(senderUserId);
  const toEmail = String(payload.toEmail || '').trim().toLowerCase();
  const type = normalizeShareType(payload.type);
  const message = String(payload.message || '').trim();

  if (!isValidEmail(toEmail)) {
    throw new AppError('Provide a valid recipient email', 400, 'VALIDATION_ERROR', [
      { field: 'toEmail', message: 'Provide a valid recipient email' },
    ]);
  }

  let content = payload.content || {};
  if (type === 'diet') {
    const date = String(payload.content?.date || payload.date || toDateKey()).slice(0, 10);
    content = await buildDietSnapshot(sender.id, date);
  }

  const subject = buildEmailSubject(type, sender);
  const result = await sendShareEmail({
    toEmail,
    subject,
    message,
    type,
    data: content,
  });

  return {
    delivered: Boolean(result?.delivered),
    provider: result?.provider || 'mock',
    messageId: result?.messageId || null,
    toEmail,
    type,
    preview: {
      subject,
      message,
    },
  };
}

module.exports = {
  shareViaEmail,
};
