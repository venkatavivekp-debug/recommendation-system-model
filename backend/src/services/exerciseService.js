const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const { isToday, isPast } = require('../utils/dateLock');
const { withTimeout } = require('../utils/timeout');
const exerciseSessionModel = require('../models/exerciseSessionModel');
const userService = require('./userService');

let contentRecommendationService = null;

function getContentRecommendationService() {
  if (!contentRecommendationService) {
    // Lazily require to avoid circular init with recommendation ranking pipeline.
    // recommendationService -> iotService -> exerciseService -> contentRecommendationService
    contentRecommendationService = require('./contentRecommendationService');
  }
  return contentRecommendationService;
}

const MET_BY_EXERCISE = {
  walking: 3.5,
  running: 9.8,
  jog: 8.0,
  cardio: 8.5,
  'chest press': 4.8,
  'bench press': 5.0,
  squats: 5.2,
  'push-ups': 7.2,
  pushups: 7.2,
  'pull-ups': 8.0,
  pullups: 8.0,
  dips: 7.0,
  'strength training': 4.5,
};

const STRENGTH_EXERCISES = new Set([
  'chest press',
  'bench press',
  'push-ups',
  'pushups',
  'pull-ups',
  'pullups',
  'squats',
  'dips',
]);

const BODYWEIGHT_EXERCISES = new Set(['push-ups', 'pushups', 'pull-ups', 'pullups', 'dips']);

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 1) {
  return Number(Number(value || 0).toFixed(decimals));
}

function assertDayEditable(dateValue) {
  if (isPast(dateValue)) {
    throw new AppError('Past data cannot be modified', 400, 'DATA_LOCKED');
  }

  if (!isToday(dateValue)) {
    throw new AppError('Only today data can be modified', 400, 'DATA_LOCKED');
  }
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function intensityMultiplier(intensity) {
  const value = normalizeText(intensity);

  if (value === 'light') {
    return 0.85;
  }
  if (value === 'intense' || value === 'high') {
    return 1.2;
  }

  return 1;
}

function estimateMet(exerciseName, workoutType, intensity) {
  const normalizedName = normalizeText(exerciseName);
  const normalizedWorkoutType = normalizeText(workoutType);

  let baseMet = MET_BY_EXERCISE[normalizedName];

  if (!baseMet) {
    if (normalizedWorkoutType === 'walking') {
      baseMet = 3.5;
    } else if (normalizedWorkoutType === 'running' || normalizedWorkoutType === 'cardio') {
      baseMet = 9.0;
    } else if (normalizedWorkoutType === 'strength' || normalizedWorkoutType === 'legs' || normalizedWorkoutType === 'chest' || normalizedWorkoutType === 'back') {
      baseMet = 4.5;
    } else {
      baseMet = 4.0;
    }
  }

  if (BODYWEIGHT_EXERCISES.has(normalizedName)) {
    baseMet = Math.max(baseMet, 6.8);
  }

  const met = baseMet * intensityMultiplier(intensity);
  return round(met, 2);
}

function deriveDurationMinutes(exercise) {
  const explicitDuration = toNumber(exercise.durationMinutes, 0);
  if (explicitDuration > 0) {
    return explicitDuration;
  }

  const sets = Math.max(0, toNumber(exercise.sets, 0));
  const reps = Math.max(0, toNumber(exercise.reps, 0));

  if (!sets || !reps) {
    return 0;
  }

  const exerciseName = normalizeText(exercise.name);
  const perRepSeconds = BODYWEIGHT_EXERCISES.has(exerciseName) ? 2.5 : 3.0;
  const effortMinutes = (sets * reps * perRepSeconds) / 60;
  const restBetweenSets = Math.max(0, sets - 1) * (normalizeText(exercise.intensity) === 'intense' ? 1.2 : 1.5);

  return round(Math.max(2, effortMinutes + restBetweenSets), 1);
}

function estimateCaloriesBurned({ met, bodyWeightKg, durationMinutes }) {
  const durationHours = Math.max(0, toNumber(durationMinutes, 0)) / 60;
  const calories = met * Math.max(1, toNumber(bodyWeightKg, 70)) * durationHours;
  return round(calories, 1);
}

function normalizeExerciseEntry(exercise, workoutType, bodyWeightKg) {
  const name = String(exercise.name || workoutType || 'exercise').trim();
  const sets = Math.max(0, toNumber(exercise.sets, 0));
  const reps = Math.max(0, toNumber(exercise.reps, 0));
  const weightKg = Math.max(0, toNumber(exercise.weightKg || exercise.weight || 0));
  const intensity = normalizeText(exercise.intensity) || 'moderate';

  const durationMinutes = deriveDurationMinutes({ ...exercise, name, sets, reps, intensity });
  const met = estimateMet(name, workoutType, intensity);
  const caloriesBurned = estimateCaloriesBurned({ met, bodyWeightKg, durationMinutes });

  return {
    name,
    sets,
    reps,
    weightKg,
    durationMinutes,
    intensity,
    met,
    caloriesBurned,
  };
}

function estimateStepsAndDistance(stepsInput, distanceMilesInput) {
  const steps = Math.max(0, toNumber(stepsInput, 0));
  const distanceMiles = Math.max(0, toNumber(distanceMilesInput, 0));

  if (steps > 0 && distanceMiles > 0) {
    return { steps: Math.round(steps), distanceMiles: round(distanceMiles, 2) };
  }

  if (steps > 0) {
    return {
      steps: Math.round(steps),
      distanceMiles: round(steps / 2250, 2),
    };
  }

  if (distanceMiles > 0) {
    return {
      steps: Math.round(distanceMiles * 2250),
      distanceMiles: round(distanceMiles, 2),
    };
  }

  return { steps: 0, distanceMiles: 0 };
}

function buildTransparencyMessage() {
  return {
    notice: 'Calories burned are estimates based on MET studies and may vary by individual.',
    source: 'Based on Compendium of Physical Activities',
  };
}

function buildExerciseRecord(userId, payload, existing = null) {
  const bodyWeightKg = Math.max(20, toNumber(payload.bodyWeightKg, 70));
  const workoutType = String(payload.workoutType || 'general').trim().toLowerCase();

  const exerciseInputs = Array.isArray(payload.exercises) && payload.exercises.length
    ? payload.exercises
    : [
        {
          name: payload.exerciseName || workoutType || 'exercise',
          sets: payload.sets,
          reps: payload.reps,
          weightKg: payload.weightKg,
          durationMinutes: payload.durationMinutes,
          intensity: payload.intensity || 'moderate',
        },
      ];

  const exercises = exerciseInputs.map((item) => normalizeExerciseEntry(item, workoutType, bodyWeightKg));

  let durationMinutes = Math.max(0, toNumber(payload.durationMinutes, 0));
  if (durationMinutes <= 0) {
    durationMinutes = round(
      exercises.reduce((total, item) => total + Number(item.durationMinutes || 0), 0),
      1
    );
  }

  const stepsDistance = estimateStepsAndDistance(payload.steps, payload.distanceMiles);
  const reportedCaloriesBurned = Math.max(0, toNumber(payload.caloriesBurned, 0));

  const exerciseCalories = exercises.reduce((total, item) => total + Number(item.caloriesBurned || 0), 0);
  let caloriesBurned = reportedCaloriesBurned > 0 ? round(reportedCaloriesBurned, 1) : round(exerciseCalories, 1);

  if (reportedCaloriesBurned <= 0 && !exerciseCalories && (stepsDistance.steps > 0 || stepsDistance.distanceMiles > 0)) {
    const walkingDuration = durationMinutes > 0 ? durationMinutes : round((stepsDistance.distanceMiles / 3) * 60, 1);
    caloriesBurned = estimateCaloriesBurned({
      met: estimateMet('walking', 'walking', payload.intensity || 'moderate'),
      bodyWeightKg,
      durationMinutes: walkingDuration,
    });
    durationMinutes = walkingDuration;
  }

  const createdAt = payload.timestamp || existing?.createdAt || new Date().toISOString();
  assertDayEditable(createdAt);

  const record = {
    id: existing?.id || randomUUID(),
    userId,
    workoutType: workoutType || existing?.workoutType || 'general',
    source: payload.source || existing?.source || 'manual',
    provider: payload.provider || existing?.provider || 'manual',
    bodyWeightKg,
    durationMinutes,
    exercises,
    steps: stepsDistance.steps,
    distanceMiles: stepsDistance.distanceMiles,
    caloriesBurned,
    estimationMethod: payload.estimationMethod || existing?.estimationMethod || 'met_formula',
    notes: String(payload.notes || '').trim(),
    createdAt,
  };

  return record;
}

async function createExerciseRecord(userId, payload) {
  const record = buildExerciseRecord(userId, payload);
  const saved = await exerciseSessionModel.createSession(record);
  return {
    session: saved,
    transparency: buildTransparencyMessage(),
  };
}

async function logWorkout(userId, payload) {
  return createExerciseRecord(userId, {
    ...payload,
    source: payload.source || 'manual',
    provider: payload.provider || 'manual',
    estimationMethod: payload.estimationMethod || 'met_formula',
  });
}

async function logSteps(userId, payload) {
  const durationMinutes = toNumber(payload.durationMinutes, 0);
  const estimatedSteps =
    toNumber(payload.steps, 0) > 0
      ? Math.round(toNumber(payload.steps, 0))
      : durationMinutes > 0
        ? Math.round(durationMinutes * 110)
        : 0;

  return createExerciseRecord(userId, {
    workoutType: 'walking',
    exercises: [],
    steps: estimatedSteps,
    distanceMiles: payload.distanceMiles,
    durationMinutes,
    bodyWeightKg: payload.bodyWeightKg,
    intensity: payload.intensity || 'moderate',
    notes: payload.notes,
    source: 'manual',
    provider: 'manual',
    estimationMethod: 'met_formula',
    timestamp: payload.timestamp,
  });
}

async function syncWearable(userId, payload) {
  const provider = normalizeText(payload.provider || 'smartwatch') || 'smartwatch';

  const connection = await exerciseSessionModel.replaceWearableConnection(userId, provider, true);

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const sessions = [];

  for (const entry of entries) {
    const hasReportedCalories = Number(entry.caloriesBurned || 0) > 0;
    const result = await createExerciseRecord(userId, {
      workoutType: entry.workoutType || entry.activityType || 'cardio',
      exercises: entry.exercises,
      steps: entry.steps,
      distanceMiles: entry.distanceMiles,
      durationMinutes: entry.durationMinutes,
      bodyWeightKg: entry.bodyWeightKg || payload.bodyWeightKg,
      intensity: entry.intensity || 'moderate',
      caloriesBurned: entry.caloriesBurned,
      notes: entry.notes,
      source: 'wearable-sync',
      provider,
      estimationMethod: hasReportedCalories ? 'wearable_reported' : 'met_formula',
      timestamp: entry.timestamp || new Date().toISOString(),
    });

    sessions.push(result.session);
  }

  const totalSyncedSteps = sessions.reduce((sum, session) => sum + Number(session.steps || 0), 0);
  const totalSyncedCalories = sessions.reduce(
    (sum, session) => sum + Number(session.caloriesBurned || 0),
    0
  );
  const activityLevel = Math.min(
    1,
    (Math.min(totalSyncedSteps / 9000, 1) * 0.6) + (Math.min(totalSyncedCalories / 650, 1) * 0.4)
  );
  const currentUser = await userService.getUserOrThrow(userId);
  const currentIoT = currentUser.iotPreferences && typeof currentUser.iotPreferences === 'object'
    ? currentUser.iotPreferences
    : {};
  await userService.updateUser(userId, {
    iotPreferences: {
      ...currentIoT,
      allowWearableData:
        payload.consentGiven === undefined ? Boolean(currentIoT.allowWearableData) : Boolean(payload.consentGiven),
      provider,
      syncedSteps: Math.round(totalSyncedSteps),
      syncedCaloriesBurned: Math.round(totalSyncedCalories),
      syncedActivityLevel: Number(activityLevel.toFixed(4)),
      lastSyncedAt: new Date().toISOString(),
    },
  });

  return {
    provider,
    connection,
    importedCount: sessions.length,
    sessions,
    iotSync: {
      syncedSteps: Math.round(totalSyncedSteps),
      syncedCaloriesBurned: Math.round(totalSyncedCalories),
      activityLevelNormalized: Number(activityLevel.toFixed(4)),
    },
    transparency: buildTransparencyMessage(),
    fallbackMode: sessions.length === 0,
  };
}

async function updateExerciseSession(userId, sessionId, payload) {
  const existing = await exerciseSessionModel.findSessionByIdForUser(userId, sessionId);
  if (!existing) {
    throw new AppError('Exercise session not found', 404, 'NOT_FOUND');
  }

  assertDayEditable(existing.createdAt);

  const next = buildExerciseRecord(userId, payload, existing);
  const session = await exerciseSessionModel.updateSessionByIdForUser(userId, sessionId, next);

  return {
    session,
    transparency: buildTransparencyMessage(),
  };
}

async function deleteExerciseSession(userId, sessionId) {
  const existing = await exerciseSessionModel.findSessionByIdForUser(userId, sessionId);
  if (!existing) {
    throw new AppError('Exercise session not found', 404, 'NOT_FOUND');
  }

  assertDayEditable(existing.createdAt);
  await exerciseSessionModel.deleteSessionByIdForUser(userId, sessionId);

  return {
    session: existing,
    transparency: buildTransparencyMessage(),
  };
}

function aggregateSessionsByDay(sessions) {
  const map = new Map();

  sessions.forEach((session) => {
    const date = String(session.createdAt || '').slice(0, 10);
    const row = map.get(date) || {
      date,
      caloriesBurned: 0,
      steps: 0,
      durationMinutes: 0,
      workouts: 0,
    };

    row.caloriesBurned += Number(session.caloriesBurned || 0);
    row.steps += Number(session.steps || 0);
    row.durationMinutes += Number(session.durationMinutes || 0);
    row.workouts += 1;

    map.set(date, row);
  });

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      caloriesBurned: round(item.caloriesBurned, 1),
      durationMinutes: round(item.durationMinutes, 1),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function getTodayExerciseSummary(userId, options = {}) {
  const sessions = await exerciseSessionModel.listSessionsByUserBetween(
    userId,
    startOfToday().toISOString(),
    endOfToday().toISOString()
  );

  const totalCaloriesBurned = round(
    sessions.reduce((sum, item) => sum + Number(item.caloriesBurned || 0), 0),
    1
  );
  const totalSteps = Math.round(sessions.reduce((sum, item) => sum + Number(item.steps || 0), 0));
  const totalDistanceMiles = round(
    sessions.reduce((sum, item) => sum + Number(item.distanceMiles || 0), 0),
    2
  );
  const totalDurationMinutes = round(
    sessions.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0),
    1
  );

  const byWorkoutType = {};
  let strengthWorkouts = 0;

  sessions.forEach((session) => {
    const type = normalizeText(session.workoutType || 'general') || 'general';
    byWorkoutType[type] = byWorkoutType[type] || {
      workoutType: type,
      caloriesBurned: 0,
      durationMinutes: 0,
      sessions: 0,
    };

    byWorkoutType[type].caloriesBurned += Number(session.caloriesBurned || 0);
    byWorkoutType[type].durationMinutes += Number(session.durationMinutes || 0);
    byWorkoutType[type].sessions += 1;

    const hasStrengthExercise = (session.exercises || []).some((exercise) =>
      STRENGTH_EXERCISES.has(normalizeText(exercise.name))
    );

    if (hasStrengthExercise || ['chest', 'back', 'legs', 'strength'].includes(type)) {
      strengthWorkouts += 1;
    }
  });

  let contentSuggestions = null;
  if (options.includeContentSuggestions !== false) {
    try {
      const user = await userService.getUserOrThrow(userId);
      const activityType =
        sessions[0]?.workoutType ||
        (totalSteps > 0 ? 'walking' : 'workout');
      contentSuggestions = await withTimeout(
        getContentRecommendationService().getContextualRecommendations(user, {
          contextType: 'workout',
          activityType,
          durationMinutes: totalDurationMinutes || 35,
          logImpressions: false,
        }),
        900,
        'exercise-content-timeout'
      );
    } catch (error) {
      contentSuggestions = null;
    }
  }

  return {
    sessions,
    summary: {
      totalCaloriesBurned,
      totalSteps,
      totalDistanceMiles,
      totalDurationMinutes,
      workoutsDone: sessions.length,
      strengthWorkouts,
      byWorkoutType: Object.values(byWorkoutType).map((item) => ({
        ...item,
        caloriesBurned: round(item.caloriesBurned, 1),
        durationMinutes: round(item.durationMinutes, 1),
      })),
    },
    contentSuggestions,
    transparency: buildTransparencyMessage(),
  };
}

async function getExerciseHistory(userId, limit = 240) {
  const safeLimit = Math.max(10, Math.min(limit, 1000));
  const [sessions, connections] = await Promise.all([
    exerciseSessionModel.listSessionsByUser(userId, safeLimit),
    exerciseSessionModel.listWearableConnections(userId),
  ]);

  return {
    sessions,
    byDay: aggregateSessionsByDay(sessions),
    wearableConnections: connections,
    transparency: buildTransparencyMessage(),
  };
}

module.exports = {
  logWorkout,
  logSteps,
  syncWearable,
  updateExerciseSession,
  deleteExerciseSession,
  getTodayExerciseSummary,
  getExerciseHistory,
  estimateCaloriesBurned,
  isToday,
  isPast,
};
