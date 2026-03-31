const { randomUUID } = require('crypto');
const activityModel = require('../models/activityModel');
const mealModel = require('../models/mealModel');
const calendarPlanModel = require('../models/calendarPlanModel');
const exerciseSessionModel = require('../models/exerciseSessionModel');
const userService = require('./userService');
const { normalizePreferences } = require('./userDefaultsService');
const { buildWeeklyBalancePlan } = require('./nutritionPlannerService');

function startOfDate(dateText) {
  return new Date(`${dateText}T00:00:00.000Z`);
}

function endOfDate(dateText) {
  return new Date(`${dateText}T23:59:59.999Z`);
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function round(value, decimals = 1) {
  return Number(Number(value || 0).toFixed(decimals));
}

function buildDayAggregate(dateKey) {
  return {
    date: dateKey,
    caloriesConsumed: 0,
    caloriesBurned: 0,
    routeCaloriesBurned: 0,
    exerciseCaloriesBurned: 0,
    netIntake: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    mealCount: 0,
    activityCount: 0,
    exerciseCount: 0,
    steps: 0,
    meals: [],
    activities: [],
    exercises: [],
    plannedCalories: null,
    isCheatDay: false,
    note: '',
  };
}

function aggregateByDay({ meals, activities, exercises, plans }) {
  const map = new Map();

  meals.forEach((meal) => {
    const dateKey = toDateKey(meal.createdAt);
    const row = map.get(dateKey) || buildDayAggregate(dateKey);

    row.caloriesConsumed += Number(meal.calories || 0);
    row.protein += Number(meal.protein || 0);
    row.carbs += Number(meal.carbs || 0);
    row.fats += Number(meal.fats || 0);
    row.fiber += Number(meal.fiber || 0);
    row.mealCount += 1;
    row.meals.push(meal);
    map.set(dateKey, row);
  });

  activities.forEach((activity) => {
    const dateKey = toDateKey(activity.createdAt);
    const row = map.get(dateKey) || buildDayAggregate(dateKey);

    row.routeCaloriesBurned += Number(activity.caloriesBurned || 0);
    row.activityCount += 1;
    row.activities.push(activity);
    map.set(dateKey, row);
  });

  exercises.forEach((exercise) => {
    const dateKey = toDateKey(exercise.createdAt);
    const row = map.get(dateKey) || buildDayAggregate(dateKey);

    row.exerciseCaloriesBurned += Number(exercise.caloriesBurned || 0);
    row.exerciseCount += 1;
    row.steps += Number(exercise.steps || 0);
    row.exercises.push(exercise);
    map.set(dateKey, row);
  });

  plans.forEach((plan) => {
    const row = map.get(plan.date) || buildDayAggregate(plan.date);
    row.plannedCalories = Number(plan.plannedCalories || 0);
    row.isCheatDay = Boolean(plan.isCheatDay);
    row.note = String(plan.note || '');
    map.set(plan.date, row);
  });

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      routeCaloriesBurned: round(row.routeCaloriesBurned, 0),
      exerciseCaloriesBurned: round(row.exerciseCaloriesBurned, 0),
      caloriesBurned: round(row.routeCaloriesBurned + row.exerciseCaloriesBurned, 0),
      caloriesConsumed: round(row.caloriesConsumed, 0),
      netIntake: round(row.caloriesConsumed - (row.routeCaloriesBurned + row.exerciseCaloriesBurned), 0),
      protein: round(row.protein),
      carbs: round(row.carbs),
      fats: round(row.fats),
      fiber: round(row.fiber),
      steps: Math.round(row.steps),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function getHistory(userId, months = 4) {
  const safeMonths = Math.max(1, Math.min(Number(months) || 4, 6));
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - safeMonths);

  const [meals, activities, exercises, plans] = await Promise.all([
    mealModel.listMealsByUser(userId, 3000),
    activityModel.listActivitiesByUser(userId, 2000),
    exerciseSessionModel.listSessionsByUser(userId, 3000),
    calendarPlanModel.listPlansBetween(
      userId,
      fromDate.toISOString().slice(0, 10),
      toDate.toISOString().slice(0, 10)
    ),
  ]);

  const filteredMeals = meals.filter((item) => new Date(item.createdAt) >= fromDate);
  const filteredActivities = activities.filter((item) => new Date(item.createdAt) >= fromDate);
  const filteredExercises = exercises.filter((item) => new Date(item.createdAt) >= fromDate);

  const days = aggregateByDay({
    meals: filteredMeals,
    activities: filteredActivities,
    exercises: filteredExercises,
    plans,
  });

  return {
    fromDate: fromDate.toISOString().slice(0, 10),
    toDate: toDate.toISOString().slice(0, 10),
    days,
  };
}

async function getDayDetails(userId, dateKey) {
  const [meals, activities, exercises, plans] = await Promise.all([
    mealModel.listMealsByUserBetween(userId, startOfDate(dateKey).toISOString(), endOfDate(dateKey).toISOString()),
    activityModel.listActivitiesByUserBetween(
      userId,
      startOfDate(dateKey).toISOString(),
      endOfDate(dateKey).toISOString()
    ),
    exerciseSessionModel.listSessionsByUserBetween(
      userId,
      startOfDate(dateKey).toISOString(),
      endOfDate(dateKey).toISOString()
    ),
    calendarPlanModel.listPlansBetween(userId, dateKey, dateKey),
  ]);

  const summary = aggregateByDay({ meals, activities, exercises, plans })[0] || buildDayAggregate(dateKey);

  return {
    date: dateKey,
    summary: {
      caloriesConsumed: round(summary.caloriesConsumed, 0),
      caloriesBurned: round(summary.caloriesBurned, 0),
      routeCaloriesBurned: round(summary.routeCaloriesBurned, 0),
      exerciseCaloriesBurned: round(summary.exerciseCaloriesBurned, 0),
      netIntake: round(summary.caloriesConsumed - summary.caloriesBurned, 0),
      protein: round(summary.protein),
      carbs: round(summary.carbs),
      fats: round(summary.fats),
      fiber: round(summary.fiber),
      mealCount: summary.mealCount,
      activityCount: summary.activityCount,
      exerciseCount: summary.exerciseCount,
      steps: Math.round(summary.steps || 0),
      plannedCalories: summary.plannedCalories,
      isCheatDay: Boolean(summary.isCheatDay),
      note: summary.note || '',
    },
    meals,
    activities,
    exercises,
    plan: plans[0] || null,
  };
}

async function createOrUpdatePlan(userId, payload) {
  const user = await userService.getUserOrThrow(userId);
  const preferences = normalizePreferences(user.preferences || {});
  const weeklyBalance = buildWeeklyBalancePlan({
    plannedCalories: payload.plannedCalories,
    dailyCalorieGoal: preferences.dailyCalorieGoal,
    targetDate: payload.date,
  });

  const record = {
    id: randomUUID(),
    userId,
    date: payload.date,
    plannedCalories: payload.plannedCalories,
    expectedExtraCalories: weeklyBalance.expectedExtraCalories,
    reductionPerDay: weeklyBalance.reductionPerDay,
    planningWindowDays: weeklyBalance.planningWindowDays,
    isCheatDay:
      payload.isCheatDay === undefined
        ? weeklyBalance.isCheatDay
        : Boolean(payload.isCheatDay),
    note: String(payload.note || ''),
    suggestions: weeklyBalance.suggestions,
    createdAt: new Date().toISOString(),
  };

  const saved = await calendarPlanModel.upsertPlan(userId, payload.date, record);

  return {
    plan: saved,
    recommendation: {
      message: weeklyBalance.message,
      suggestions: weeklyBalance.suggestions,
    },
  };
}

async function getUpcoming(userId) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 31);

  const plans = await calendarPlanModel.listUpcomingPlans(
    userId,
    from.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10)
  );

  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
    plans,
  };
}

module.exports = {
  getHistory,
  getDayDetails,
  createOrUpdatePlan,
  getUpcoming,
};
