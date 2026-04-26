const activityModel = require('../models/activityModel');
const searchHistoryModel = require('../models/searchHistoryModel');
const mealService = require('./mealService');
const nutritionPlannerService = require('./nutritionPlannerService');
const calendarService = require('./calendarService');
const exerciseService = require('./exerciseService');
const mlService = require('./mlService');
const evaluationService = require('./evaluationService');
const contentRecommendationService = require('./contentRecommendationService');
const behaviorModelService = require('./behaviorModelService');
const anomalyDetectionService = require('./anomalyDetectionService');
const iotService = require('./iotService');
const logger = require('../utils/logger');

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

function dominantMacroFocus(remaining = {}) {
  const entries = [
    { key: 'protein', value: Number(remaining.protein || 0) },
    { key: 'carbs', value: Number(remaining.carbs || 0) },
    { key: 'fats', value: Number(remaining.fats || 0) },
    { key: 'fiber', value: Number(remaining.fiber || 0) },
  ].sort((a, b) => b.value - a.value);

  return entries[0]?.key || 'protein';
}

function buildDefaultToday(user = {}) {
  const preferences = user.preferences || {};
  const dailyCalorieGoal = Number(preferences.dailyCalorieGoal || 2200);
  const proteinTarget = Number(preferences.proteinGoal || 140);
  const carbsTarget = Number(preferences.carbsGoal || 220);
  const fatsTarget = Number(preferences.fatsGoal || 70);
  const fiberTarget = Number(preferences.fiberGoal || 30);

  return {
    caloriesConsumed: 0,
    caloriesBurned: 0,
    netIntake: 0,
    dailyCalorieGoal,
    goalProgressPct: 0,
    proteinConsumed: 0,
    carbsConsumed: 0,
    fatsConsumed: 0,
    fiberConsumed: 0,
    proteinTarget,
    carbsTarget,
    fatsTarget,
    fiberTarget,
    remainingCalories: dailyCalorieGoal,
    remainingProtein: proteinTarget,
    remainingCarbs: carbsTarget,
    remainingFats: fatsTarget,
    remainingFiber: fiberTarget,
    exerciseBurnedCalories: 0,
    routeBurnedCalories: 0,
    stepsToday: 0,
    workoutsToday: 0,
    plannedCalories: dailyCalorieGoal,
    activityLevel: 0.5,
  };
}

function buildFallbackDashboardSummary(user = {}, error = null) {
  const today = buildDefaultToday(user);
  const fallback = {
    today,
    totals: {
      recentActivitiesCount: 0,
      distanceMiles: 0,
      caloriesBurned: 0,
      mealLogsToday: 0,
      exerciseSessionsToday: 0,
      stepsToday: 0,
    },
    recentFoodSelections: [],
    recentRoutes: [],
    favoriteRestaurants: user.favoriteRestaurants || [],
    favoriteFoods: user.favoriteFoods || [],
    trend: [],
    recommendationSummary: 'Dashboard fallback active while data services recover.',
    recommendedForRemainingDay: {
      message: 'No recommendations available yet. Try refreshing in a moment.',
      restaurantOptions: [],
      mealBuilder: [],
      recipes: [],
    },
    contentRecommendations: {
      whileEating: { contextType: 'eat_in', recommendations: [] },
      walkingMusic: { contextType: 'walking', recommendations: [] },
      workoutMusic: { contextType: 'workout', recommendations: [] },
    },
    aiInsights: {
      bestNextAction: 'Log your next meal to personalize recommendations.',
      whyThisWasRecommended: 'Fallback summary is active due to a temporary data issue.',
      behaviorInsight: 'Continue logging meals and activity to unlock behavior trends.',
      anomalyInsight: 'No anomaly check available in fallback mode.',
      anomalyCheck: 'No anomaly check available in fallback mode.',
      confidence: 0.5,
      confidencePct: 50,
      predictedNextBestAction: 'Balanced meal option',
      recommendationReason: 'Fallback mode',
      conciseExplanation: 'Fallback summary is active.',
    },
    modelPerformance: {
      current: null,
      recommendationModel: null,
      trend: [],
    },
    modelAnalysis: {
      behaviorDriftScore: 0,
      behaviorNotes: [],
      anomalyCount: 0,
      anomalyTopMessage: null,
      accuracyTrend: [],
      featureImportanceTrend: [],
      acceptanceTrend: null,
    },
    exercise: {
      today: {
        totalCaloriesBurned: 0,
        workoutsDone: 0,
        totalDurationMinutes: 0,
        totalSteps: 0,
      },
      transparency: {
        note: 'Exercise estimates unavailable in fallback mode.',
      },
      history: [],
    },
    calendarSnapshot: {
      recentDays: [],
      upcoming: [],
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
    summary: today,
    recommendations: [],
    insights: [
      {
        type: 'fallback',
        message: error ? `Dashboard fallback due to error: ${error.message}` : 'Dashboard fallback active.',
      },
    ],
  };

  return fallback;
}

async function getDashboardSummary(user) {
  try {
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
    exerciseService.getTodayExerciseSummary(userId, { includeContentSuggestions: false }),
    exerciseService.getExerciseHistory(userId, 400),
    searchHistoryModel.getRecentSearchesByUser(userId, 240),
  ]);
  const [calendarHistory, upcomingPlans] = await Promise.all([
    calendarService.getHistory(userId, 4),
    calendarService.getUpcoming(userId),
  ]);
  const iotContext = await iotService.getIoTContext(userId, {
    user,
    exerciseSummary: exerciseToday.summary,
  });

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
    user,
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
    exerciseHistory: exerciseHistory.sessions || [],
    recentSearches,
    prediction,
    iotContext,
  });
  const latestEvaluation = evaluation?.snapshot || {};
  const recentModelMetrics = await evaluationService.getRecentMetrics(userId, 14);
  const topRestaurantRecommendation =
    (remainingSnapshot.recommendedForRemainingDay.restaurantOptions || [])[0] || null;
  const topRecipeRecommendation =
    (remainingSnapshot.recommendedForRemainingDay.recipes || [])[0] || null;
  const likelyChoiceName =
    topRestaurantRecommendation?.name ||
    topRestaurantRecommendation?.foodName ||
    topRecipeRecommendation?.recipeName ||
    topRecipeRecommendation?.foodName ||
    'Balanced next meal';
  const likelyChoiceType = topRestaurantRecommendation ? 'restaurant' : topRecipeRecommendation ? 'recipe' : 'food';
  const likelyChoiceReason =
    topRestaurantRecommendation?.recommendation?.reason ||
    topRestaurantRecommendation?.recommendation?.message ||
    topRecipeRecommendation?.recommendation?.reason ||
    topRecipeRecommendation?.recommendation?.message ||
    remainingSnapshot.recommendedForRemainingDay.message ||
    'Strong overall match for your current nutrition targets.';
  const winnerScore = Number(
    topRestaurantRecommendation?.recommendation?.confidence ??
      topRecipeRecommendation?.recommendation?.confidence ??
      (topRestaurantRecommendation?.recommendation?.score ?? topRecipeRecommendation?.recommendation?.score ?? 74) / 100
  );
  const confidence = Math.max(0.45, Math.min(0.95, winnerScore));
  const remainingMacro = dominantMacroFocus(remainingSnapshot.remaining);
  const behaviorProfile = await behaviorModelService.buildBehaviorProfile(userId, {
    user,
    meals: mealHistory.meals || [],
    exerciseSessions: exerciseHistory.sessions || [],
    lookbackDays: 45,
  });
  const anomalySummary = await anomalyDetectionService.detectUserAnomalies({
    today: {
      userId,
      caloriesConsumed: todayCaloriesConsumed,
      caloriesBurned: todayCaloriesBurned,
      carbs: Number(todayMeals.totals.carbs || 0),
    },
    meals: mealHistory.meals || [],
    exerciseSessions: exerciseHistory.sessions || [],
    iotContext,
  });

  let contentRecommendations = {};
  try {
    contentRecommendations = await contentRecommendationService.getContextBundle(
      user,
      [
        {
          key: 'whileEating',
          contextType: topRestaurantRecommendation ? 'eat_out' : 'eat_in',
          sessionMinutes: 45,
          limit: 3,
        },
        {
          key: 'walkingMusic',
          contextType: 'walking',
          etaMinutes: Number(topRestaurantRecommendation?.route?.walking?.minutes || 24),
          activityType: 'walking',
          limit: 3,
        },
        {
          key: 'workoutMusic',
          contextType: 'workout',
          durationMinutes: Number(exerciseToday.summary.totalDurationMinutes || 35),
          activityType: exerciseHistory.sessions?.[0]?.workoutType || 'workout',
          limit: 3,
        },
      ],
      { logImpressions: false }
    );
  } catch (error) {
    contentRecommendations = {
      whileEating: {
        contextType: 'eat_in',
        recommendations: [],
        fallbackMessage: 'Content recommendations will appear after more activity signals.',
      },
      walkingMusic: {
        contextType: 'walking',
        recommendations: [],
        fallbackMessage: 'Music suggestions will appear once route context is available.',
      },
      workoutMusic: {
        contextType: 'workout',
        recommendations: [],
        fallbackMessage: 'Workout music suggestions will appear once exercise context is available.',
      },
    };
  }

    const response = {
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
      activityLevel: Number(iotContext.activityLevelNormalized || 0),
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
    contentRecommendations,
    aiInsights: {
      bestNextAction: `Choose ${likelyChoiceName}`,
      whyThisWasRecommended: likelyChoiceReason,
      behaviorInsight: behaviorProfile.primaryInsight,
      anomalyInsight: anomalySummary.topMessage || 'No unusual pattern detected today.',
      anomalyCheck: anomalySummary.topMessage || 'No unusual pattern detected today.',
      confidence,
      confidencePct: Number((confidence * 100).toFixed(1)),
      // Backward-compatible aliases for existing frontend references.
      predictedNextBestAction: `Best next ${likelyChoiceType}: ${likelyChoiceName}`,
      recommendationReason: likelyChoiceReason,
      conciseExplanation: `${likelyChoiceName} is the strongest fit for your current ${remainingMacro} focus.`,
    },
    modelPerformance: {
      current: latestEvaluation.modelPerformance || null,
      recommendationModel: latestEvaluation.recommendationModel || null,
      trend: (recentModelMetrics || [])
        .slice()
        .reverse()
        .map((metric) => ({
          date: metric.date,
          accuracy: Number(metric.modelPerformance?.accuracy || 0),
          rankingSuccessRate: Number(metric.modelPerformance?.rankingSuccessRate || 0),
        })),
    },
    modelAnalysis: {
      behaviorDriftScore: Number(behaviorProfile.behaviorDriftScore || 0),
      behaviorNotes: behaviorProfile.notes || [],
      anomalyCount: anomalySummary.count || 0,
      anomalyTopMessage: anomalySummary.topMessage || null,
      accuracyTrend: (recentModelMetrics || [])
        .slice()
        .reverse()
        .map((metric) => ({
          date: metric.date,
          accuracy: Number(metric.modelPerformance?.accuracy || 0),
          topPickChosenRate: Number(metric.modelPerformance?.topRecommendationChosenRate || 0),
        })),
      featureImportanceTrend: latestEvaluation.featureImportanceTrend || [],
      acceptanceTrend: latestEvaluation.acceptanceTrend || null,
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
    summary: {
      caloriesConsumed: todayCaloriesConsumed,
      caloriesBurned: todayCaloriesBurned,
      netCalories: netIntake,
      protein: Number(todayMeals.totals.protein || 0),
      carbs: Number(todayMeals.totals.carbs || 0),
      fats: Number(todayMeals.totals.fats || 0),
      fiber: Number(todayMeals.totals.fiber || 0),
    },
    recommendations: remainingSnapshot.recommendedForRemainingDay?.restaurantOptions || [],
    insights: [
      {
        type: 'next-action',
        message: `Choose ${likelyChoiceName}`,
      },
      {
        type: 'reason',
        message: likelyChoiceReason,
      },
    ],
  };
    return response;
  } catch (error) {
    logger.error('Failed to build dashboard summary', {
      userId: user?.id || null,
      message: error.message,
      stack: error.stack,
    });
    return buildFallbackDashboardSummary(user, error);
  }
}

module.exports = {
  getDashboardSummary,
};
