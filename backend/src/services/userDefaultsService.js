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

module.exports = {
  createDefaultPreferences,
  normalizePreferences,
};
