const FEATURE_KEYS = [
  'proteinMatch',
  'calorieFit',
  'preferenceMatch',
  'distanceScore',
  'historySimilarity',
  'allergySafe',
  'timeOfDay',
  'dayOfWeek',
  'mealContextFit',
  'recentBehaviorTrend',
  'macroGapFit',
  'activityLevel',
  'interactionAffinity',
];

const CONTENT_FEATURE_KEYS = [
  'genreMatch',
  'moodMatch',
  'durationFit',
  'contextFit',
  'timeOfDayFit',
  'historySimilarity',
  'activityFit',
];

const DEFAULT_FEATURE_STATS = {
  proteinMatch: { mean: 0.52, std: 0.24 },
  calorieFit: { mean: 0.5, std: 0.24 },
  preferenceMatch: { mean: 0.46, std: 0.27 },
  distanceScore: { mean: 0.48, std: 0.26 },
  historySimilarity: { mean: 0.41, std: 0.28 },
  allergySafe: { mean: 0.9, std: 0.16 },
  timeOfDay: { mean: 0.48, std: 0.3 },
  dayOfWeek: { mean: 0.28, std: 0.45 },
  mealContextFit: { mean: 0.55, std: 0.24 },
  recentBehaviorTrend: { mean: 0.54, std: 0.22 },
  macroGapFit: { mean: 0.5, std: 0.25 },
  activityLevel: { mean: 0.52, std: 0.24 },
  interactionAffinity: { mean: 0.47, std: 0.25 },
};

const DEFAULT_CONTENT_FEATURE_STATS = {
  genreMatch: { mean: 0.5, std: 0.26 },
  moodMatch: { mean: 0.52, std: 0.24 },
  durationFit: { mean: 0.47, std: 0.25 },
  contextFit: { mean: 0.55, std: 0.23 },
  timeOfDayFit: { mean: 0.49, std: 0.24 },
  historySimilarity: { mean: 0.41, std: 0.28 },
  activityFit: { mean: 0.54, std: 0.24 },
};

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

function round(value, decimals = 6) {
  return Number(Number(value || 0).toFixed(decimals));
}

function cloneStats(stats = DEFAULT_FEATURE_STATS) {
  const next = {};
  FEATURE_KEYS.forEach((key) => {
    next[key] = {
      mean: toNumber(stats?.[key]?.mean, DEFAULT_FEATURE_STATS[key].mean),
      std: Math.max(0.05, toNumber(stats?.[key]?.std, DEFAULT_FEATURE_STATS[key].std)),
    };
  });
  return next;
}

function cloneContentStats(stats = DEFAULT_CONTENT_FEATURE_STATS) {
  const next = {};
  CONTENT_FEATURE_KEYS.forEach((key) => {
    next[key] = {
      mean: toNumber(stats?.[key]?.mean, DEFAULT_CONTENT_FEATURE_STATS[key].mean),
      std: Math.max(0.05, toNumber(stats?.[key]?.std, DEFAULT_CONTENT_FEATURE_STATS[key].std)),
    };
  });
  return next;
}

function getTemporalFeatures(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  const hour = date.getHours();
  const day = date.getDay();

  const timeOfDay =
    hour < 11
      ? 0.2
      : hour < 16
        ? 0.45
        : hour < 22
          ? 0.78
          : 1;

  const dayOfWeek = day === 0 || day === 6 ? 1 : 0;

  return {
    timeOfDay: round(timeOfDay, 4),
    dayOfWeek,
  };
}

function normalizeRawFeatures(features = {}) {
  const temporal = getTemporalFeatures(features.createdAt || features.timestamp || new Date());

  return {
    proteinMatch: clamp01(features.proteinMatch),
    calorieFit: clamp01(features.calorieFit),
    preferenceMatch: clamp01(features.preferenceMatch),
    distanceScore: clamp01(features.distanceScore),
    historySimilarity: clamp01(features.historySimilarity),
    allergySafe: clamp01(features.allergySafe),
    timeOfDay:
      features.timeOfDay === undefined || features.timeOfDay === null
        ? temporal.timeOfDay
        : clamp01(features.timeOfDay),
    dayOfWeek:
      features.dayOfWeek === undefined || features.dayOfWeek === null
        ? temporal.dayOfWeek
        : clamp01(features.dayOfWeek),
    mealContextFit: clamp01(features.mealContextFit),
    recentBehaviorTrend: clamp01(features.recentBehaviorTrend),
    macroGapFit: clamp01(features.macroGapFit),
    activityLevel: clamp01(features.activityLevel),
    interactionAffinity: clamp01(features.interactionAffinity),
  };
}

function normalizeRawContentFeatures(features = {}) {
  return {
    genreMatch: clamp01(features.genreMatch),
    moodMatch: clamp01(features.moodMatch),
    durationFit: clamp01(features.durationFit),
    contextFit: clamp01(features.contextFit),
    timeOfDayFit: clamp01(features.timeOfDayFit),
    historySimilarity: clamp01(features.historySimilarity),
    activityFit: clamp01(features.activityFit),
  };
}

function normalizeFeatures(features = {}, stats = DEFAULT_FEATURE_STATS) {
  const raw = normalizeRawFeatures(features);
  const safeStats = cloneStats(stats);
  const normalized = {};

  FEATURE_KEYS.forEach((key) => {
    const mean = toNumber(safeStats[key]?.mean, DEFAULT_FEATURE_STATS[key].mean);
    const std = Math.max(0.05, toNumber(safeStats[key]?.std, DEFAULT_FEATURE_STATS[key].std));
    normalized[key] = round(clamp((raw[key] - mean) / std, -4, 4), 6);
  });

  return normalized;
}

function normalizeContentFeatures(features = {}, stats = DEFAULT_CONTENT_FEATURE_STATS) {
  const raw = normalizeRawContentFeatures(features);
  const safeStats = cloneContentStats(stats);
  const normalized = {};

  CONTENT_FEATURE_KEYS.forEach((key) => {
    const mean = toNumber(safeStats[key]?.mean, DEFAULT_CONTENT_FEATURE_STATS[key].mean);
    const std = Math.max(0.05, toNumber(safeStats[key]?.std, DEFAULT_CONTENT_FEATURE_STATS[key].std));
    normalized[key] = round(clamp((raw[key] - mean) / std, -4, 4), 6);
  });

  return normalized;
}

function buildFeatureVector(features = {}, stats = DEFAULT_FEATURE_STATS) {
  const normalized = normalizeFeatures(features, stats);
  return [1, ...FEATURE_KEYS.map((key) => normalized[key])];
}

function buildContentFeatureVector(features = {}, stats = DEFAULT_CONTENT_FEATURE_STATS) {
  const normalized = normalizeContentFeatures(features, stats);
  return [1, ...CONTENT_FEATURE_KEYS.map((key) => normalized[key])];
}

function computeFeatureStats(featureRows = [], fallbackStats = DEFAULT_FEATURE_STATS) {
  const safeRows = Array.isArray(featureRows)
    ? featureRows.map((row) => normalizeRawFeatures(row))
    : [];
  const fallback = cloneStats(fallbackStats);

  if (!safeRows.length) {
    return fallback;
  }

  const computed = {};

  FEATURE_KEYS.forEach((key) => {
    const values = safeRows.map((row) => toNumber(row[key], fallback[key].mean));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
      Math.max(values.length, 1);
    const std = Math.sqrt(variance);

    computed[key] = {
      mean: round(mean, 6),
      std: round(Math.max(0.05, std), 6),
    };
  });

  return computed;
}

function computeContentFeatureStats(
  featureRows = [],
  fallbackStats = DEFAULT_CONTENT_FEATURE_STATS
) {
  const safeRows = Array.isArray(featureRows)
    ? featureRows.map((row) => normalizeRawContentFeatures(row))
    : [];
  const fallback = cloneContentStats(fallbackStats);

  if (!safeRows.length) {
    return fallback;
  }

  const computed = {};

  CONTENT_FEATURE_KEYS.forEach((key) => {
    const values = safeRows.map((row) => toNumber(row[key], fallback[key].mean));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
      Math.max(values.length, 1);
    const std = Math.sqrt(variance);

    computed[key] = {
      mean: round(mean, 6),
      std: round(Math.max(0.05, std), 6),
    };
  });

  return computed;
}

module.exports = {
  FEATURE_KEYS,
  CONTENT_FEATURE_KEYS,
  DEFAULT_FEATURE_STATS,
  DEFAULT_CONTENT_FEATURE_STATS,
  getTemporalFeatures,
  normalizeRawFeatures,
  normalizeRawContentFeatures,
  normalizeFeatures,
  normalizeContentFeatures,
  buildFeatureVector,
  buildContentFeatureVector,
  computeFeatureStats,
  computeContentFeatureStats,
};
