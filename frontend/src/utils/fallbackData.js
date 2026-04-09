export function getFallbackDashboard() {
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
      restaurantOptions: [],
      mealBuilder: [],
      recipes: [],
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
