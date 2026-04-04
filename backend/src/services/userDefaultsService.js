function createDefaultPreferences() {
  return {
    dailyCalorieGoal: 2200,
    proteinGoal: 140,
    carbsGoal: 220,
    fatsGoal: 70,
    fiberGoal: 30,
    preferredDiet: 'non-veg',
    macroPreference: 'balanced',
    preferredCuisine: '',
    fitnessGoal: 'maintain',
  };
}

function createDefaultContentPreferences() {
  return {
    favoriteGenres: [],
    preferredMoods: [],
    dislikedGenres: [],
    preferredLanguages: ['english'],
    typicalWatchTime: 45,
    musicGenres: [],
    musicMoods: [],
    workoutMusicPreference: 'high-energy',
    walkingMusicPreference: 'chill',
    typicalMusicContexts: ['walking', 'workout'],
  };
}

function normalizeDiet(value, fallback) {
  const normalized = String(value || fallback).toLowerCase();
  return ['veg', 'non-veg', 'vegan'].includes(normalized) ? normalized : fallback;
}

function normalizeMacroPreference(value, fallback) {
  const normalized = String(value || fallback).toLowerCase();
  return ['balanced', 'protein', 'carb'].includes(normalized) ? normalized : fallback;
}

function normalizeFitnessGoal(value, fallback) {
  const normalized = String(value || fallback).toLowerCase();
  return ['lose-weight', 'maintain', 'gain-muscle'].includes(normalized) ? normalized : fallback;
}

function numberInRange(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}

function normalizeList(value, maxSize = 15) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, maxSize);
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(Boolean)
      )
    ).slice(0, maxSize);
  }

  return [];
}

function normalizePreferences(preferences = {}) {
  const defaults = createDefaultPreferences();

  return {
    dailyCalorieGoal: numberInRange(preferences.dailyCalorieGoal, 0, 10000, defaults.dailyCalorieGoal),
    proteinGoal: numberInRange(preferences.proteinGoal, 0, 1000, defaults.proteinGoal),
    carbsGoal: numberInRange(preferences.carbsGoal, 0, 1500, defaults.carbsGoal),
    fatsGoal: numberInRange(preferences.fatsGoal, 0, 600, defaults.fatsGoal),
    fiberGoal: numberInRange(preferences.fiberGoal, 0, 300, defaults.fiberGoal),
    preferredDiet: normalizeDiet(preferences.preferredDiet, defaults.preferredDiet),
    macroPreference: normalizeMacroPreference(preferences.macroPreference, defaults.macroPreference),
    preferredCuisine: String(preferences.preferredCuisine || defaults.preferredCuisine),
    fitnessGoal: normalizeFitnessGoal(preferences.fitnessGoal, defaults.fitnessGoal),
  };
}

function normalizeContentPreferences(contentPreferences = {}) {
  const defaults = createDefaultContentPreferences();

  return {
    favoriteGenres: normalizeList(contentPreferences.favoriteGenres).length
      ? normalizeList(contentPreferences.favoriteGenres)
      : defaults.favoriteGenres,
    preferredMoods: normalizeList(contentPreferences.preferredMoods).length
      ? normalizeList(contentPreferences.preferredMoods)
      : defaults.preferredMoods,
    dislikedGenres: normalizeList(contentPreferences.dislikedGenres).length
      ? normalizeList(contentPreferences.dislikedGenres)
      : defaults.dislikedGenres,
    preferredLanguages: normalizeList(contentPreferences.preferredLanguages).length
      ? normalizeList(contentPreferences.preferredLanguages)
      : defaults.preferredLanguages,
    typicalWatchTime: numberInRange(
      contentPreferences.typicalWatchTime,
      5,
      240,
      defaults.typicalWatchTime
    ),
    musicGenres: normalizeList(contentPreferences.musicGenres).length
      ? normalizeList(contentPreferences.musicGenres)
      : defaults.musicGenres,
    musicMoods: normalizeList(contentPreferences.musicMoods).length
      ? normalizeList(contentPreferences.musicMoods)
      : defaults.musicMoods,
    workoutMusicPreference: String(
      contentPreferences.workoutMusicPreference || defaults.workoutMusicPreference
    )
      .trim()
      .toLowerCase(),
    walkingMusicPreference: String(
      contentPreferences.walkingMusicPreference || defaults.walkingMusicPreference
    )
      .trim()
      .toLowerCase(),
    typicalMusicContexts: normalizeList(contentPreferences.typicalMusicContexts).length
      ? normalizeList(contentPreferences.typicalMusicContexts)
      : defaults.typicalMusicContexts,
  };
}

module.exports = {
  createDefaultPreferences,
  createDefaultContentPreferences,
  normalizePreferences,
  normalizeContentPreferences,
};
