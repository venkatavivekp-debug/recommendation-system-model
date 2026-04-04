const recommendationInteractionModel = require('../models/recommendationInteractionModel');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 3) {
  return Number(Number(value || 0).toFixed(decimals));
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + toNumber(value, 0), 0) / values.length;
}

function std(values = []) {
  if (values.length < 2) return 1;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(variance, 1e-6));
}

function quantile(values = [], q = 0.5) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function iqrUpperFence(values = []) {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  return q3 + 1.5 * iqr;
}

function zScore(value, baseline = []) {
  if (!baseline.length) return 0;
  const sigma = std(baseline);
  if (!Number.isFinite(sigma) || sigma <= 0.0001) return 0;
  return (toNumber(value, 0) - mean(baseline)) / sigma;
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function buildDailySeriesFromLogs(meals = [], exerciseSessions = []) {
  const map = new Map();

  meals.forEach((meal) => {
    const key = dayKey(meal.createdAt || Date.now());
    const row = map.get(key) || {
      date: key,
      caloriesConsumed: 0,
      caloriesBurned: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
      steps: 0,
    };
    row.caloriesConsumed += toNumber(meal.calories, 0);
    row.protein += toNumber(meal.protein, 0);
    row.carbs += toNumber(meal.carbs, 0);
    row.fats += toNumber(meal.fats, 0);
    row.fiber += toNumber(meal.fiber, 0);
    map.set(key, row);
  });

  exerciseSessions.forEach((session) => {
    const key = dayKey(session.createdAt || Date.now());
    const row = map.get(key) || {
      date: key,
      caloriesConsumed: 0,
      caloriesBurned: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
      steps: 0,
    };
    row.caloriesBurned += toNumber(session.caloriesBurned, 0);
    row.steps += toNumber(session.steps, 0);
    map.set(key, row);
  });

  return Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function detectRecommendationAcceptanceAnomaly(interactions = []) {
  if (!Array.isArray(interactions) || interactions.length < 30) {
    return null;
  }

  const now = Date.now();
  const shown = interactions.filter((row) => row.eventType === 'shown');
  const chosen = interactions.filter((row) => row.eventType === 'chosen');

  const inDays = (row, daysStart, daysEnd) => {
    const ageDays = (now - new Date(row.createdAt || now).getTime()) / 86400000;
    return ageDays >= daysStart && ageDays < daysEnd;
  };

  const shownRecent = shown.filter((row) => inDays(row, 0, 7)).length;
  const shownPrevious = shown.filter((row) => inDays(row, 7, 14)).length;
  if (shownRecent < 8 || shownPrevious < 8) {
    return null;
  }

  const chosenRecent = chosen.filter((row) => inDays(row, 0, 7)).length;
  const chosenPrevious = chosen.filter((row) => inDays(row, 7, 14)).length;

  const recentRate = chosenRecent / Math.max(shownRecent, 1);
  const previousRate = chosenPrevious / Math.max(shownPrevious, 1);
  const delta = recentRate - previousRate;

  if (delta < -0.18 && previousRate >= 0.2) {
    return {
      type: 'recommendation_acceptance_drop',
      severity: 'medium',
      message: 'Recommendation acceptance is lower than your recent baseline.',
      details: {
        recentRate: round(recentRate, 3),
        previousRate: round(previousRate, 3),
        delta: round(delta, 3),
      },
    };
  }

  return null;
}

function detectNutritionAnomalies({ today = {}, baselineDays = [], iotContext = null }) {
  const anomalies = [];
  if (!Array.isArray(baselineDays) || baselineDays.length < 7) {
    return { anomalies, count: 0, hasAnomaly: false, topMessage: null };
  }

  const baselineCalories = baselineDays.map((day) => toNumber(day.caloriesConsumed, 0));
  const baselineCarbs = baselineDays.map((day) => toNumber(day.carbs, 0));
  const baselineBurned = baselineDays.map((day) => toNumber(day.caloriesBurned, 0));

  const caloriesZ = zScore(today.caloriesConsumed, baselineCalories);
  const carbsZ = zScore(today.carbs, baselineCarbs);
  const burnedZ = zScore(today.caloriesBurned, baselineBurned);

  if (caloriesZ >= 2) {
    anomalies.push({
      type: 'calorie_spike',
      severity: 'medium',
      message: 'Unusual calorie intake detected compared with your recent 14-day pattern.',
      stats: {
        zScore: round(caloriesZ, 2),
      },
    });
  }

  const calorieUpperFence = iqrUpperFence(baselineCalories);
  if (
    baselineCalories.length >= 8 &&
    Number.isFinite(calorieUpperFence) &&
    toNumber(today.caloriesConsumed, 0) > calorieUpperFence
  ) {
    anomalies.push({
      type: 'calorie_outlier_iqr',
      severity: 'medium',
      message: 'Calorie intake is outside your typical range based on recent IQR bounds.',
      stats: {
        upperFence: round(calorieUpperFence, 0),
      },
    });
  }

  if (carbsZ >= 2) {
    anomalies.push({
      type: 'carb_spike',
      severity: 'medium',
      message: 'Carb intake is significantly above your weekly pattern.',
      stats: {
        zScore: round(carbsZ, 2),
      },
    });
  }

  if (caloriesZ >= 1.5 && burnedZ <= -1) {
    anomalies.push({
      type: 'intake_activity_mismatch',
      severity: 'low',
      message: 'Activity level is lower than usual relative to calorie intake today.',
      stats: {
        intakeZ: round(caloriesZ, 2),
        activityZ: round(burnedZ, 2),
      },
    });
  }

  const activityLevel = toNumber(iotContext?.activityLevelNormalized, NaN);
  if (
    Number.isFinite(activityLevel) &&
    activityLevel <= 0.3 &&
    toNumber(today.caloriesConsumed, 0) > mean(baselineCalories) + std(baselineCalories)
  ) {
    anomalies.push({
      type: 'low_activity_high_intake',
      severity: 'low',
      message: 'Low activity with higher-than-usual intake detected today.',
      stats: {
        activityLevel: round(activityLevel, 3),
      },
    });
  }

  return {
    anomalies,
    count: anomalies.length,
    hasAnomaly: anomalies.length > 0,
    topMessage: anomalies[0]?.message || null,
  };
}

function buildRecommendationAnomalyNote(candidate = {}, context = {}) {
  const remaining = context.remainingNutrition || {};
  const calories =
    toNumber(candidate.nutrition?.calories, NaN) ||
    toNumber(candidate.nutritionEstimate?.calories, 0);
  const remainingCalories = toNumber(remaining.calories, 0);

  if (remainingCalories > 0 && calories > remainingCalories + 180) {
    return 'This option exceeds your current remaining calorie budget.';
  }

  if (Array.isArray(candidate.allergyWarnings) && candidate.allergyWarnings.length) {
    return 'This option includes an allergy warning and requires caution.';
  }

  return null;
}

async function detectUserAnomalies({
  today = {},
  meals = [],
  exerciseSessions = [],
  recommendationInteractions,
  iotContext = null,
} = {}) {
  const dailySeries = buildDailySeriesFromLogs(meals, exerciseSessions);
  const baseline = dailySeries.slice(-15, -1);

  const nutritionSummary = detectNutritionAnomalies({
    today: {
      caloriesConsumed: toNumber(today.caloriesConsumed, 0),
      carbs: toNumber(today.carbs, 0),
      caloriesBurned: toNumber(today.caloriesBurned, 0),
    },
    baselineDays: baseline,
    iotContext,
  });

  const interactions =
    recommendationInteractions ||
    (today.userId ? await recommendationInteractionModel.listInteractionsByUser(today.userId, 1200) : []);
  const acceptanceAnomaly = detectRecommendationAcceptanceAnomaly(interactions || []);

  const anomalies = [...nutritionSummary.anomalies];
  if (acceptanceAnomaly) {
    anomalies.push(acceptanceAnomaly);
  }

  return {
    anomalies,
    count: anomalies.length,
    hasAnomaly: anomalies.length > 0,
    topMessage: anomalies[0]?.message || 'No unusual pattern detected today.',
    dailySeries: dailySeries.slice(-30),
  };
}

module.exports = {
  buildDailySeriesFromLogs,
  detectNutritionAnomalies,
  detectRecommendationAcceptanceAnomaly,
  buildRecommendationAnomalyNote,
  detectUserAnomalies,
};
