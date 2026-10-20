function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSessionIntent(session = {}) {
  const note = String(session.preferenceNote || '').trim().slice(0, 240).toLowerCase();
  const normalizedNote = ` ${note.replace(/[^a-z0-9]+/g, ' ')} `;
  const terms = (allowed) => allowed.filter((term) => normalizedNote.includes(` ${term.replace('-', ' ')} `));
  const foodTerms = terms(['chicken', 'rice', 'pasta', 'carbs', 'carbohydrates', 'protein', 'light', 'vegetarian']);
  const musicTerms = terms(['rock', 'hip-hop', 'pop', 'electronic', 'smooth', 'energetic', 'motivational']);
  const cleanPreference = (value) => {
    const text = String(value || '').trim().slice(0, 80);
    return /^no preference$/i.test(text) ? '' : text;
  };
  const foodPreference = cleanPreference(session.foodPreference) || foodTerms.join(' ');
  const musicPreference = cleanPreference(session.musicPreference) || musicTerms.join(' ');
  const foodIntentTerms = `${foodPreference} ${foodTerms.join(' ')}`.toLowerCase();
  const foodMacroPreference = foodIntentTerms.includes('carb')
    ? 'carbs'
    : foodIntentTerms.includes('protein')
      ? 'protein'
      : '';
  const foodDiet = /vegetarian/i.test(foodIntentTerms) ? 'veg' : '';

  return {
    foodPreference,
    musicPreference,
    foodMacroPreference,
    foodDiet,
    preferenceNote: String(session.preferenceNote || '').trim().slice(0, 240),
  };
}

function buildWorkoutContext(session = {}) {
  const activityType = String(session.workoutType || session.activityType || 'workout').trim().toLowerCase();
  const exercise = Array.isArray(session.exercises) ? session.exercises[0] || {} : {};
  const intensity = String(session.intensity || exercise.intensity || 'moderate').trim().toLowerCase();
  const durationMinutes = toNumber(session.durationMinutes || exercise.durationMinutes, 0);
  const caloriesBurned = toNumber(session.caloriesBurned, 0);
  const durationClass = durationMinutes >= 45 ? 'long' : durationMinutes >= 31 ? 'medium' : 'short';
  let sessionClass = 'moderate_session';

  if (['running', 'run', 'cardio', 'cycling', 'swimming'].includes(activityType) && durationMinutes >= 45) {
    sessionClass = 'long_endurance';
  } else if (['strength', 'weights', 'lifting'].includes(activityType)) {
    sessionClass = 'strength_recovery';
  } else if (['walking', 'walk'].includes(activityType) || intensity === 'light') {
    sessionClass = 'light_recovery';
  } else if (['intense', 'high', 'vigorous'].includes(intensity) && durationMinutes > 0 && durationMinutes <= 30) {
    sessionClass = 'short_intense';
  }

  return {
    activityType,
    sourceEventId: session.id || null,
    sourceTimestamp: session.createdAt || session.sourceTimestamp || null,
    intensity,
    durationMinutes,
    durationClass,
    caloriesBurned,
    steps: toNumber(session.steps, 0),
    sessionClass,
    ...normalizeSessionIntent(session),
  };
}

const WORKOUT_CONTEXT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function latestWorkoutContext(sessions = [], now = Date.now()) {
  const latest = (Array.isArray(sessions) ? sessions : []).find((session) => {
    const timestamp = new Date(session?.createdAt || 0).getTime();
    return Number.isFinite(timestamp) && timestamp <= now && timestamp >= now - WORKOUT_CONTEXT_MAX_AGE_MS;
  });
  return latest ? buildWorkoutContext(latest) : null;
}

function mapFitnessToFoodContext({ exerciseSummary = {}, iotContext = {}, preferences = {} } = {}) {
  const workout = exerciseSummary.latestWorkout || null;
  const caloriesBurned = toNumber(exerciseSummary.totalCaloriesBurned, 0);
  const steps = toNumber(exerciseSummary.totalSteps ?? iotContext.steps, 0);
  const workouts = toNumber(exerciseSummary.workoutsDone, 0);
  const strengthWorkouts = toNumber(exerciseSummary.strengthWorkouts, 0);
  const activityLevel = clamp(
    toNumber(iotContext.activityLevelNormalized, steps >= 9000 || caloriesBurned >= 450 ? 0.8 : 0.45),
    0,
    1
  );

  if (workout?.sessionClass === 'long_endurance') {
    return {
      macroFocus: 'carbs',
      intent: 'post_workout',
      calorieFlex: 150,
      reason: 'Your longer run increases the priority of carbohydrate-focused recovery.',
      activityLevel,
      preferredTags: ['carb-forward', 'balanced', 'recovery'],
      avoidTags: [],
      transferConfidence: 0.88,
      sourceDomain: 'fitness',
      workoutContext: workout,
    };
  }

  if (workout?.sessionClass === 'short_intense') {
    return {
      macroFocus: preferences.macroPreference === 'protein' ? 'protein' : 'balanced',
      intent: 'post_workout',
      calorieFlex: 80,
      reason: 'Your short, intense session favors balanced energy support rather than a large recovery meal.',
      activityLevel,
      preferredTags: ['balanced', 'carb-forward', 'recovery'],
      avoidTags: [],
      transferConfidence: 0.82,
      sourceDomain: 'fitness',
      workoutContext: workout,
    };
  }

  if (workout?.sessionClass === 'strength_recovery') {
    return {
      macroFocus: preferences.macroPreference === 'carbs' ? 'balanced' : 'protein',
      intent: 'post_workout',
      calorieFlex: 180,
      reason: 'Your strength session raises the value of protein-forward, balanced recovery meals.',
      activityLevel,
      preferredTags: ['high-protein', 'balanced', 'recovery'],
      avoidTags: [],
      transferConfidence: 0.86,
      sourceDomain: 'fitness',
      workoutContext: workout,
    };
  }

  if (workout?.sessionClass === 'light_recovery') {
    return {
      macroFocus: preferences.macroPreference || 'balanced',
      intent: 'active_day',
      calorieFlex: 0,
      reason: 'Your light activity fits a balanced meal without a large calorie adjustment.',
      activityLevel,
      preferredTags: ['light', 'balanced'],
      avoidTags: [],
      transferConfidence: 0.76,
      sourceDomain: 'fitness',
      workoutContext: workout,
    };
  }

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

function mapFoodToFitnessRules({ consumed = {}, remaining = {}, exerciseSummary = {}, preferences = {} } = {}) {
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

function contextProvenance(sourceDomain, targetDomain, context, reason, values) {
  if (!context || !context.sourceTimestamp) return [];
  return [{ sourceDomain, targetDomain, sourceEvent: context.sourceEventId || 'explicit_session_context',
    sourceTimestamp: context.sourceTimestamp, sourceContext: context, reason, derivedValues: values }];
}

function mapFoodToFitnessContext(input = {}) {
  const result = mapFoodToFitnessRules(input);
  return { ...result, crossDomainSignals: contextProvenance('food', 'fitness', input.sourceContext,
    result.reason, { activityType: result.activityType, durationMinutes: result.durationMinutes }) };
}

module.exports = {
  normalizeSessionIntent,
  buildWorkoutContext,
  latestWorkoutContext,
  mapFitnessToFoodContext,
  mapFoodToFitnessContext,
  contextProvenance,
};
