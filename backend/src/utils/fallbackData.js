function getFallbackMealRecommendations() {
  const restaurantOptions = [
    {
      name: 'Mamma\'s Boy',
      suggestedMeal: 'Grilled Chicken Breakfast Bowl',
      cuisine: 'Breakfast',
      distance: 0.47,
      rating: 4.5,
      userRatingsTotal: 2400,
      reviewSnippet: 'Reliable high-protein Athens option while live ranking warms up.',
      nutritionEstimate: { calories: 620, protein: 42, carbs: 58, fats: 19, fiber: 8 },
      route: {
        distanceMiles: 0.47,
        walking: { minutes: 9, steps: 1065, caloriesBurned: 45 },
      },
      orderLinks: {
        uberEats: 'https://www.ubereats.com/search?q=Mamma%27s%20Boy%20Athens',
        doorDash: 'https://www.doordash.com/search/store/Mamma%27s%20Boy%20Athens',
      },
      viewLink: 'https://www.google.com/search?q=Mamma%27s+Boy+Athens',
      visitLink: 'https://www.google.com/maps/dir/?api=1&destination=33.9539,-83.3655',
      recommendation: {
        reason: 'Good protein density with a short walk from the default Athens location.',
        confidencePct: 78,
        score: 78,
        topFeatures: [
          { name: 'proteinFit', contributionPct: 38 },
          { name: 'distanceFit', contributionPct: 34 },
          { name: 'preferenceFit', contributionPct: 28 },
        ],
      },
    },
    {
      name: 'Subway',
      suggestedMeal: 'Turkey and Veggie Protein Bowl',
      cuisine: 'Sandwiches',
      distance: 0.94,
      rating: 4.1,
      userRatingsTotal: 1000,
      reviewSnippet: 'Simple fallback pick with clear macro control.',
      nutritionEstimate: { calories: 430, protein: 31, carbs: 38, fats: 13, fiber: 6 },
      route: {
        distanceMiles: 0.94,
        walking: { minutes: 19, steps: 2120, caloriesBurned: 89 },
      },
      orderLinks: {
        uberEats: 'https://www.ubereats.com/search?q=Subway%20Athens%20protein%20bowl',
        doorDash: 'https://www.doordash.com/search/store/Subway%20Athens%20protein%20bowl',
      },
      viewLink: 'https://www.google.com/search?q=Subway+Athens+GA',
      visitLink: 'https://www.google.com/maps/dir/?api=1&destination=33.9598,-83.371',
      recommendation: {
        reason: 'Lower calorie option that still covers a meaningful protein gap.',
        confidencePct: 74,
        score: 74,
        topFeatures: [
          { name: 'calorieFit', contributionPct: 40 },
          { name: 'proteinFit', contributionPct: 33 },
          { name: 'convenience', contributionPct: 27 },
        ],
      },
    },
  ];

  const mealBuilder = [
    {
      id: 'fallback-meal-builder-chicken-rice',
      macroTotals: { calories: 610, protein: 46, carbs: 64, fats: 18, fiber: 8 },
      recipe: {
        recipeName: 'Chicken Rice Recovery Bowl',
        ingredients: [
          { name: 'grilled chicken', amount: '5 oz' },
          { name: 'brown rice', amount: '1 cup' },
          { name: 'mixed vegetables', amount: '1 cup' },
          { name: 'Greek yogurt sauce', amount: '2 tbsp' },
        ],
        cookingSteps: [
          'Warm rice and vegetables.',
          'Top with sliced grilled chicken.',
          'Finish with yogurt sauce and herbs.',
        ],
        whyThisFitsYourPlan: 'High protein and moderate carbs support recovery without overshooting calories.',
        youtubeLink: 'https://www.youtube.com/results?search_query=chicken+rice+protein+bowl',
      },
      rationale: 'Fallback meal-builder pick based on protein-forward daily targets.',
      grocerySuggestions: [
        {
          ingredient: 'grilled chicken',
          estimatedPrice: '$6-9',
          store: 'Walmart',
          rating: 4.4,
          buyLink: 'https://www.walmart.com/search?q=grilled%20chicken',
          viewLink: 'https://www.google.com/search?q=grilled+chicken+near+me',
        },
      ],
      allergyWarnings: [],
    },
  ];

  const recipes = [
    {
      id: 'fallback-recipe-salmon-quinoa',
      recipeName: 'Salmon Quinoa Plate',
      imageUrl: '',
      recommendationLabel: 'Balanced recipe fallback with protein, fiber, and healthy fats.',
      estimatedMacros: { calories: 575, protein: 39, carbs: 48, fats: 22, fiber: 9 },
      ingredients: [
        { name: 'salmon', amount: '5 oz' },
        { name: 'quinoa', amount: '3/4 cup' },
        { name: 'spinach', amount: '1 cup' },
        { name: 'lemon dressing', amount: '1 tbsp' },
      ],
      allergyNotes: [],
      youtubeLink: 'https://www.youtube.com/results?search_query=salmon+quinoa+plate',
      recommendation: {
        reason: 'Strong match for protein and fiber while staying within a normal dinner range.',
        confidencePct: 76,
        score: 76,
      },
    },
  ];

  return {
    restaurantOptions,
    mealBuilder,
    recipes,
  };
}

function getFallbackDashboardData() {
  const mealRecommendations = getFallbackMealRecommendations();

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
      restaurantOptions: mealRecommendations.restaurantOptions,
      mealBuilder: mealRecommendations.mealBuilder,
      recipes: mealRecommendations.recipes,
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
