const mealModel = require('../models/mealModel');
const exerciseSessionModel = require('../models/exerciseSessionModel');
const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const userContentInteractionModel = require('../models/userContentInteractionModel');
const userService = require('./userService');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 3) {
  return Number(Number(value || 0).toFixed(decimals));
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

function daysAgo(dateValue, now = new Date()) {
  const date = new Date(dateValue || now);
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

function recencyWeight(ageDays) {
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.6;
  return 0.3;
}

function dayBucket(dateValue) {
  const date = new Date(dateValue);
  const hour = date.getHours();
  if (hour < 11) return 'morning';
  if (hour < 16) return 'lunch';
  if (hour < 22) return 'evening';
  return 'night';
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + toNumber(value, 0), 0) / values.length;
}

function buildMealTimeMacroSummary(meals = [], now = new Date()) {
  const buckets = {
    morning: { protein: 0, carbs: 0, fats: 0, calories: 0, count: 0, weight: 0 },
    lunch: { protein: 0, carbs: 0, fats: 0, calories: 0, count: 0, weight: 0 },
    evening: { protein: 0, carbs: 0, fats: 0, calories: 0, count: 0, weight: 0 },
    night: { protein: 0, carbs: 0, fats: 0, calories: 0, count: 0, weight: 0 },
  };

  meals.forEach((meal) => {
    const bucket = dayBucket(meal.createdAt);
    const weight = recencyWeight(daysAgo(meal.createdAt, now));
    const target = buckets[bucket];
    target.protein += toNumber(meal.protein, 0) * weight;
    target.carbs += toNumber(meal.carbs, 0) * weight;
    target.fats += toNumber(meal.fats, 0) * weight;
    target.calories += toNumber(meal.calories, 0) * weight;
    target.weight += weight;
    target.count += 1;
  });

  Object.keys(buckets).forEach((key) => {
    const row = buckets[key];
    const denom = Math.max(row.weight, 1);
    row.protein = round(row.protein / denom, 1);
    row.carbs = round(row.carbs / denom, 1);
    row.fats = round(row.fats / denom, 1);
    row.calories = round(row.calories / denom, 0);
  });

  return buckets;
}

function buildWeekendWeekdaySummary(meals = [], now = new Date()) {
  const weekendCarbs = [];
  const weekdayCarbs = [];
  const weekendCalories = [];
  const weekdayCalories = [];

  meals.forEach((meal) => {
    const date = new Date(meal.createdAt || now);
    const weightedCarbs = toNumber(meal.carbs, 0) * recencyWeight(daysAgo(date, now));
    const weightedCalories = toNumber(meal.calories, 0) * recencyWeight(daysAgo(date, now));

    if (date.getDay() === 0 || date.getDay() === 6) {
      weekendCarbs.push(weightedCarbs);
      weekendCalories.push(weightedCalories);
    } else {
      weekdayCarbs.push(weightedCarbs);
      weekdayCalories.push(weightedCalories);
    }
  });

  return {
    weekendCarbsAvg: round(mean(weekendCarbs), 1),
    weekdayCarbsAvg: round(mean(weekdayCarbs), 1),
    weekendCaloriesAvg: round(mean(weekendCalories), 0),
    weekdayCaloriesAvg: round(mean(weekdayCalories), 0),
  };
}

function buildDecisionPreferences(interactions = [], now = new Date()) {
  const counts = {
    delivery: 0,
    pickup: 0,
    eat_in: 0,
    scan: 0,
  };
  let total = 0;

  interactions
    .filter((row) => row.eventType === 'chosen')
    .forEach((row) => {
      const mode = normalizeText(row.context?.mode || row.sourceType);
      const weight = recencyWeight(daysAgo(row.createdAt, now));

      if (mode.includes('delivery')) counts.delivery += weight;
      else if (mode.includes('pickup') || mode.includes('go-there')) counts.pickup += weight;
      else if (mode.includes('eat_in') || mode.includes('recipe')) counts.eat_in += weight;
      else if (mode.includes('scan')) counts.scan += weight;

      total += weight;
    });

  const safeTotal = Math.max(total, 1);
  return {
    delivery: round(counts.delivery / safeTotal, 3),
    pickup: round(counts.pickup / safeTotal, 3),
    eatIn: round(counts.eat_in / safeTotal, 3),
    scan: round(counts.scan / safeTotal, 3),
  };
}

function buildCuisinePreferences(interactions = [], now = new Date()) {
  const scores = new Map();
  interactions
    .filter((row) => row.eventType === 'chosen')
    .forEach((row) => {
      const cuisine = normalizeText(row.context?.cuisine || '');
      if (!cuisine) return;
      const next = toNumber(scores.get(cuisine), 0) + recencyWeight(daysAgo(row.createdAt, now));
      scores.set(cuisine, next);
    });

  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, score]) => ({ name, score: round(score, 3) }));

  return {
    ranked,
    topCuisine: ranked[0]?.name || null,
  };
}

function buildExercisePattern(exerciseSessions = [], lookbackDays = 28) {
  const activeDays = new Set();
  exerciseSessions.forEach((session) => {
    const dateKey = new Date(session.createdAt || Date.now()).toISOString().slice(0, 10);
    activeDays.add(dateKey);
  });

  const workoutsPerWeek = (activeDays.size / Math.max(lookbackDays, 1)) * 7;
  return {
    activeDays: activeDays.size,
    workoutsPerWeek: round(workoutsPerWeek, 2),
  };
}

function buildContentContextPreferences(contentInteractions = [], now = new Date()) {
  const contextMap = new Map();

  contentInteractions
    .filter((row) => row.selected === true || ['selected', 'helpful', 'save'].includes(normalizeText(row.action)))
    .forEach((row) => {
      const context = normalizeText(row.contextType || 'general');
      const contentType = normalizeText(row.contentType || 'content');
      const key = `${context}:${contentType}`;
      const next = toNumber(contextMap.get(key), 0) + recencyWeight(daysAgo(row.createdAt, now));
      contextMap.set(key, next);
    });

  const ranked = Array.from(contextMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, score]) => ({ key, score: round(score, 3) }));

  return ranked;
}

function buildBehaviorNotes(profile = {}) {
  const notes = [];
  const mealSummary = profile.mealTimeMacroSummary || {};
  const weekend = profile.weekendWeekdaySummary || {};
  const decision = profile.decisionPreferences || {};
  const exercise = profile.exercisePattern || {};
  const topCuisine = profile.cuisinePreferences?.topCuisine;

  if ((mealSummary.evening?.protein || 0) >= (mealSummary.lunch?.protein || 0) + 6) {
    notes.push('You tend to prefer high-protein meals in the evening.');
  }

  if ((weekend.weekendCarbsAvg || 0) >= (weekend.weekdayCarbsAvg || 0) + 15) {
    notes.push('Your carb intake is typically higher on weekends.');
  }

  if ((decision.delivery || 0) >= 0.55) {
    notes.push('You are more likely to choose delivery in your recent activity pattern.');
  } else if ((decision.eatIn || 0) >= 0.55) {
    notes.push('You increasingly prefer eat-in decisions over ordering out.');
  }

  if (topCuisine) {
    notes.push(`Your most selected cuisine recently is ${topCuisine}.`);
  }

  if ((exercise.workoutsPerWeek || 0) > 0) {
    notes.push(`Your current exercise frequency is about ${exercise.workoutsPerWeek} workouts per week.`);
  }

  const topContent = (profile.contentContextPreferences || [])[0];
  if (topContent?.key) {
    const [context, type] = String(topContent.key).split(':');
    notes.push(`You usually choose ${type} content during ${context} contexts.`);
  }

  return notes.slice(0, 5);
}

function computeBehaviorDriftScore(meals = []) {
  if (!Array.isArray(meals) || meals.length < 10) {
    return 0;
  }

  const sorted = [...meals].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const recent = sorted.slice(-7);
  const previous = sorted.slice(-14, -7);

  if (!previous.length) {
    return 0;
  }

  const recentCalories = mean(recent.map((item) => toNumber(item.calories, 0)));
  const previousCalories = mean(previous.map((item) => toNumber(item.calories, 0)));
  const recentCarbs = mean(recent.map((item) => toNumber(item.carbs, 0)));
  const previousCarbs = mean(previous.map((item) => toNumber(item.carbs, 0)));

  const calorieDrift = Math.abs(recentCalories - previousCalories) / Math.max(previousCalories, 1);
  const carbDrift = Math.abs(recentCarbs - previousCarbs) / Math.max(previousCarbs, 1);

  return round(clamp01((calorieDrift * 0.6) + (carbDrift * 0.4)), 3);
}

function getBehaviorNoteForRecommendation(candidate = {}, profile = {}, context = {}) {
  const notes = profile.notes || [];
  const preferredCuisine = normalizeText(profile.cuisinePreferences?.topCuisine || '');
  const candidateCuisine = normalizeText(candidate.cuisineType || candidate.cuisine || '');
  const mode = normalizeText(context.intent || context.mode || '');

  if (preferredCuisine && candidateCuisine && candidateCuisine.includes(preferredCuisine)) {
    return `Matches your recent cuisine preference for ${preferredCuisine}.`;
  }

  if ((profile.decisionPreferences?.delivery || 0) >= 0.55 && mode.includes('delivery')) {
    return 'Aligned with your recent delivery-first behavior pattern.';
  }

  if ((candidate.nutrition?.protein || candidate.nutritionEstimate?.protein || 0) >= 28 && notes.length) {
    const proteinNote = notes.find((note) => note.toLowerCase().includes('high-protein'));
    if (proteinNote) {
      return proteinNote;
    }
  }

  return notes[0] || 'Based on your recent behavior pattern and meal history.';
}

function getPrimaryBehaviorInsight(profile = {}) {
  return (profile.notes || [])[0] || 'Behavior profile is building as more interactions are logged.';
}

async function buildBehaviorProfile(userId, options = {}) {
  const now = new Date();
  const lookbackDays = Math.max(14, Math.min(120, toNumber(options.lookbackDays, 45)));

  const [user, meals, exerciseSessions, recommendationInteractions, contentInteractions] = await Promise.all([
    options.user || userService.getUserOrThrow(userId),
    options.meals || mealModel.listMealsByUser(userId, 600),
    options.exerciseSessions || exerciseSessionModel.listSessionsByUser(userId, 450),
    options.recommendationInteractions || recommendationInteractionModel.listInteractionsByUser(userId, 1200),
    options.contentInteractions || userContentInteractionModel.listInteractionsByUser(userId, 1000),
  ]);

  const slicedMeals = (meals || []).slice(0, lookbackDays * 6);
  const slicedExercise = (exerciseSessions || []).slice(0, lookbackDays * 4);

  const profile = {
    userId: user.id,
    generatedAt: now.toISOString(),
    lookbackDays,
    mealTimeMacroSummary: buildMealTimeMacroSummary(slicedMeals, now),
    weekendWeekdaySummary: buildWeekendWeekdaySummary(slicedMeals, now),
    decisionPreferences: buildDecisionPreferences(recommendationInteractions || [], now),
    cuisinePreferences: buildCuisinePreferences(recommendationInteractions || [], now),
    exercisePattern: buildExercisePattern(slicedExercise, 28),
    contentContextPreferences: buildContentContextPreferences(contentInteractions || [], now),
  };

  profile.behaviorDriftScore = computeBehaviorDriftScore(slicedMeals);
  profile.notes = buildBehaviorNotes(profile);
  profile.primaryInsight = getPrimaryBehaviorInsight(profile);

  return profile;
}

module.exports = {
  buildBehaviorProfile,
  getBehaviorNoteForRecommendation,
  getPrimaryBehaviorInsight,
  computeBehaviorDriftScore,
};
