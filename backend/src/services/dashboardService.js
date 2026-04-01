const activityModel = require('../models/activityModel');
const searchHistoryModel = require('../models/searchHistoryModel');
const mealService = require('./mealService');
const nutritionPlannerService = require('./nutritionPlannerService');
const calendarService = require('./calendarService');
const exerciseService = require('./exerciseService');
const userService = require('./userService');
const mlService = require('./mlService');
const evaluationService = require('./evaluationService');

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

function sumBy(list, getter) {
  return list.reduce((total, item) => total + getter(item), 0);
}

function dayRangeFromOffset(offset) {
  const start = new Date();
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function withinDay(dateText, start, end) {
  const date = new Date(dateText);
  return date >= start && date <= end;
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getDashboardSummary(user) {
  const userId = user.id;
  const todayKey = todayDateKey();

  const [
    recentActivities,
    todayActivities,
    todayMeals,
    mealHistory,
    remainingSnapshot,
    exerciseToday,
    exerciseHistory,
    recentSearches,
    allUsers,
  ] = await Promise.all([
    activityModel.listActivitiesByUser(userId, 50),
    activityModel.listActivitiesByUserBetween(
      userId,
      startOfToday().toISOString(),
      endOfToday().toISOString()
    ),
    mealService.getTodayMeals(userId),
    mealService.getMealHistory(userId, 300),
    nutritionPlannerService.getRemainingNutrition(userId),
    exerciseService.getTodayExerciseSummary(userId),
    exerciseService.getExerciseHistory(userId, 400),
    searchHistoryModel.getRecentSearchesByUser(userId, 240),
    userService.getAllUsers(),
  ]);
  const [calendarHistory, upcomingPlans] = await Promise.all([
    calendarService.getHistory(userId, 4),
    calendarService.getUpcoming(userId),
  ]);

  const todayCaloriesConsumed = Number(todayMeals.totals.calories || 0);
  const routeCaloriesBurned = sumBy(todayActivities, (item) => Number(item.caloriesBurned || 0));
  const exerciseCaloriesBurned = Number(exerciseToday.summary.totalCaloriesBurned || 0);
  const todayCaloriesBurned = routeCaloriesBurned + exerciseCaloriesBurned;
  const netIntake = todayCaloriesConsumed - todayCaloriesBurned;

  const dailyCalorieGoal = remainingSnapshot.goals.dailyCalorieGoal || user.preferences?.dailyCalorieGoal || 2200;
  const goalProgressPct = Math.max(
    0,
    Math.min(180, Number(((todayCaloriesConsumed / dailyCalorieGoal) * 100).toFixed(1)))
  );
  const todayPlan = (upcomingPlans.plans || []).find((item) => item.date === todayKey);
  const plannedCaloriesToday = Number(
    todayPlan?.plannedCalories ||
      (calendarHistory.days || []).find((item) => item.date === todayKey)?.plannedCalories ||
      dailyCalorieGoal
  );

  const totalDistanceMiles = sumBy(recentActivities, (item) => Number(item.distanceMiles || 0));
  const exerciseSessions = exerciseHistory.sessions || [];
  const totalExerciseCaloriesBurned = sumBy(exerciseSessions, (item) => Number(item.caloriesBurned || 0));
  const totalExerciseDistanceMiles = sumBy(exerciseSessions, (item) => Number(item.distanceMiles || 0));
  const totalCaloriesBurned =
    sumBy(recentActivities, (item) => Number(item.caloriesBurned || 0)) + totalExerciseCaloriesBurned;

  const allRecentMeals = mealHistory.meals || [];
  const trendDays = [];
  for (let i = 6; i >= 0; i -= 1) {
    const { start, end } = dayRangeFromOffset(i);

    const routeBurned = sumBy(
      recentActivities.filter((item) => withinDay(item.createdAt, start, end)),
      (item) => Number(item.caloriesBurned || 0)
    );
    const exerciseBurned = sumBy(
      (exerciseHistory.byDay || []).filter((item) => withinDay(`${item.date}T12:00:00.000Z`, start, end)),
      (item) => Number(item.caloriesBurned || 0)
    );

    const dayConsumed = sumBy(
      allRecentMeals.filter((item) => withinDay(item.createdAt, start, end)),
      (item) => Number(item.calories || 0)
    );

    trendDays.push({
      date: start.toISOString().slice(0, 10),
      consumed: Number(dayConsumed.toFixed(0)),
      burned: Number((routeBurned + exerciseBurned).toFixed(0)),
    });
  }

  const prediction = mlService.predictDailyCalories({
    historyDays: calendarHistory.days || [],
    dailyCalorieGoal,
    plannedCalories: plannedCaloriesToday,
    totalExerciseToday: todayCaloriesBurned,
    goalType: user.preferences?.fitnessGoal || 'maintain',
    targetDate: todayKey,
  });

  const evaluation = await evaluationService.evaluateAndStoreDailyMetrics({
    userId,
    dashboardToday: {
      caloriesConsumed: todayCaloriesConsumed,
      dailyCalorieGoal,
      proteinConsumed: Number(todayMeals.totals.protein || 0),
      carbsConsumed: Number(todayMeals.totals.carbs || 0),
      fatsConsumed: Number(todayMeals.totals.fats || 0),
      fiberConsumed: Number(todayMeals.totals.fiber || 0),
      proteinTarget: Number(remainingSnapshot.goals.proteinGoal || user.preferences?.proteinGoal || 140),
      carbsTarget: Number(remainingSnapshot.goals.carbsGoal || user.preferences?.carbsGoal || 220),
      fatsTarget: Number(remainingSnapshot.goals.fatsGoal || user.preferences?.fatsGoal || 70),
      fiberTarget: Number(remainingSnapshot.goals.fiberGoal || user.preferences?.fiberGoal || 30),
      workoutsToday: exerciseToday.summary.workoutsDone || 0,
    },
    todayMeals: todayMeals.meals || [],
    mealHistory: mealHistory.meals || [],
    recentSearches,
    prediction,
  });
  const recentMetrics = await evaluationService.getRecentMetrics(userId, 14);
  const clustering = mlService.clusterUsersByNutrition(allUsers || [], 3);
  const userClusterId = clustering.assignments?.[userId];
  const clusterLabel =
    userClusterId === undefined ? 'cluster-1' : `cluster-${Number(userClusterId) + 1}`;
  const latestEvaluation = evaluation?.snapshot || {};

  return {
    today: {
      caloriesConsumed: todayCaloriesConsumed,
      caloriesBurned: todayCaloriesBurned,
      netIntake,
      dailyCalorieGoal,
      goalProgressPct,
      proteinConsumed: Number(todayMeals.totals.protein || 0),
      carbsConsumed: Number(todayMeals.totals.carbs || 0),
      fatsConsumed: Number(todayMeals.totals.fats || 0),
      fiberConsumed: Number(todayMeals.totals.fiber || 0),
      proteinTarget: Number(remainingSnapshot.goals.proteinGoal || user.preferences?.proteinGoal || 140),
      carbsTarget: Number(remainingSnapshot.goals.carbsGoal || user.preferences?.carbsGoal || 220),
      fatsTarget: Number(remainingSnapshot.goals.fatsGoal || user.preferences?.fatsGoal || 70),
      fiberTarget: Number(remainingSnapshot.goals.fiberGoal || user.preferences?.fiberGoal || 30),
      remainingCalories: remainingSnapshot.remaining.calories,
      remainingProtein: remainingSnapshot.remaining.protein,
      remainingCarbs: remainingSnapshot.remaining.carbs,
      remainingFats: remainingSnapshot.remaining.fats,
      remainingFiber: remainingSnapshot.remaining.fiber,
      exerciseBurnedCalories: exerciseCaloriesBurned,
      routeBurnedCalories: routeCaloriesBurned,
      stepsToday: exerciseToday.summary.totalSteps || 0,
      workoutsToday: exerciseToday.summary.workoutsDone || 0,
      plannedCalories: plannedCaloriesToday,
    },
    totals: {
      recentActivitiesCount: recentActivities.length,
      distanceMiles: Number((totalDistanceMiles + totalExerciseDistanceMiles).toFixed(2)),
      caloriesBurned: Number(totalCaloriesBurned.toFixed(0)),
      mealLogsToday: todayMeals.meals.length,
      exerciseSessionsToday: exerciseToday.summary.workoutsDone || 0,
      stepsToday: exerciseToday.summary.totalSteps || 0,
    },
    recentFoodSelections: todayMeals.meals.slice(0, 8).map((item) => ({
      id: item.id,
      foodName: item.foodName,
      source: item.source,
      caloriesConsumed: item.calories,
      createdAt: item.createdAt,
    })),
    recentRoutes: recentActivities.slice(0, 8).map((item) => ({
      id: item.id,
      restaurantName: item.restaurantName,
      travelMode: item.travelMode,
      distanceMiles: item.distanceMiles,
      caloriesBurned: item.caloriesBurned,
      createdAt: item.createdAt,
    })),
    favoriteRestaurants: user.favoriteRestaurants || [],
    favoriteFoods: user.favoriteFoods || [],
    trend: trendDays,
    recommendationSummary: remainingSnapshot.recommendedForRemainingDay.message,
    recommendedForRemainingDay: remainingSnapshot.recommendedForRemainingDay,
    aiInsights: {
      predictedCalories: prediction.predictedCalories,
      predictionRmse: prediction.model?.rmse || 0,
      predictionConfidence: prediction.model?.confidence || 0,
      predictionModel: prediction.model?.modelType || 'linear_regression',
      goalAdherenceScore: latestEvaluation.goalAdherenceScore || 0,
      goalAdherencePct: Number(((latestEvaluation.goalAdherenceScore || 0) * 100).toFixed(1)),
      macroBalanceScore: latestEvaluation.macroBalanceScore || 0,
      macroBalancePct: Number(((latestEvaluation.macroBalanceScore || 0) * 100).toFixed(1)),
      recommendationAccuracy: latestEvaluation.recommendationAccuracy || 0,
      recommendationAccuracyPct: Number(((latestEvaluation.recommendationAccuracy || 0) * 100).toFixed(1)),
      engagement: latestEvaluation.engagement || {
        mealsLogged: todayMeals.meals.length,
        exercisesLogged: exerciseToday.summary.workoutsDone || 0,
        recommendationsClicked: 0,
      },
      clusterLabel,
      metricsHistory: recentMetrics.map((item) => ({
        date: item.date,
        recommendationAccuracy: item.recommendationAccuracy,
        goalAdherenceScore: item.goalAdherenceScore,
        macroBalanceScore: item.macroBalanceScore,
      })),
      transparency:
        'Estimates based on validated public datasets (USDA nutrition references and Compendium MET guidance).',
    },
    exercise: {
      today: exerciseToday.summary,
      transparency: exerciseToday.transparency,
      history: (exerciseHistory.byDay || []).slice(0, 30),
    },
    calendarSnapshot: {
      recentDays: (calendarHistory.days || []).slice(0, 10),
      upcoming: upcomingPlans.plans || [],
    },
    mealDecisionOptions: {
      eatOut: [
        { mode: 'delivery', label: 'Delivery', description: 'Order with Uber Eats or DoorDash links' },
        { mode: 'pickup', label: 'Pickup / Go There', description: 'Open route and navigation links' },
      ],
      eatIn: [
        {
          mode: 'ingredients',
          label: 'Build Meal from Ingredients',
          description: 'Macro-aligned ingredient combinations',
        },
        { mode: 'recipes', label: 'Recipe Suggestions', description: 'Home-cooking recipes for remaining macros' },
      ],
    },
  };
}

module.exports = {
  getDashboardSummary,
};
