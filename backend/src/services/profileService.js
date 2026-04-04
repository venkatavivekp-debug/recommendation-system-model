const AppError = require('../utils/appError');
const { normalizeAllergies } = require('../utils/allergy');
const userService = require('./userService');
const emailService = require('./emailService');
const {
  normalizePreferences,
  normalizeContentPreferences,
} = require('./userDefaultsService');

const PREFERENCE_NUMBER_FIELDS = {
  dailyCalories: 'dailyCalorieGoal',
  proteinTarget: 'proteinGoal',
  carbTarget: 'carbsGoal',
  fatTarget: 'fatsGoal',
  fiberTarget: 'fiberGoal',
  dailyCalorieGoal: 'dailyCalorieGoal',
  proteinGoal: 'proteinGoal',
  carbsGoal: 'carbsGoal',
  fatsGoal: 'fatsGoal',
  fiberGoal: 'fiberGoal',
};

const PREFERENCE_TEXT_FIELDS = new Set([
  'preferredDiet',
  'preferredCuisine',
  'fitnessGoal',
  'macroPreference',
]);

const TOP_LEVEL_STRING_FIELDS = new Set(['firstName', 'lastName', 'address']);
const TOP_LEVEL_BOOLEAN_FIELDS = new Set(['promotionOptIn']);
const TOP_LEVEL_ARRAY_FIELDS = new Set([
  'favorites',
  'favoriteFoods',
  'favoriteRestaurants',
  'savedRecipeIds',
  'allergies',
]);

const CONTENT_ARRAY_FIELDS = {
  favoriteGenres: 'favoriteGenres',
  preferredMoods: 'preferredMoods',
  dislikedGenres: 'dislikedGenres',
  preferredLanguages: 'preferredLanguages',
  musicGenres: 'musicGenres',
  musicMoods: 'musicMoods',
  typicalMusicContexts: 'typicalMusicContexts',
};

const CONTENT_TEXT_FIELDS = {
  workoutMusicPreference: 'workoutMusicPreference',
  walkingMusicPreference: 'walkingMusicPreference',
};

const CONTENT_NUMBER_FIELDS = {
  typicalWatchTime: 'typicalWatchTime',
};

const ALLOWED_PROFILE_FIELDS = new Set([
  ...Object.keys(PREFERENCE_NUMBER_FIELDS),
  ...Array.from(PREFERENCE_TEXT_FIELDS),
  ...Array.from(TOP_LEVEL_STRING_FIELDS),
  ...Array.from(TOP_LEVEL_BOOLEAN_FIELDS),
  ...Array.from(TOP_LEVEL_ARRAY_FIELDS),
  ...Object.keys(CONTENT_ARRAY_FIELDS),
  ...Object.keys(CONTENT_TEXT_FIELDS),
  ...Object.keys(CONTENT_NUMBER_FIELDS),
  'email',
]);

function parseOptionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(`${fieldName} must be a valid number`, 400, 'VALIDATION_ERROR');
  }
  if (parsed < 0) {
    throw new AppError(`${fieldName} cannot be negative`, 400, 'VALIDATION_ERROR');
  }

  return parsed;
}

function normalizePreferredDiet(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  if (['veg', 'vegetarian'].includes(normalized)) {
    return 'veg';
  }
  if (['non-veg', 'nonveg', 'non vegetarian'].includes(normalized)) {
    return 'non-veg';
  }
  if (normalized === 'vegan') {
    return 'vegan';
  }

  throw new AppError('preferredDiet must be veg, non-veg, or vegan', 400, 'VALIDATION_ERROR');
}

function normalizeMacroPreference(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  if (['balanced', 'protein', 'carb'].includes(normalized)) {
    return normalized;
  }

  throw new AppError('macroPreference must be balanced, protein, or carb', 400, 'VALIDATION_ERROR');
}

function normalizeFitnessGoal(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  if (['lose-weight', 'maintain', 'gain-muscle'].includes(normalized)) {
    return normalized;
  }
  if (['lose weight', 'loss'].includes(normalized)) {
    return 'lose-weight';
  }
  if (['gain muscle', 'gain'].includes(normalized)) {
    return 'gain-muscle';
  }

  throw new AppError(
    'fitnessGoal must be lose-weight, maintain, or gain-muscle',
    400,
    'VALIDATION_ERROR'
  );
}

function normalizeStringArray(list, fieldName) {
  if (!Array.isArray(list)) {
    throw new AppError(`${fieldName} must be an array`, 400, 'VALIDATION_ERROR');
  }

  return Array.from(
    new Set(
      list
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

function normalizeStringListInput(value, fieldName) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }

  throw new AppError(`${fieldName} must be an array or comma-separated string`, 400, 'VALIDATION_ERROR');
}

function getChangedFields(previousUser, updatePayload) {
  const changed = [];
  Object.keys(updatePayload).forEach((field) => {
    if (JSON.stringify(previousUser[field]) !== JSON.stringify(updatePayload[field])) {
      changed.push(field);
    }
  });

  return changed;
}

function buildProfileUpdatePayload(existingUser, updates) {
  const payload = {};
  const nextPreferences = { ...(existingUser.preferences || {}) };
  const nextContentPreferences = { ...(existingUser.contentPreferences || {}) };
  let preferencesUpdated = false;
  let contentPreferencesUpdated = false;

  Object.entries(PREFERENCE_NUMBER_FIELDS).forEach(([inputField, preferenceField]) => {
    if (!Object.prototype.hasOwnProperty.call(updates, inputField)) {
      return;
    }

    const parsed = parseOptionalNumber(updates[inputField], inputField);
    if (parsed === undefined) {
      return;
    }

    nextPreferences[preferenceField] = parsed;
    preferencesUpdated = true;
  });

  if (Object.prototype.hasOwnProperty.call(updates, 'preferredDiet')) {
    const value = normalizePreferredDiet(updates.preferredDiet);
    if (value) {
      nextPreferences.preferredDiet = value;
      preferencesUpdated = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'preferredCuisine')) {
    nextPreferences.preferredCuisine = String(updates.preferredCuisine || '').trim();
    preferencesUpdated = true;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'fitnessGoal')) {
    const value = normalizeFitnessGoal(updates.fitnessGoal);
    if (value) {
      nextPreferences.fitnessGoal = value;
      preferencesUpdated = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'macroPreference')) {
    const value = normalizeMacroPreference(updates.macroPreference);
    if (value) {
      nextPreferences.macroPreference = value;
      preferencesUpdated = true;
    }
  }

  if (preferencesUpdated) {
    payload.preferences = normalizePreferences(nextPreferences);
  }

  TOP_LEVEL_STRING_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      return;
    }

    const raw = updates[field];
    if (raw === undefined) {
      return;
    }

    const trimmed = String(raw || '').trim();
    payload[field] = field === 'address' ? trimmed || null : trimmed;
  });

  TOP_LEVEL_BOOLEAN_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      return;
    }

    payload[field] = Boolean(updates[field]);
  });

  TOP_LEVEL_ARRAY_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) {
      return;
    }

    if (field === 'allergies') {
      if (!Array.isArray(updates.allergies)) {
        throw new AppError('allergies must be an array', 400, 'VALIDATION_ERROR');
      }
      payload.allergies = normalizeAllergies(updates.allergies);
      return;
    }

    payload[field] = normalizeStringArray(updates[field], field);
  });

  Object.entries(CONTENT_ARRAY_FIELDS).forEach(([inputField, outputField]) => {
    if (!Object.prototype.hasOwnProperty.call(updates, inputField)) {
      return;
    }

    const value = updates[inputField];
    if (value === undefined) {
      return;
    }

    nextContentPreferences[outputField] = normalizeStringListInput(value, inputField);
    contentPreferencesUpdated = true;
  });

  Object.entries(CONTENT_TEXT_FIELDS).forEach(([inputField, outputField]) => {
    if (!Object.prototype.hasOwnProperty.call(updates, inputField)) {
      return;
    }

    const value = updates[inputField];
    if (value === undefined) {
      return;
    }

    nextContentPreferences[outputField] = String(value || '').trim().toLowerCase();
    contentPreferencesUpdated = true;
  });

  Object.entries(CONTENT_NUMBER_FIELDS).forEach(([inputField, outputField]) => {
    if (!Object.prototype.hasOwnProperty.call(updates, inputField)) {
      return;
    }

    const parsed = parseOptionalNumber(updates[inputField], inputField);
    if (parsed === undefined) {
      return;
    }

    nextContentPreferences[outputField] = parsed;
    contentPreferencesUpdated = true;
  });

  if (contentPreferencesUpdated) {
    payload.contentPreferences = normalizeContentPreferences(nextContentPreferences);
  }

  return payload;
}

async function getMyProfile(userId) {
  const user = await userService.getUserOrThrow(userId);
  return userService.sanitizeUser(user);
}

async function updateMyProfile(userId, updates = {}) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new AppError('Profile update payload must be an object', 400, 'VALIDATION_ERROR');
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
    throw new AppError('Email cannot be edited', 400, 'VALIDATION_ERROR');
  }

  const unknownFields = Object.keys(updates).filter((field) => !ALLOWED_PROFILE_FIELDS.has(field));
  if (unknownFields.length) {
    throw new AppError('Request contains unsupported fields', 400, 'VALIDATION_ERROR', {
      unknownFields,
    });
  }

  const user = await userService.getUserOrThrow(userId);
  const updatePayload = buildProfileUpdatePayload(user, updates);
  const changedFields = getChangedFields(user, updatePayload);

  if (!changedFields.length) {
    return userService.sanitizeUser(user);
  }

  const updatedUser = await userService.updateUser(userId, updatePayload);
  emailService.sendProfileUpdatedEmail(updatedUser.email, changedFields);
  return userService.sanitizeUser(updatedUser);
}

module.exports = {
  getMyProfile,
  updateMyProfile,
};
