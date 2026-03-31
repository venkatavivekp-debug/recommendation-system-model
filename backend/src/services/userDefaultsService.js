function createDefaultPreferences() {
  return {
    dailyCalorieGoal: 2200,
    preferredDiet: 'balanced',
    macroPreference: 'balanced',
    preferredCuisine: '',
    fitnessGoal: 'maintain',
  };
}

function normalizePreferences(preferences = {}) {
  const defaults = createDefaultPreferences();

  return {
    dailyCalorieGoal:
      Number.isFinite(Number(preferences.dailyCalorieGoal)) && Number(preferences.dailyCalorieGoal) > 0
        ? Number(preferences.dailyCalorieGoal)
        : defaults.dailyCalorieGoal,
    preferredDiet: String(preferences.preferredDiet || defaults.preferredDiet).toLowerCase(),
    macroPreference: String(preferences.macroPreference || defaults.macroPreference).toLowerCase(),
    preferredCuisine: String(preferences.preferredCuisine || defaults.preferredCuisine),
    fitnessGoal: String(preferences.fitnessGoal || defaults.fitnessGoal).toLowerCase(),
  };
}

module.exports = {
  createDefaultPreferences,
  normalizePreferences,
};
