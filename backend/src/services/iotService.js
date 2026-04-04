const AppError = require('../utils/appError');
const userService = require('./userService');
const exerciseService = require('./exerciseService');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return 'manual';
  }
  if (['manual', 'apple-health', 'google-fit', 'fitbit', 'watch'].includes(normalized)) {
    return normalized;
  }
  return 'manual';
}

function normalizeIoTPreferences(input = {}) {
  return {
    allowWearableData: Boolean(input.allowWearableData),
    provider: normalizeProvider(input.provider),
    manualSteps: Math.max(0, toNumber(input.manualSteps, 0)),
    manualCaloriesBurned: Math.max(0, toNumber(input.manualCaloriesBurned, 0)),
    manualActivityLevel: clamp(toNumber(input.manualActivityLevel, 0.5), 0, 1),
    syncedSteps: Math.max(0, toNumber(input.syncedSteps, 0)),
    syncedCaloriesBurned: Math.max(0, toNumber(input.syncedCaloriesBurned, 0)),
    syncedActivityLevel: clamp(toNumber(input.syncedActivityLevel, 0.5), 0, 1),
    lastSyncedAt: input.lastSyncedAt || null,
  };
}

function deriveActivityLevel(steps, caloriesBurned) {
  const stepsScore = clamp(toNumber(steps, 0) / 9000, 0, 1);
  const burnScore = clamp(toNumber(caloriesBurned, 0) / 650, 0, 1);
  return Number((stepsScore * 0.6 + burnScore * 0.4).toFixed(4));
}

function resolveIoTMetrics(iotPreferences = {}, exerciseSummary = {}) {
  const normalized = normalizeIoTPreferences(iotPreferences);
  const exerciseSteps = Math.max(0, toNumber(exerciseSummary.totalSteps, 0));
  const exerciseBurned = Math.max(0, toNumber(exerciseSummary.totalCaloriesBurned, 0));

  const wearableSteps = normalized.allowWearableData ? normalized.syncedSteps : 0;
  const wearableBurned = normalized.allowWearableData ? normalized.syncedCaloriesBurned : 0;

  const steps = Math.max(exerciseSteps, normalized.manualSteps, wearableSteps);
  const caloriesBurned = Math.max(exerciseBurned, normalized.manualCaloriesBurned, wearableBurned);
  const explicitActivity =
    normalized.allowWearableData && wearableSteps > 0
      ? normalized.syncedActivityLevel
      : normalized.manualActivityLevel;
  const activityLevel = Math.max(deriveActivityLevel(steps, caloriesBurned), explicitActivity);

  return {
    steps: Number(steps.toFixed(0)),
    caloriesBurned: Number(caloriesBurned.toFixed(0)),
    activityLevelNormalized: Number(activityLevel.toFixed(4)),
    source:
      normalized.allowWearableData && (wearableSteps > 0 || wearableBurned > 0)
        ? normalized.provider
        : normalized.manualSteps > 0 || normalized.manualCaloriesBurned > 0
          ? 'manual'
          : 'exercise-estimate',
    allowWearableData: normalized.allowWearableData,
    provider: normalized.provider,
    lastSyncedAt: normalized.lastSyncedAt,
  };
}

async function getIoTContext(userId, options = {}) {
  const user = options.user || (await userService.getUserOrThrow(userId));
  const exerciseSummary =
    options.exerciseSummary || (await exerciseService.getTodayExerciseSummary(userId)).summary;

  return resolveIoTMetrics(user.iotPreferences || {}, exerciseSummary || {});
}

async function updateIoTPreferences(userId, payload = {}) {
  const user = await userService.getUserOrThrow(userId);
  const current = normalizeIoTPreferences(user.iotPreferences || {});
  const next = normalizeIoTPreferences({
    ...current,
    ...payload,
  });

  const updated = await userService.updateUser(userId, {
    iotPreferences: next,
  });

  return {
    iotPreferences: next,
    user: userService.sanitizeUser(updated),
  };
}

async function syncIoTData(userId, payload = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Invalid IoT sync payload', 400, 'VALIDATION_ERROR');
  }

  const user = await userService.getUserOrThrow(userId);
  const current = normalizeIoTPreferences(user.iotPreferences || {});

  const next = normalizeIoTPreferences({
    ...current,
    provider: payload.provider ?? current.provider,
    allowWearableData:
      payload.allowWearableData === undefined ? current.allowWearableData : payload.allowWearableData,
    syncedSteps: payload.steps ?? current.syncedSteps,
    syncedCaloriesBurned: payload.caloriesBurned ?? current.syncedCaloriesBurned,
    syncedActivityLevel:
      payload.activityLevelNormalized ?? payload.activityLevel ?? current.syncedActivityLevel,
    lastSyncedAt: new Date().toISOString(),
  });

  const updated = await userService.updateUser(userId, {
    iotPreferences: next,
  });

  return {
    iotPreferences: next,
    context: await getIoTContext(userId, { user: updated }),
  };
}

module.exports = {
  getIoTContext,
  updateIoTPreferences,
  syncIoTData,
};

