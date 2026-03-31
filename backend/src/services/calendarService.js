const { randomUUID } = require('crypto');
const activityModel = require('../models/activityModel');
const mealModel = require('../models/mealModel');
const calendarPlanModel = require('../models/calendarPlanModel');
const userService = require('./userService');
const { normalizePreferences } = require('./userDefaultsService');

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

function daysBetween(startDate, endDate) {
  const a = new Date(startDate);
  const b = new Date(endDate);

  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);

  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000);
}

function buildDayAggregate(dateKey) {
  return {
    date: dateKey,
    caloriesConsumed: 0,
    caloriesBurned: 0,
    netIntake: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    mealCount: 0,
    activityCount: 0,
    meals: [],
    activities: [],
    plannedCalories: null,
  };
}

function aggregateByDay({ meals, activities, plans }) {
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

    row.caloriesBurned += Number(activity.caloriesBurned || 0);
    row.activityCount += 1;
    row.activities.push(activity);
    map.set(dateKey, row);
  });

  plans.forEach((plan) => {
    const row = map.get(plan.date) || buildDayAggregate(plan.date);
    row.plannedCalories = Number(plan.plannedCalories || 0);
    map.set(plan.date, row);
  });

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      caloriesConsumed: round(row.caloriesConsumed, 0),
      caloriesBurned: round(row.caloriesBurned, 0),
      netIntake: round(row.caloriesConsumed - row.caloriesBurned, 0),
      protein: round(row.protein),
      carbs: round(row.carbs),
      fats: round(row.fats),
      fiber: round(row.fiber),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function getHistory(userId, months = 4) {
  const safeMonths = Math.max(1, Math.min(Number(months) || 4, 6));
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - safeMonths);

  const [meals, activities, plans] = await Promise.all([
    mealModel.listMealsByUser(userId, 3000),
    activityModel.listActivitiesByUser(userId, 2000),
    calendarPlanModel.listPlansBetween(
      userId,
      fromDate.toISOString().slice(0, 10),
      toDate.toISOString().slice(0, 10)
    ),
  ]);

  const filteredMeals = meals.filter((item) => new Date(item.createdAt) >= fromDate);
  const filteredActivities = activities.filter((item) => new Date(item.createdAt) >= fromDate);

  const days = aggregateByDay({
    meals: filteredMeals,
    activities: filteredActivities,
    plans,
  });

  return {
    fromDate: fromDate.toISOString().slice(0, 10),
    toDate: toDate.toISOString().slice(0, 10),
    days,
  };
}

async function getDayDetails(userId, dateKey) {
  const [meals, activities, plans] = await Promise.all([
    mealModel.listMealsByUserBetween(userId, startOfDate(dateKey).toISOString(), endOfDate(dateKey).toISOString()),
    activityModel.listActivitiesByUserBetween(
      userId,
      startOfDate(dateKey).toISOString(),
      endOfDate(dateKey).toISOString()
    ),
    calendarPlanModel.listPlansBetween(userId, dateKey, dateKey),
  ]);

  const summary = aggregateByDay({ meals, activities, plans })[0] || buildDayAggregate(dateKey);

  return {
    date: dateKey,
    summary: {
      caloriesConsumed: round(summary.caloriesConsumed, 0),
      caloriesBurned: round(summary.caloriesBurned, 0),
      netIntake: round(summary.caloriesConsumed - summary.caloriesBurned, 0),
      protein: round(summary.protein),
      carbs: round(summary.carbs),
      fats: round(summary.fats),
      fiber: round(summary.fiber),
      mealCount: summary.mealCount,
      activityCount: summary.activityCount,
      plannedCalories: summary.plannedCalories,
    },
    meals,
    activities,
    plan: plans[0] || null,
  };
}

function buildBalancingSuggestions({ expectedExtraCalories, reductionPerDay, planningWindowDays, preferences }) {
  if (expectedExtraCalories <= 0) {
    return [
      'Your planned day is within target calories. Keep your usual balanced meal split.',
      'Maintain hydration and protein consistency to support recovery and satiety.',
    ];
  }

  const suggestions = [
    `To make room for this planned intake, reduce about ${reductionPerDay} calories per day for the next ${planningWindowDays} day(s).`,
    `Keep protein near ${Math.round(preferences.proteinGoal)}g daily while reducing calorie-dense snacks.`,
    'Prefer lower-calorie swaps: grilled proteins, vegetables, and high-fiber carbs over desserts/fried sides.',
    'Use walking or light running to increase burn without extreme calorie restriction.',
  ];

  if (reductionPerDay > 450) {
    suggestions.push('Suggested deficit is high. Consider spreading balancing across more days for a safer plan.');
  }

  return suggestions;
}

async function createOrUpdatePlan(userId, payload) {
  const user = await userService.getUserOrThrow(userId);
  const preferences = normalizePreferences(user.preferences || {});

  const today = new Date();
  const eventDate = startOfDate(payload.date);
  const dayGap = Math.max(1, daysBetween(today, eventDate));
  const expectedExtraCalories = Math.max(0, Math.round(payload.plannedCalories - preferences.dailyCalorieGoal));

  const planningWindowDays = Math.min(14, dayGap);
  const reductionPerDay =
    expectedExtraCalories > 0
      ? Math.round(expectedExtraCalories / Math.max(planningWindowDays, 1))
      : 0;

  const suggestions = buildBalancingSuggestions({
    expectedExtraCalories,
    reductionPerDay,
    planningWindowDays,
    preferences,
  });

  const record = {
    id: randomUUID(),
    userId,
    date: payload.date,
    plannedCalories: payload.plannedCalories,
    expectedExtraCalories,
    reductionPerDay,
    planningWindowDays,
    suggestions,
    createdAt: new Date().toISOString(),
  };

  const saved = await calendarPlanModel.upsertPlan(userId, payload.date, record);

  return {
    plan: saved,
    recommendation: {
      message:
        expectedExtraCalories > 0
          ? `Planned +${expectedExtraCalories} kcal. Aim to reduce about ${reductionPerDay} kcal/day before the event.`
          : 'Planned intake is on target. No calorie balancing needed.',
      suggestions,
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
