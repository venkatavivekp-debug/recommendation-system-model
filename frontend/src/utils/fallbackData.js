export function getFallbackDashboard() {
  const mealRecommendations = {
    restaurantOptions: [
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
    ],
    mealBuilder: [
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
    ],
    recipes: [
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
    ],
  }
  const fallbackMovies = [
    {
      id: 'fallback-movie-interstellar',
      type: 'movie',
      title: 'Interstellar',
      genre: 'sci-fi',
      reason: 'Fallback pick while live content services reconnect.',
      confidencePct: 80,
      confidence: 0.8,
      sourceUrl: 'https://www.google.com/search?q=Interstellar+movie',
      topFactors: [
        { name: 'contextFit', contributionPct: 40 },
        { name: 'timeOfDayFit', contributionPct: 35 },
        { name: 'historySimilarity', contributionPct: 25 },
      ],
    },
    {
      id: 'fallback-movie-martian',
      type: 'movie',
      title: 'The Martian',
      genre: 'sci-fi',
      reason: 'Fallback pick while live content services reconnect.',
      confidencePct: 76,
      confidence: 0.76,
      sourceUrl: 'https://www.google.com/search?q=The+Martian+movie',
      topFactors: [
        { name: 'contextFit', contributionPct: 42 },
        { name: 'genreMatch', contributionPct: 33 },
        { name: 'durationFit', contributionPct: 25 },
      ],
    },
  ]
  const fallbackSongs = [
    {
      id: 'fallback-song-blinding-lights',
      type: 'song',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      genre: 'pop',
      reason: 'Fallback track while live content services reconnect.',
      confidencePct: 82,
      confidence: 0.82,
      sourceUrl: 'https://www.google.com/search?q=Blinding+Lights+song',
      topFactors: [
        { name: 'activityFit', contributionPct: 38 },
        { name: 'moodMatch', contributionPct: 34 },
        { name: 'timeOfDayFit', contributionPct: 28 },
      ],
    },
    {
      id: 'fallback-song-eye-of-the-tiger',
      type: 'song',
      title: 'Eye of the Tiger',
      artist: 'Survivor',
      genre: 'rock',
      reason: 'Fallback track while live content services reconnect.',
      confidencePct: 78,
      confidence: 0.78,
      sourceUrl: 'https://www.google.com/search?q=Eye+of+the+Tiger+song',
      topFactors: [
        { name: 'activityFit', contributionPct: 44 },
        { name: 'moodMatch', contributionPct: 32 },
        { name: 'historySimilarity', contributionPct: 24 },
      ],
    },
  ]

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
      message: 'Fallback recommendations active while live services reconnect.',
      restaurantOptions: mealRecommendations.restaurantOptions,
      mealBuilder: mealRecommendations.mealBuilder,
      recipes: mealRecommendations.recipes,
    },
    contentRecommendations: {
      whileEating: { recommendations: fallbackMovies },
      walkingMusic: { recommendations: fallbackSongs },
      workoutMusic: { recommendations: fallbackSongs },
    },
    contentFeed: {
      movies: fallbackMovies,
      songs: fallbackSongs,
    },
    aiInsights: {
      bestNextAction: 'Choose a high-protein meal for your next intake.',
      whyThisWasRecommended: 'Fallback mode is using your default nutrition profile.',
      behaviorInsight: 'You usually keep steady calorie intake during weekdays.',
      anomalyInsight: 'No anomaly detected in fallback mode.',
      confidencePct: 78,
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
    calendarSnapshot: {
      recentDays: [],
      upcoming: [],
    },
  }
}

export function getFallbackContentFeed() {
  const fallback = getFallbackDashboard()
  return {
    movies: fallback.contentFeed?.movies || [],
    songs: fallback.contentFeed?.songs || [],
  }
}
