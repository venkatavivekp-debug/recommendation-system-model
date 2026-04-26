function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mapFitnessToFoodContext({ exerciseSummary = {}, iotContext = {}, preferences = {} } = {}) {
  const caloriesBurned = toNumber(exerciseSummary.totalCaloriesBurned, 0);
  const steps = toNumber(exerciseSummary.totalSteps ?? iotContext.steps, 0);
  const workouts = toNumber(exerciseSummary.workoutsDone, 0);
  const strengthWorkouts = toNumber(exerciseSummary.strengthWorkouts, 0);
  const activityLevel = clamp(
    toNumber(iotContext.activityLevelNormalized, steps >= 9000 || caloriesBurned >= 450 ? 0.8 : 0.45),
    0,
    1
  );

  if (caloriesBurned >= 450 || workouts >= 2 || strengthWorkouts > 0) {
    return {
      macroFocus: 'protein',
      intent: 'post_workout',
      calorieFlex: strengthWorkouts > 0 ? 220 : 180,
      reason: 'Higher activity today increases the value of protein-forward recovery meals.',
      activityLevel,
      preferredTags: ['high-protein', 'balanced'],
      avoidTags: [],
      transferConfidence: 0.86,
      sourceDomain: 'fitness',
    };
  }

  if (steps >= 9000 || activityLevel >= 0.75) {
    return {
      macroFocus: preferences.macroPreference || 'carbs',
      intent: 'active_day',
      calorieFlex: 120,
      reason: 'A more active day can support a slightly higher energy target.',
      activityLevel,
      preferredTags: ['balanced', 'quick'],
      avoidTags: [],
      transferConfidence: 0.72,
      sourceDomain: 'fitness',
    };
  }

  if (steps < 2500 && caloriesBurned < 100 && activityLevel <= 0.35) {
    return {
      macroFocus: preferences.macroPreference || 'fiber',
      intent: 'light_day',
      calorieFlex: -120,
      reason: 'Low activity today makes lighter, fiber-forward meals more useful.',
      activityLevel,
      preferredTags: ['light', 'balanced'],
      avoidTags: ['fast-food'],
      transferConfidence: 0.64,
      sourceDomain: 'fitness',
    };
  }

  return {
    macroFocus: preferences.macroPreference || 'balanced',
    intent: 'daily',
    calorieFlex: 0,
    reason: 'Daily nutrition targets are the primary signal.',
    activityLevel,
    preferredTags: ['balanced'],
    avoidTags: [],
    transferConfidence: 0.5,
    sourceDomain: 'fitness',
  };
}

function mapFoodToFitnessContext({ consumed = {}, remaining = {}, exerciseSummary = {}, preferences = {} } = {}) {
  const calorieGoal = toNumber(preferences.dailyCalorieGoal, 2200);
  const caloriesConsumed = toNumber(consumed.calories, 0);
  const caloriesRemaining = toNumber(remaining.calories, calorieGoal - caloriesConsumed);
  const caloriesBurned = toNumber(exerciseSummary.totalCaloriesBurned, 0);
  const steps = toNumber(exerciseSummary.totalSteps, 0);
  const surplus = Math.max(0, caloriesConsumed - calorieGoal - caloriesBurned);

  if (surplus >= 250 || caloriesRemaining < -200) {
    return {
      activityType: 'walking',
      intensity: 'light',
      durationMinutes: 30,
      reason: 'Food intake is above plan, so light movement is the safest next fitness suggestion.',
      transferConfidence: 0.78,
      sourceDomain: 'food',
    };
  }

  if (toNumber(remaining.protein, 0) > 25 && steps >= 6000) {
    return {
      activityType: 'strength',
      intensity: 'moderate',
      durationMinutes: 35,
      reason: 'Protein target and current activity support a moderate strength session.',
      transferConfidence: 0.68,
      sourceDomain: 'food',
    };
  }

  return {
    activityType: steps < 4000 ? 'walking' : 'mobility',
    intensity: 'light',
    durationMinutes: steps < 4000 ? 20 : 15,
    reason: 'Food and activity signals are balanced, so a light recovery option is enough.',
    transferConfidence: 0.5,
    sourceDomain: 'food',
  };
}

module.exports = {
  mapFitnessToFoodContext,
  mapFoodToFitnessContext,
};
