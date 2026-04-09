function getFallbackDashboardData() {
  return {
    summary: {
      calories: 1800,
      protein: 120,
      steps: 6000,
    },
    recommendations: {
      food: ['Grilled Chicken Bowl', 'Greek Yogurt + Oats', 'Salmon Rice Plate'],
      movies: ['Interstellar', 'The Martian', 'Moneyball'],
      songs: ['Blinding Lights', 'Eye of the Tiger', 'On Top of the World'],
    },
    insights: [
      {
        type: 'fallback',
        message: 'Fallback mode is active while live services reconnect.',
      },
    ],
    today: {
      caloriesConsumed: 1800,
      caloriesBurned: 420,
      netIntake: 1380,
      proteinConsumed: 120,
      carbsConsumed: 180,
      fatsConsumed: 55,
      fiberConsumed: 26,
      proteinTarget: 140,
      carbsTarget: 220,
      fatsTarget: 70,
      fiberTarget: 30,
      remainingCalories: 400,
      remainingProtein: 20,
      remainingCarbs: 40,
      remainingFats: 15,
      remainingFiber: 4,
      workoutsToday: 1,
      stepsToday: 6000,
    },
    recommendedForRemainingDay: {
      message: 'Fallback recommendations active while API recovers.',
      restaurantOptions: [],
      mealBuilder: [],
      recipes: [],
    },
    contentRecommendations: {
      whileEating: { recommendations: [] },
      walkingMusic: { recommendations: [] },
      workoutMusic: { recommendations: [] },
    },
    aiInsights: {
      bestNextAction: 'Choose a high-protein option for your next meal.',
      whyThisWasRecommended: 'Fallback mode is using baseline profile logic.',
      behaviorInsight: 'Behavior trends are unavailable in fallback mode.',
      anomalyInsight: 'No anomaly check in fallback mode.',
      confidencePct: 75,
    },
  };
}

function getGenericFallbackData(path = '') {
  if (String(path || '').includes('/api/dashboard')) {
    return getFallbackDashboardData();
  }

  return {
    message: 'Fallback response',
    items: [],
  };
}

module.exports = {
  getFallbackDashboardData,
  getGenericFallbackData,
};
