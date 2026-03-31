const activityModel = require('../models/activityModel');

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

async function getDashboardSummary(user) {
  const userId = user.id;

  const recentActivities = await activityModel.listActivitiesByUser(userId, 20);
  const todayActivities = await activityModel.listActivitiesByUserBetween(
    userId,
    startOfToday().toISOString(),
    endOfToday().toISOString()
  );

  const todayCaloriesConsumed = sumBy(todayActivities, (item) => Number(item.caloriesConsumed || 0));
  const todayCaloriesBurned = sumBy(todayActivities, (item) => Number(item.caloriesBurned || 0));
  const netIntake = todayCaloriesConsumed - todayCaloriesBurned;
  const dailyCalorieGoal = user.preferences?.dailyCalorieGoal || 2200;
  const goalProgressPct = Math.max(
    0,
    Math.min(160, Number(((todayCaloriesConsumed / dailyCalorieGoal) * 100).toFixed(1)))
  );
  const totalDistanceMiles = sumBy(recentActivities, (item) => Number(item.distanceMiles || 0));
  const totalCaloriesBurned = sumBy(recentActivities, (item) => Number(item.caloriesBurned || 0));

  const trendDays = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayItems = recentActivities.filter((item) => {
      const createdAt = new Date(item.createdAt);
      return createdAt >= dayStart && createdAt <= dayEnd;
    });

    trendDays.push({
      date: dayStart.toISOString().slice(0, 10),
      consumed: sumBy(dayItems, (item) => Number(item.caloriesConsumed || 0)),
      burned: sumBy(dayItems, (item) => Number(item.caloriesBurned || 0)),
    });
  }

  const recommendationSummary =
    netIntake > 0
      ? 'You are currently in a net calorie surplus. Choose lower-calorie meals or increase activity.'
      : 'Your recent activity is balancing intake well. Keep this consistency.';

  return {
    today: {
      caloriesConsumed: todayCaloriesConsumed,
      caloriesBurned: todayCaloriesBurned,
      netIntake,
      dailyCalorieGoal,
      goalProgressPct,
    },
    totals: {
      recentActivitiesCount: recentActivities.length,
      distanceMiles: Number(totalDistanceMiles.toFixed(2)),
      caloriesBurned: Number(totalCaloriesBurned.toFixed(0)),
    },
    recentFoodSelections: recentActivities.slice(0, 6).map((item) => ({
      id: item.id,
      foodName: item.foodName,
      restaurantName: item.restaurantName,
      caloriesConsumed: item.caloriesConsumed,
      createdAt: item.createdAt,
      recommendationMessage: item.recommendationMessage || '',
    })),
    recentRoutes: recentActivities.slice(0, 6).map((item) => ({
      id: item.id,
      restaurantName: item.restaurantName,
      travelMode: item.travelMode,
      distanceMiles: item.distanceMiles,
      caloriesBurned: item.caloriesBurned,
      createdAt: item.createdAt,
    })),
    recentActivities: recentActivities.slice(0, 8),
    favoriteRestaurants: user.favoriteRestaurants || [],
    favoriteFoods: user.favoriteFoods || [],
    trend: trendDays,
    recommendationSummary,
  };
}

module.exports = {
  getDashboardSummary,
};
