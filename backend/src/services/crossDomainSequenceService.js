function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(toNumber(value, 0), 0, 1);
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
}

function withinHours(first, second, hours = 3) {
  const a = toDate(first).getTime();
  const b = toDate(second).getTime();
  return Math.abs(a - b) <= hours * 3600 * 1000;
}

function buildSequenceState({
  intent,
  contextType,
  mealHistory = [],
  exerciseSessions = [],
  contentInteractions = [],
  iotContext = {},
} = {}) {
  const normalizedIntent = normalizeText(intent || contextType || 'daily');
  const meals = Array.isArray(mealHistory) ? mealHistory : [];
  const exercises = Array.isArray(exerciseSessions) ? exerciseSessions : [];
  const content = Array.isArray(contentInteractions) ? contentInteractions : [];

  let workoutToMealMatches = 0;
  meals.slice(0, 90).forEach((meal) => {
    const matched = exercises.some((session) =>
      withinHours(session?.createdAt || session?.timestamp, meal?.createdAt || meal?.timestamp, 4)
    );
    if (matched) {
      workoutToMealMatches += 1;
    }
  });
  const workoutToMealScore =
    meals.length > 0 ? clamp01(workoutToMealMatches / Math.max(meals.length, 1)) : 0.5;

  const songContexts = content.filter((row) =>
    ['walking', 'pickup', 'go-there', 'workout'].includes(normalizeText(row?.contextType))
  );
  const movieContexts = content.filter((row) =>
    ['eat_in', 'eat_out', 'while_eating', 'relaxing'].includes(normalizeText(row?.contextType))
  );

  const walkToSongScore = content.length
    ? clamp01(songContexts.length / Math.max(content.length, 1))
    : 0.5;
  const mealToMediaScore = content.length
    ? clamp01(movieContexts.length / Math.max(content.length, 1))
    : 0.5;

  const caloriesBurned = toNumber(iotContext?.caloriesBurned, 0);
  const steps = toNumber(iotContext?.steps, 0);
  const inactivityRisk = clamp01(1 - Math.min(steps / 6500, 1) * 0.6 - Math.min(caloriesBurned / 500, 1) * 0.4);

  const transitionScores = {
    workoutToMeal: workoutToMealScore,
    mealToMedia: mealToMediaScore,
    walkToSong: walkToSongScore,
    inactivityCorrection: inactivityRisk,
  };

  const dominantTransition = Object.entries(transitionScores).sort((a, b) => b[1] - a[1])[0] || [
    'workoutToMeal',
    0.5,
  ];

  return {
    intent: normalizedIntent,
    transitionScores,
    dominantTransition: {
      key: dominantTransition[0],
      score: Number(toNumber(dominantTransition[1], 0).toFixed(4)),
    },
  };
}

function transitionFitForCandidate(candidate = {}, state = {}, options = {}) {
  const intent = normalizeText(options.intent || state.intent || 'daily');
  const scores = state.transitionScores || {};
  const nutrition = candidate.nutrition || candidate.nutritionEstimate || {};
  const confidenceBase = clamp01(
    toNumber(candidate.recommendation?.confidence, NaN) ||
      toNumber(candidate.recommendation?.score, 0) / 100 ||
      toNumber(candidate.confidence, 0)
  );

  if (intent.includes('workout') || intent.includes('eat-in') || intent.includes('eat_in')) {
    const protein = clamp01(toNumber(nutrition.protein, 0) / 45);
    return clamp01(scores.workoutToMeal * 0.6 + protein * 0.25 + confidenceBase * 0.15);
  }

  if (intent.includes('walking') || intent.includes('pickup') || intent.includes('go-there')) {
    const proximity = clamp01(
      toNumber(candidate.recommendation?.features?.proximityScore, NaN) ||
        toNumber(candidate.recommendation?.features?.distanceScore, NaN) ||
        (toNumber(candidate.distance, NaN) > 0 ? 1 - Math.min(toNumber(candidate.distance, 0) / 10, 1) : 0.6)
    );
    return clamp01(scores.walkToSong * 0.55 + proximity * 0.3 + confidenceBase * 0.15);
  }

  if (intent.includes('eat-out') || intent.includes('eat_out') || intent.includes('delivery')) {
    const calorieFit = clamp01(
      toNumber(candidate.recommendation?.features?.calorieFit, NaN) ||
        toNumber(candidate.recommendation?.factors?.calorieFit, NaN) ||
        0.55
    );
    return clamp01(scores.mealToMedia * 0.5 + calorieFit * 0.25 + confidenceBase * 0.25);
  }

  return clamp01((scores.workoutToMeal + scores.mealToMedia + scores.walkToSong) / 3);
}

function applySequenceBoost(candidates = [], state = {}, options = {}) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const transitionFit = transitionFitForCandidate(candidate, state, options);
    const baseConfidence = clamp01(
      toNumber(candidate.recommendation?.confidence, NaN) ||
        toNumber(candidate.recommendation?.score, 0) / 100 ||
        toNumber(candidate.confidence, 0)
    );
    const blendedConfidence = clamp01(baseConfidence * 0.84 + transitionFit * 0.16);

    return {
      ...candidate,
      recommendation: {
        ...(candidate.recommendation || {}),
        confidence: Number(blendedConfidence.toFixed(4)),
        confidencePct: Number((blendedConfidence * 100).toFixed(1)),
        score: Number((blendedConfidence * 100).toFixed(2)),
        sequenceTransitionFit: Number(transitionFit.toFixed(4)),
      },
      sequenceTransitionFit: Number(transitionFit.toFixed(4)),
    };
  });
}

function buildSequenceNote(state = {}, intent = '') {
  const dominantKey = normalizeText(state?.dominantTransition?.key || '');
  const score = toNumber(state?.dominantTransition?.score, 0);
  const intentLabel = normalizeText(intent || state.intent || 'daily').replace(/[_-]+/g, ' ');

  if (dominantKey === 'workouttomeal') {
    return `Cross-domain pattern: workout sessions often lead to high-protein ${intentLabel} choices.`;
  }
  if (dominantKey === 'walktosong') {
    return `Cross-domain pattern: walking contexts align with high-engagement music picks.`;
  }
  if (dominantKey === 'mealtomedia') {
    return `Cross-domain pattern: meal decisions are strongly linked to media preferences.`;
  }
  if (dominantKey === 'inactivitycorrection' && score >= 0.6) {
    return 'Cross-domain signal: low activity trend suggests prioritizing lighter options.';
  }

  return 'Cross-domain sequence signals are balanced for the current context.';
}

module.exports = {
  buildSequenceState,
  applySequenceBoost,
  buildSequenceNote,
};
