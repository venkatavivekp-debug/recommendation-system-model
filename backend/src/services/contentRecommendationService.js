const { randomUUID } = require('crypto');
const userContentInteractionModel = require('../models/userContentInteractionModel');
const userService = require('./userService');
const recommendationService = require('./recommendationService');
const iotService = require('./iotService');
const multiCandidateService = require('./multiCandidateService');
const banditDecisionService = require('./banditDecisionService');
const explanationService = require('./explanationService');
const candidateGenerationService = require('./candidateGenerationService');
const feedbackLearningService = require('./feedbackLearningService');
const crossDomainMappingService = require('./crossDomainMappingService');
const { feedbackUtility, normalizeFeedbackAction } = require('../utils/feedbackSignals');
const {
  normalizeContentPreferences,
  createDefaultContentPreferences,
} = require('./userDefaultsService');

const FALLBACK_MOVIES = [
  { id: 'fallback-movie-interstellar', title: 'Interstellar', genre: 'sci-fi' },
  { id: 'fallback-movie-martian', title: 'The Martian', genre: 'sci-fi' },
  { id: 'fallback-movie-ford-v-ferrari', title: 'Ford v Ferrari', genre: 'sports' },
  { id: 'fallback-movie-moneyball', title: 'Moneyball', genre: 'drama' },
  { id: 'fallback-movie-social-network', title: 'The Social Network', genre: 'drama' },
];

const FALLBACK_SONGS = [
  { id: 'fallback-song-blinding-lights', title: 'Blinding Lights', artist: 'The Weeknd', genre: 'pop' },
  { id: 'fallback-song-eye-of-the-tiger', title: 'Eye of the Tiger', artist: 'Survivor', genre: 'rock' },
  { id: 'fallback-song-lose-yourself', title: 'Lose Yourself', artist: 'Eminem', genre: 'hip-hop' },
  { id: 'fallback-song-on-top-of-the-world', title: 'On Top of the World', artist: 'Imagine Dragons', genre: 'pop' },
  { id: 'fallback-song-hall-of-fame', title: 'Hall of Fame', artist: 'The Script', genre: 'pop' },
];

const MODE_DEFINITIONS = [
  {
    id: 'genre_preference_fit',
    label: 'Genre preference fit',
    reason: 'Strong match for your preferred genres',
  },
  {
    id: 'mood_fit',
    label: 'Mood fit',
    reason: 'Matches your preferred mood in this context',
  },
  {
    id: 'duration_fit',
    label: 'Duration fit',
    reason: 'Fits your available session time',
  },
  {
    id: 'time_of_day_fit',
    label: 'Time-of-day fit',
    reason: 'Aligned with your current time-of-day pattern',
  },
  {
    id: 'history_similarity_fit',
    label: 'History similarity fit',
    reason: 'Similar to content you picked recently',
  },
  {
    id: 'activity_fit',
    label: 'Activity fit',
    reason: 'Fits your current activity and energy level',
  },
];

const POSITIVE_FEEDBACK_ACTIONS = new Set(['selected', 'helpful', 'save']);
const CONTENT_SAVE_LIMIT = 120;

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

function round(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}


function normalizeContentType(value, fallback = 'movie') {
  const normalized = normalizeText(value);
  return normalized === 'song' ? 'song' : fallback;
}

function normalizeContributionPercent(value) {
  const numeric = toNumber(value, 0);
  const ratio = numeric > 1 ? numeric / 100 : numeric;
  return clamp01(ratio);
}

function normalizeFeatureContributions(features = []) {
  const mapped = (Array.isArray(features) ? features : [])
    .map((factor) => ({
      name: String(factor?.name || '').trim(),
      rawContribution: Math.abs(toNumber(factor?.contribution, 0)),
    }))
    .filter((factor) => factor.name);

  const total = mapped.reduce((sum, factor) => sum + factor.rawContribution, 0);
  if (total <= 0) {
    return mapped.map((factor) => ({
      ...factor,
      contribution: 0,
      contributionPct: 0,
    }));
  }

  return mapped.map((factor) => {
    const normalized = factor.rawContribution / total;
    return {
      ...factor,
      contribution: round(normalized, 4),
      contributionPct: round(normalized * 100, 1),
    };
  });
}

function contentTitleKey(contentType, title, artist = '') {
  const normalizedType = normalizeContentType(contentType, 'movie');
  const normalizedTitle = normalizeText(title);
  const normalizedArtist = normalizeText(artist);
  return `${normalizedType}:${normalizedTitle}:${normalizedArtist}`;
}

function buildContentSuppressionState(interactions = [], contentType = 'movie') {
  const latestById = new Map();
  const latestByTitle = new Map();
  const targetType = normalizeContentType(contentType, 'movie');

  const ordered = [...(Array.isArray(interactions) ? interactions : [])].sort(
    (a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0)
  );

  ordered.forEach((row) => {
    const rowType = normalizeContentType(row?.contentType, targetType);
    if (rowType !== targetType) {
      return;
    }

    const action = normalizeFeedbackAction(row?.action);
    const itemId = normalizeText(row?.itemId);
    const titleKey = contentTitleKey(
      rowType,
      row?.title,
      row?.metadata?.artist || ''
    );

    if (itemId && !latestById.has(itemId)) {
      latestById.set(itemId, action);
    }
    if (!latestByTitle.has(titleKey)) {
      latestByTitle.set(titleKey, action);
    }
  });

  return {
    byId: new Set(
      [...latestById.entries()]
        .filter(([, action]) => action === 'not_interested')
        .map(([key]) => key)
    ),
    byTitle: new Set(
      [...latestByTitle.entries()]
        .filter(([, action]) => action === 'not_interested')
        .map(([key]) => key)
    ),
  };
}

function isSuppressedContentItem(item, contentType, suppression = {}) {
  const normalizedType = normalizeContentType(contentType, 'movie');
  const idKey = normalizeText(item?.id);
  const titleKey = contentTitleKey(
    normalizedType,
    item?.title,
    normalizedType === 'song' ? item?.artist : ''
  );

  return (
    Boolean(idKey && suppression?.byId?.has(idKey)) ||
    Boolean(titleKey && suppression?.byTitle?.has(titleKey))
  );
}

function filterSuppressedContent(items = [], contentType, suppression = {}) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => !isSuppressedContentItem(item, contentType, suppression)
  );
}

function buildTokenSet(text) {
  return Array.from(
    new Set(
      normalizeText(text)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3)
    )
  );
}

function inferTimeOfDay(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  const hour = date.getHours();
  if (hour < 11) return 'morning';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'night';
}

function contextCandidateType(contextType) {
  const normalized = normalizeText(contextType);
  if (['walking', 'walk', 'pickup', 'go-there', 'workout', 'running', 'cardio'].includes(normalized)) {
    return 'song';
  }
  return 'movie';
}

function contextDefaultDuration(contextType, options = {}) {
  const normalized = normalizeText(contextType);
  const etaMinutes = toNumber(options.etaMinutes, 0);

  if (['walking', 'walk', 'pickup', 'go-there'].includes(normalized)) {
    return clamp(etaMinutes > 0 ? etaMinutes : 24, 10, 75);
  }
  if (['workout', 'running', 'cardio'].includes(normalized)) {
    const duration = toNumber(options.durationMinutes, 0);
    return clamp(duration > 0 ? duration : 35, 15, 90);
  }

  return clamp(toNumber(options.sessionMinutes, 45), 15, 180);
}

function targetMoodForContext(contextType, activityType, workoutContext = null) {
  const normalized = normalizeText(contextType);
  const activity = normalizeText(activityType);

  if (normalized === 'workout' && workoutContext?.sessionClass === 'long_endurance') {
    return ['steady', 'smooth', 'uplifting', 'energetic'];
  }
  if (normalized === 'workout' && workoutContext?.sessionClass === 'light_recovery') {
    return ['upbeat', 'smooth', 'uplifting', 'light', 'calm'];
  }
  if (normalized === 'workout' || ['running', 'cardio', 'strength'].includes(activity)) {
    return ['energetic', 'hype', 'intense', 'uplifting'];
  }

  if (normalized === 'walking' || normalized === 'pickup' || normalized === 'go-there') {
    return ['uplifting', 'light', 'calm', 'energetic'];
  }

  if (normalized === 'eat_in' || normalized === 'eat_out' || normalized === 'while_eating') {
    return ['light', 'feel-good', 'relaxed', 'calm'];
  }

  return ['calm', 'light', 'uplifting'];
}

function mediaFeatureValues(item = {}) {
  const energy = toNumber(item.energy, 0);
  const tempo = toNumber(item.tempo, 0);
  const artist = normalizeText(item.artist);
  return {
    genre: normalizeText(item.genre),
    artist: ['recommendation-system-model curated', 'curated playlist'].includes(artist) ? '' : artist,
    mood: normalizeText(item.mood),
    energy: energy >= 0.68 ? 'high energy' : energy <= 0.4 ? 'low energy' : 'medium energy',
    tempo: tempo >= 135 ? 'fast tempo' : tempo > 0 && tempo <= 100 ? 'slow tempo' : 'steady tempo',
  };
}

function buildMediaPreferenceProfile(interactions = [], contentType = 'song', contextType = '', workoutContext = null) {
  const totals = new Map();
  const weights = new Map();
  const accepted = (Array.isArray(interactions) ? interactions : []).filter((row) => {
    const isSong = normalizeContentType(row.contentType, 'movie') === contentType;
    const action = normalizeFeedbackAction(row.action);
    return isSong && (POSITIVE_FEEDBACK_ACTIONS.has(action) || action === 'not_interested');
  });

  accepted.forEach((row) => {
    const action = normalizeFeedbackAction(row.action);
    const media = row.metadata?.mediaFeatures || {};
    const sameContext = normalizeText(row.contextType) === normalizeText(contextType);
    const sameWorkout = !workoutContext || !media.sessionClass || media.sessionClass === workoutContext.sessionClass;
    const contextWeight = sameContext ? (sameWorkout ? 1 : 0.4) : 0.15;
    const ageDays = Math.max(0, (Date.now() - new Date(row.createdAt || Date.now()).getTime()) / 86400000);
    const weight = feedbackUtility(action) * contextWeight * Math.max(0.35, 1 - ageDays / 60);

    Object.entries(mediaFeatureValues(media)).forEach(([key, value]) => {
      if (!value) return;
      const affinityKey = `${key}:${value}`;
      const featureWeight = !sameWorkout
        ? weight * (['genre', 'artist'].includes(key) ? 0.75 : 0.35)
        : weight;
      totals.set(affinityKey, toNumber(totals.get(affinityKey), 0) + featureWeight);
      weights.set(affinityKey, toNumber(weights.get(affinityKey), 0) + Math.abs(featureWeight));
    });
  });

  return { totals, weights, hasEvidence: totals.size > 0 };
}

function learnedMediaFit(candidate, profile) {
  if (!profile?.hasEvidence) return null;
  const matches = Object.entries(mediaFeatureValues(candidate))
    .filter(([key, value]) => value && profile.weights.has(`${key}:${value}`))
    .map(([key, value]) => {
      const affinityKey = `${key}:${value}`;
      return profile.totals.get(affinityKey) / profile.weights.get(affinityKey);
    });
  if (!matches.length) return null;
  return clamp01(0.5 + 0.5 * matches.reduce((sum, value) => sum + value, 0) / matches.length);
}

function learnedMediaReason(candidate, profile) {
  const labels = Object.entries(mediaFeatureValues(candidate))
    .filter(([key, value]) => {
      const affinityKey = `${key}:${value}`;
      return value && profile?.weights.has(affinityKey) && profile.totals.get(affinityKey) > 0;
    })
    .map(([, value]) => value)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 2);
  return labels.length ? `Matches your recent ${labels.join(' and ')} choices for this workout.` : null;
}

function sessionMusicFit(candidate = {}, preference = '') {
  const requested = String(preference || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!requested) return null;
  const available = [
    candidate.genre,
    candidate.artist,
    candidate.mood,
    ...(Array.isArray(candidate.tags) ? candidate.tags : []),
    ...Object.values(mediaFeatureValues(candidate)),
  ].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const terms = requested.split(/\s+/).filter(Boolean);
  const availableTerms = new Set(available.split(/\s+/).filter(Boolean));
  return terms.filter((term) => availableTerms.has(term)).length / terms.length;
}

function workoutMusicFit(candidate = {}, workout = {}) {
  const energy = toNumber(candidate.energy, 0.55);
  const tempo = toNumber(candidate.tempo, 112);
  const mood = normalizeText(candidate.mood);
  const genre = normalizeText(candidate.genre);
  const sessionClass = workout.sessionClass || 'moderate_session';
  const moodFit = (moods) => moods.includes(mood) ? 1 : 0.45;
  const tempoFit = (target, range) => clamp01(1 - Math.abs(tempo - target) / range);
  const energyFit = (target, range) => clamp01(1 - Math.abs(energy - target) / range);

  if (sessionClass === 'long_endurance') {
    return energyFit(0.68, 0.48) * 0.4 + tempoFit(126, 48) * 0.35 + moodFit(['steady', 'smooth', 'uplifting', 'energetic']) * 0.25;
  }
  if (sessionClass === 'short_intense' || sessionClass === 'strength_recovery') {
    const genreFit = ['rock', 'hip-hop', 'electronic', 'dance'].includes(genre) ? 1 : 0.45;
    return energyFit(0.86, 0.4) * 0.35 + tempoFit(138, 52) * 0.25 + moodFit(['hype', 'intense', 'motivational', 'energetic']) * 0.25 + genreFit * 0.15;
  }
  if (sessionClass === 'light_recovery') {
    return energyFit(0.56, 0.45) * 0.4 + tempoFit(116, 52) * 0.3 + moodFit(['upbeat', 'smooth', 'uplifting', 'light', 'calm']) * 0.3;
  }
  if (workout.durationClass === 'short') {
    return energyFit(0.62, 0.48) * 0.4 + tempoFit(118, 52) * 0.35 + moodFit(['steady', 'upbeat', 'uplifting', 'energetic']) * 0.25;
  }
  if (workout.durationClass === 'medium') {
    return energyFit(0.66, 0.48) * 0.4 + tempoFit(122, 50) * 0.35 + moodFit(['steady', 'upbeat', 'uplifting', 'energetic']) * 0.25;
  }
  return 0.55;
}

function recencyDecay(daysAgo) {
  if (daysAgo <= 7) {
    return 1;
  }
  if (daysAgo <= 30) {
    return 0.6;
  }
  return 0.3;
}

function buildHistoryProfile(interactions = [], nowDate = new Date()) {
  const now = nowDate instanceof Date ? nowDate : new Date(nowDate || Date.now());
  const tokenScores = new Map();
  const itemScores = new Map();
  let maxTokenScore = 0;
  let maxItemScore = 0;

  interactions.forEach((row) => {
    const rowDate = row?.createdAt ? new Date(row.createdAt) : now;
    const daysAgo = Math.max(0, Math.floor((now.getTime() - rowDate.getTime()) / 86400000));
    const decay = recencyDecay(daysAgo);
    const selectionWeight = row.selected || POSITIVE_FEEDBACK_ACTIONS.has(normalizeText(row.action)) ? 1 : 0.35;
    const score = decay * selectionWeight;

    const itemId = String(row.itemId || '').trim();
    if (itemId) {
      const next = toNumber(itemScores.get(itemId), 0) + score;
      itemScores.set(itemId, next);
      if (next > maxItemScore) {
        maxItemScore = next;
      }
    }

    const tokens = buildTokenSet(`${row.title || ''} ${row.contextType || ''} ${row.contentType || ''}`);
    tokens.forEach((token) => {
      const next = toNumber(tokenScores.get(token), 0) + score;
      tokenScores.set(token, next);
      if (next > maxTokenScore) {
        maxTokenScore = next;
      }
    });
  });

  return {
    tokenScores,
    itemScores,
    maxTokenScore: maxTokenScore || 1,
    maxItemScore: maxItemScore || 1,
  };
}

function computeGenreMatch(candidate, preferences) {
  const genre = normalizeText(candidate.genre);
  const favorites = new Set((preferences.favoriteGenres || []).map(normalizeText));
  const disliked = new Set((preferences.dislikedGenres || []).map(normalizeText));

  if (disliked.has(genre)) {
    return 0;
  }
  if (favorites.has(genre)) {
    return 1;
  }
  if (!favorites.size) {
    return 0.65;
  }
  return 0.35;
}

function computeMoodMatch(candidate, preferences, contextType, activityType, workoutContext) {
  const mood = normalizeText(candidate.mood);
  const preferred = new Set((preferences.preferredMoods || []).map(normalizeText));
  const contextual = new Set(targetMoodForContext(contextType, activityType, workoutContext));

  let score = 0.45;
  if (!preferred.size && contextual.has(mood)) {
    score = 0.78;
  }
  if (preferred.has(mood)) {
    score = 1;
  }
  if (contextual.has(mood)) {
    score = Math.max(score, 0.82);
  }
  return clamp01(score);
}

function computeDurationFit(candidate, preferences, targetMinutes) {
  const preferredWatchTime = toNumber(preferences.typicalWatchTime, 45);
  const baseTargetMinutes = targetMinutes > 0 ? targetMinutes : preferredWatchTime;
  const candidateMinutes =
    candidate.type === 'song' ? toNumber(candidate.durationSeconds, 0) / 60 : toNumber(candidate.durationMinutes, 0);

  if (candidateMinutes <= 0) {
    return 0.4;
  }

  const deviation = Math.abs(candidateMinutes - baseTargetMinutes);
  return clamp01(1 - deviation / Math.max(baseTargetMinutes, 20));
}

function computeContextFit(candidate, contextType) {
  const normalizedContext = normalizeText(contextType);
  const tags = new Set((candidate.tags || []).map(normalizeText));

  if (!tags.size) {
    return 0.5;
  }

  if (tags.has(normalizedContext)) {
    return 1;
  }

  if (normalizedContext === 'eat_out' || normalizedContext === 'eat_in' || normalizedContext === 'while_eating') {
    if (tags.has('food') || tags.has('dinner') || tags.has('lunch') || tags.has('eat-in')) {
      return 0.85;
    }
  }

  if (normalizedContext === 'walking' || normalizedContext === 'pickup' || normalizedContext === 'go-there') {
    if (tags.has('walk') || tags.has('walking') || tags.has('pickup')) {
      return 0.9;
    }
  }

  if (normalizedContext === 'workout') {
    if (tags.has('workout') || tags.has('run') || tags.has('strength') || tags.has('cardio')) {
      return 0.92;
    }
  }

  return 0.52;
}

function computeTimeOfDayFit(candidate, timeOfDay) {
  const tags = new Set((candidate.tags || []).map(normalizeText));
  const current = normalizeText(timeOfDay);

  if (tags.has(current)) {
    return 1;
  }

  if (current === 'night' && tags.has('binge')) {
    return 0.86;
  }
  if (current === 'dinner' && (tags.has('dinner') || tags.has('cozy'))) {
    return 0.88;
  }
  if (current === 'lunch' && tags.has('quick')) {
    return 0.86;
  }

  return 0.58;
}

function computeHistorySimilarity(candidate, historyProfile) {
  const itemScore = toNumber(historyProfile.itemScores.get(candidate.id), 0);
  if (itemScore > 0) {
    return clamp01(itemScore / Math.max(historyProfile.maxItemScore, 1));
  }

  const tokens = buildTokenSet(`${candidate.title || ''} ${candidate.genre || ''} ${candidate.mood || ''}`);
  if (!tokens.length) {
    return 0.4;
  }

  const strongest = Math.max(
    0,
    ...tokens.map((token) => toNumber(historyProfile.tokenScores.get(token), 0))
  );
  if (strongest <= 0) {
    return 0.32;
  }

  return clamp01(strongest / Math.max(historyProfile.maxTokenScore, 1));
}

function computeActivityFit(
  candidate,
  contextType,
  activityType,
  etaMinutes,
  iotContext = {},
  recentBehaviorTrend = 0.5,
  workoutContext = null
) {
  const normalizedContext = normalizeText(contextType);
  const activity = normalizeText(activityType);
  const activityLevel = clamp01(toNumber(iotContext.activityLevelNormalized, recentBehaviorTrend));
  const todaySteps = Math.max(0, toNumber(iotContext.steps, 0));

  if (candidate.type === 'song') {
    const tempo = toNumber(candidate.tempo, 100);
    const durationMinutes = toNumber(candidate.durationSeconds, 0) / 60;
    const targetDuration = clamp(toNumber(etaMinutes, 0) || 20, 10, 75);

    if (normalizedContext === 'workout' || ['running', 'cardio', 'strength'].includes(activity)) {
      if (workoutContext) return workoutMusicFit(candidate, workoutContext);
      const baseTempoScore = clamp01((tempo - 90) / 65);
      const iotBoost = activityLevel < 0.35 ? clamp01((tempo - 105) / 55) : baseTempoScore;
      return clamp01(
        iotBoost * 0.74 +
          computeDurationFit(candidate, { typicalWatchTime: targetDuration }, targetDuration) * 0.26
      );
    }

    if (normalizedContext === 'walking' || normalizedContext === 'pickup' || normalizedContext === 'go-there') {
      const tempoFit = clamp01(1 - Math.abs(tempo - 112) / 70);
      const durationFit = clamp01(1 - Math.abs(durationMinutes - targetDuration) / Math.max(targetDuration, 12));
      const stepAdjustment = todaySteps > 7000 ? clamp01((tempo - 118) / 65) : clamp01(1 - Math.abs(tempo - 104) / 70);
      return clamp01(tempoFit * 0.45 + durationFit * 0.35 + stepAdjustment * 0.2);
    }

    return clamp01(1 - Math.abs(tempo - 100) / 90);
  }

  if (normalizedContext === 'eat_in' || normalizedContext === 'eat_out' || normalizedContext === 'while_eating') {
    const calmBias = activityLevel < 0.35 ? 0.88 : 0.78;
    return clamp01(calmBias);
  }

  return clamp01(0.45 + activityLevel * 0.35);
}

function computeModeScores(features) {
  const weights = {
    genre_preference_fit: { genreMatch: 0.58, historySimilarity: 0.2, contextFit: 0.22 },
    mood_fit: { moodMatch: 0.62, timeOfDayFit: 0.18, activityFit: 0.2 },
    duration_fit: { durationFit: 0.68, contextFit: 0.18, timeOfDayFit: 0.14 },
    time_of_day_fit: { timeOfDayFit: 0.7, moodMatch: 0.18, durationFit: 0.12 },
    history_similarity_fit: { historySimilarity: 0.66, genreMatch: 0.2, contextFit: 0.14 },
    activity_fit: { activityFit: 0.65, contextFit: 0.23, durationFit: 0.12 },
  };
  const scores = MODE_DEFINITIONS.map(mode => {
    const contributions = Object.fromEntries(Object.entries(weights[mode.id]).map(([key, weight]) => [key, features[key] * weight]));
    return { ...mode, contributions, score: Object.values(contributions).reduce((a, b) => a + b, 0) };
  }).sort((a, b) => b.score - a.score);
  return { winner: scores[0], backups: scores.slice(1, 3), all: scores };
}

function buildReason(winner, features, contextType) {
  const contextLabel = normalizeText(contextType).replace(/_/g, ' ') || 'current context';

  if (winner?.id === 'genre_preference_fit') {
    return `Best match for your preferred genres during ${contextLabel}.`;
  }
  if (winner?.id === 'mood_fit') {
    return `Mood-aligned pick for your ${contextLabel} routine.`;
  }
  if (winner?.id === 'duration_fit') {
    return 'Duration fits your current session window.';
  }
  if (winner?.id === 'time_of_day_fit') {
    return 'Strong time-of-day fit based on your usual pattern.';
  }
  if (winner?.id === 'history_similarity_fit') {
    return 'Closest match to what you selected recently.';
  }
  if (winner?.id === 'activity_fit') {
    return 'Best fit for your current activity intensity.';
  }

  if (features.contextFit >= 0.75) {
    return 'Strong context fit for your current lifestyle decision.';
  }

  return 'Balanced match for your current context and preferences.';
}

async function catalogForContext(contextType, options = {}) {
  const contentType = contextCandidateType(contextType);
  const poolSize = Number.isFinite(Number(options.candidatePoolSize))
    ? Number(options.candidatePoolSize)
    : 220;

  const mediaBundle = await candidateGenerationService.generateCandidates({
    domain: 'media',
    poolSize,
    context: {
      contextType,
      activityType: options.activityType,
      mealContext: options.mealContext,
      timeOfDay: options.timeOfDay,
      intent: options.intent || contextType,
    },
  });

  if (contentType === 'song') {
    return (mediaBundle?.groups?.songs || []).map((item) => ({
      id: item.id,
      type: 'song',
      title: item.title,
      artist: item.artist,
      genre: item.genre,
      mood: item.mood,
      tempo: item.tempo,
      energy: item.energy,
      durationSeconds: item.durationSeconds,
      tags: item.tags || [],
      sourceUrl: item.metadata?.sourceUrl || item.sourceUrl || null,
    }));
  }

  return (mediaBundle?.groups?.movies || []).map((item) => ({
    id: item.id,
    type: item.metadata?.type || item.type || 'movie',
    title: item.title,
    genre: item.genre,
    mood: item.mood,
    durationMinutes: item.durationMinutes,
    runtime: item.durationMinutes,
    rating: item.rating,
    tags: item.tags || [],
    sourceUrl: item.metadata?.sourceUrl || item.sourceUrl || null,
  }));
}

function defaultContentIfEmpty(contentType, contextType) {
  if (contentType === 'song') {
    return {
      primary: null,
      backups: [],
      recommendations: [],
      fallbackMessage: `No strong music match found for ${contextType}. Try broadening mood or genre preferences.`,
    };
  }

  return {
    primary: null,
    backups: [],
    recommendations: [],
    fallbackMessage: `No strong movie/show match found for ${contextType}. Try broadening your entertainment preferences.`,
  };
}

function normalizeCandidate(candidate, contentType) {
  if (contentType === 'song') {
    return {
      ...candidate,
      type: 'song',
      durationMinutes: round(toNumber(candidate.durationSeconds, 0) / 60, 2),
    };
  }

  return {
    ...candidate,
    type: candidate.type === 'movie' ? 'movie' : 'show',
    durationMinutes: toNumber(candidate.durationMinutes, 0),
  };
}

function dedupeContentRecommendations(items = [], contentType, limit = 10) {
  const seen = new Set();
  const deduped = [];

  items.forEach((item) => {
    const key =
      contentType === 'song'
        ? `${normalizeText(item.title)}::${normalizeText(item.artist)}`
        : normalizeText(item.title);

    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(item);
  });

  return deduped.slice(0, Math.max(5, limit));
}


function countByGenre(rows = []) {
  const counts = new Map();
  rows.forEach((row) => {
    const genre = normalizeText(row?.metadata?.genre || row?.metadata?.contentGenre || row?.genre || '');
    if (!genre) {
      return;
    }
    counts.set(genre, toNumber(counts.get(genre), 0) + 1);
  });
  return counts;
}

function topGenre(counts = new Map()) {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || null;
}

function buildPreferenceShiftNote(interactions = []) {
  const now = Date.now();
  const recentWindowMs = 14 * 24 * 3600 * 1000;
  const baselineWindowMs = 44 * 24 * 3600 * 1000;

  const selected = (Array.isArray(interactions) ? interactions : []).filter((row) =>
    POSITIVE_FEEDBACK_ACTIONS.has(normalizeFeedbackAction(row?.action))
  );

  const recent = selected.filter((row) => now - new Date(row?.createdAt || 0).getTime() <= recentWindowMs);
  const baseline = selected.filter((row) => {
    const age = now - new Date(row?.createdAt || 0).getTime();
    return age > recentWindowMs && age <= baselineWindowMs;
  });

  const recentTop = topGenre(countByGenre(recent));
  const baselineTop = topGenre(countByGenre(baseline));

  if (!recentTop && !baselineTop) {
    return 'Preference trend is still stabilizing.';
  }
  if (recentTop && baselineTop && recentTop !== baselineTop) {
    return `Preference shifted from ${baselineTop} to ${recentTop}.`;
  }
  if (recentTop) {
    return `Recent preference remains ${recentTop}.`;
  }
  return 'Preference trend is still stabilizing.';
}

async function getLearningVisibility(userId) {
  const interactions = await userContentInteractionModel.listInteractionsByUser(userId, 1200);
  const accepted = interactions.filter((row) =>
    POSITIVE_FEEDBACK_ACTIONS.has(normalizeFeedbackAction(row?.action))
  ).length;
  const ignored = interactions.filter((row) => normalizeFeedbackAction(row?.action) === 'not_interested').length;
  const dismissed = interactions.filter((row) => normalizeFeedbackAction(row?.action) === 'dismissed').length;
  const shown = interactions.filter((row) => normalizeFeedbackAction(row?.action) === 'shown').length;
  const totalActions = accepted + ignored + dismissed;
  const preferenceWeights = new Map();
  interactions.forEach((row) => {
    const actionWeight = feedbackUtility(row?.action);
    if (!actionWeight) return;
    const features = row.metadata?.mediaFeatures || {};
    [features.genre, mediaFeatureValues(features).artist, features.mood, features.energy >= 0.68 ? 'high energy' : '']
      .map(normalizeText)
      .filter(Boolean)
      .forEach((value) => preferenceWeights.set(value, toNumber(preferenceWeights.get(value), 0) + actionWeight));
  });

  return {
    acceptedItems: accepted,
    ignoredItems: ignored,
    dismissedItems: dismissed,
    shownItems: shown,
    acceptanceRatePct: totalActions > 0 ? round((accepted / totalActions) * 100, 1) : 0,
    ignoreRatePct: totalActions > 0 ? round((ignored / totalActions) * 100, 1) : 0,
    preferenceShift: buildPreferenceShiftNote(interactions),
    preferences: [...preferenceWeights.entries()]
      .filter(([, weight]) => weight >= 0.7)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, weight]) => ({ label, weight: round(weight, 1) })),
  };
}

function normalizePublicContentItem(item, fallbackType) {
  const isSong = fallbackType === 'song' || normalizeText(item?.type) === 'song';
  const confidenceRaw =
    item?.confidencePct !== undefined
      ? Number(item.confidencePct)
      : Number(item?.confidence !== undefined ? item.confidence * 100 : item?.probability || 0);
  const confidencePct = clamp(toNumber(confidenceRaw, 78), 0, 100);
  const topFactors = normalizeFeatureContributions(item?.topFactors || []).slice(0, 3);
  const safeTitle = String(item?.title || (isSong ? 'Recommended song' : 'Recommended movie')).trim();

  const base = {
    id: String(item?.id || `${isSong ? 'song' : 'movie'}-${randomUUID()}`).trim(),
    title: safeTitle,
    type: isSong ? 'song' : 'movie',
    genre: String(item?.genre || (isSong ? 'mixed' : 'general')).trim(),
    reason: String(item?.reason || 'Strong fit for your current context and preferences.').trim(),
    confidence: round(confidencePct, 1),
    confidencePct: round(confidencePct, 1),
    sourceUrl:
      item?.sourceUrl ||
      `https://www.google.com/search?q=${encodeURIComponent(`${safeTitle} ${isSong ? 'song' : 'movie'}`)}`,
    topFactors,
    imageUrl: item?.imageUrl || item?.posterUrl || item?.artworkUrl || null,
    mood: String(item?.mood || '').trim(),
    energy: isSong ? toNumber(item?.energy, 0) : undefined,
    tempo: isSong ? toNumber(item?.tempo, 0) : undefined,
    durationSeconds: isSong ? toNumber(item?.durationSeconds, 0) : undefined,
    tags: Array.isArray(item?.tags) ? item.tags : [],
    features: item?.features || {},
    context: item?.context || {},
    contextType: item?.context?.contextType || item?.contextType || null,
    recommendation: item?.recommendation,
  };

  if (isSong) {
    return {
      ...base,
      artist: String(item?.artist || 'Curated').trim(),
    };
  }

  return base;
}

function buildFallbackCollection(contextType) {
  return {
    movies: FALLBACK_MOVIES.map((item, index) =>
      normalizePublicContentItem(
        {
          ...item,
          type: 'movie',
          reason: `Reliable fallback pick for ${normalizeText(contextType || 'meal')} context.`,
          confidencePct: 76 - index * 3,
        },
        'movie'
      )
    ),
    songs: FALLBACK_SONGS.map((item, index) =>
      normalizePublicContentItem(
        {
          ...item,
          type: 'song',
          reason: `Reliable fallback track for ${normalizeText(contextType || 'walking')} context.`,
          confidencePct: 78 - index * 3,
        },
        'song'
      )
    ),
  };
}

async function scoreCandidates({
  user,
  contextType,
  activityType,
  timeOfDay,
  dayOfWeek,
  etaMinutes,
  sessionMinutes,
  durationMinutes,
  limit = 8,
  candidatePoolSize = 220,
  iotContext = null,
  recentBehaviorTrend = 0.5,
  intensity = null,
  sessionClass = null,
  workoutContext: suppliedWorkoutContext = null,
  sessionIntent = null,
}) {
  const contentType = contextCandidateType(contextType);
  const workoutContext = contentType === 'song' && normalizeText(contextType) === 'workout'
    ? {
      ...(suppliedWorkoutContext || crossDomainMappingService.buildWorkoutContext({
      workoutType: activityType,
      intensity,
      durationMinutes: durationMinutes || sessionMinutes,
      })),
      ...crossDomainMappingService.normalizeSessionIntent({ ...(suppliedWorkoutContext || {}), ...(sessionIntent || {}) }),
    }
    : null;
  if (workoutContext && sessionClass) workoutContext.sessionClass = sessionClass;
  const catalog = (await catalogForContext(contextType, {
    candidatePoolSize,
    activityType,
    mealContext: contextType,
    timeOfDay,
  })).map((item) => normalizeCandidate(item, contentType));

  if (!catalog.length) {
    return defaultContentIfEmpty(contentType, contextType);
  }

  const preferences = normalizeContentPreferences(user?.contentPreferences || createDefaultContentPreferences());
  const interactions = await userContentInteractionModel.listInteractionsByUser(user.id, 800);
  const suppression = buildContentSuppressionState(interactions, contentType);
  const eligibleCatalog = filterSuppressedContent(catalog, contentType, suppression);
  if (!eligibleCatalog.length) {
    return defaultContentIfEmpty(contentType, contextType);
  }
  const legacyInteractions = interactions.filter(row => !row.metadata?.adaptive);
  const historyProfile = buildHistoryProfile(legacyInteractions, new Date());
  const learnedProfile = buildMediaPreferenceProfile(interactions, contentType, contextType, workoutContext);
  const legacyProfile = buildMediaPreferenceProfile(legacyInteractions, contentType, contextType, workoutContext);
  const targetDuration = contextDefaultDuration(contextType, {
    etaMinutes,
    sessionMinutes,
    durationMinutes,
  });

  const scored = eligibleCatalog.map((candidate) => {
    const features = {
      genreMatch: computeGenreMatch(candidate, preferences),
      moodMatch: computeMoodMatch(candidate, preferences, contextType, activityType, workoutContext),
      durationFit: workoutContext && contentType === 'song'
        ? 0.75
        : computeDurationFit(candidate, preferences, targetDuration),
      contextFit: computeContextFit(candidate, contextType),
      timeOfDayFit: computeTimeOfDayFit(candidate, timeOfDay),
      historySimilarity: computeHistorySimilarity(candidate, historyProfile),
      activityFit: computeActivityFit(
        candidate,
        contextType,
        activityType,
        etaMinutes,
        iotContext || {},
        recentBehaviorTrend,
        workoutContext
      ),
      learnedPreferenceFit: contentType === 'song' ? learnedMediaFit(candidate, learnedProfile) : null,
      sessionIntentFit: contentType === 'song' ? sessionMusicFit(candidate, workoutContext?.musicPreference) : null,
    };

    const modeScores = computeModeScores(features);
    const averageModeScore =
      modeScores.all.reduce((sum, item) => sum + Number(item.score || 0), 0) /
      Math.max(modeScores.all.length, 1);
    const baseHeuristic = clamp01(modeScores.winner.score * 0.72 + averageModeScore * 0.28);
    const intentAdjusted = features.sessionIntentFit == null
      ? baseHeuristic
      : clamp01(baseHeuristic * 0.62 + features.sessionIntentFit * 0.38);
    const legacyFit = contentType === 'song' ? learnedMediaFit(candidate, legacyProfile) : null;
    const heuristic = legacyFit == null
      ? intentAdjusted
      : clamp01(intentAdjusted * 0.76 + legacyFit * 0.24);

    const blended = heuristic;
    const intentScale = features.sessionIntentFit == null ? 1 : 0.62;
    const legacyScale = legacyFit == null ? 1 : 0.76;
    const contributions = {};
    for (const mode of modeScores.all) {
      const weight = (mode === modeScores.winner ? 0.72 : 0) + 0.28 / modeScores.all.length;
      for (const [key, value] of Object.entries(mode.contributions)) {
        contributions[key] = (contributions[key] || 0) + value * weight * intentScale * legacyScale;
      }
    }
    const contextContribution = contributions.contextFit + (features.sessionIntentFit == null ? 0 : features.sessionIntentFit * 0.38 * legacyScale);
    const scoreTrace = {
      baseScore: blended,
      baseRelevance: contributions.durationFit + contributions.timeOfDayFit,
      preferenceContribution: contributions.genreMatch + contributions.moodMatch,
      feedbackContribution: contributions.historySimilarity + (legacyFit == null ? 0 : legacyFit * 0.24),
      contextContribution: contextContribution + (workoutContext?.sourceTimestamp ? 0 : contributions.activityFit),
      crossDomainContextContribution: workoutContext?.sourceTimestamp ? contributions.activityFit : 0,
    };
    const normalizedTopFactors = normalizeFeatureContributions(
      Object.entries(contributions).map(([name, contribution]) => ({ name, contribution }))
    ).sort((a, b) => b.contribution - a.contribution).slice(0, 3);

    const preferenceReason = learnedMediaReason(candidate, legacyProfile);
    const intentReason = features.sessionIntentFit >= 0.75
      ? `${workoutContext.musicPreference} matches what you asked for this session.`
      : null;
    const reason = intentReason
      ? `${intentReason} Workout context also shaped the ranking.`
      : legacyFit >= 0.65 && preferenceReason
        ? preferenceReason
      : workoutContext?.sessionClass === 'long_endurance'
        ? 'Long-endurance workout context contributed to this ranking.'
        : workoutContext?.sessionClass === 'short_intense'
          ? 'Short, intense workout context contributed to this ranking.'
          : workoutContext?.sessionClass === 'strength_recovery'
            ? 'Strength-training context contributed to this ranking.'
            : workoutContext?.sessionClass === 'light_recovery'
              ? 'Walking or recovery context contributed to this ranking.'
              : buildReason(modeScores.winner, features, contextType);

    return {
      ...candidate,
      score: round(blended * 100, 2),
      confidence: round(blended, 4),
      confidencePct: round(blended * 100, 1),
      scoreTrace,
      reason,
      topFactors: normalizedTopFactors,
      features,
      winnerMode: modeScores.winner,
      backupModes: modeScores.backups,
      context: {
        contextType,
        timeOfDay,
        dayOfWeek,
        activityType: activityType || null,
        intensity: workoutContext?.intensity || null,
        durationMinutes: workoutContext?.durationMinutes || null,
        sessionClass: workoutContext?.sessionClass || null,
      },
    };
  });

  const unifiedRanked = recommendationService.rankWithUnifiedPipeline(
    scored.map((item) => ({
      ...item,
      recommendation: {
        score: item.score,
        scoreTrace: item.scoreTrace,
        probability: item.probability,
        reason: item.reason,
        topFeatures: item.topFactors,
      },
    })),
    {
      modelVariant: 'contextual_prior',
      getHeuristicScore: (candidate) => toNumber(candidate.score, 0) / 100,
      getMlScore: (candidate) => toNumber(candidate.probability, 0),
      getReason: (candidate) => candidate.reason,
      getTopFactors: (candidate) => candidate.topFactors || [],
      blend: (heuristicScore) => heuristicScore,
    }
  );

  const normalizedRanked = unifiedRanked.map((item) => ({
    ...item,
    score: item.recommendation?.score ?? item.score,
    confidence: item.recommendation?.confidence ?? item.confidence,
    confidencePct: item.recommendation?.confidencePct ?? item.confidencePct,
    probability: item.recommendation?.probability ?? item.probability,
    reason: item.recommendation?.reason ?? item.reason,
    topFactors: item.recommendation?.topFeatures ?? item.topFactors,
  }));

  const dedupedRanked = dedupeContentRecommendations(
    normalizedRanked,
    contentType,
    normalizedRanked.length
  );
  const multiCandidateRanked = multiCandidateService.generateCandidates(dedupedRanked, {
    domain: 'content',
    intent: contextType,
    perMode: 2,
    maxPool: dedupedRanked.length,
  });
  const banditRanked = banditDecisionService.rankCandidatesWithBandit(multiCandidateRanked, {
    domain: 'content',
    userId: user?.id,
    contextType,
    policyState: await banditDecisionService.getPolicy(user.id, 'media'),
    crossDomainSignals: crossDomainMappingService.contextProvenance('fitness', 'media', workoutContext,
      'Current activity and duration inform the music context.', { activityType, sessionClass: workoutContext?.sessionClass }),
  });
  const explainedRanked = explanationService
    .enrichRecommendationList(banditRanked, {
      preserveReason: true,
      fallbackReason: 'Strong content fit for your current context.',
    });
  const recommendations = dedupeContentRecommendations(explainedRanked, contentType, Math.max(5, limit));

  return {
    contentType,
    recommendations,
    primary: recommendations[0] || null,
    backups: recommendations.slice(1, 3),
    model: {
      variant: 'contextual_prior_with_linucb',
      policyVersion: banditDecisionService.POLICY_VERSION,
      explorationBonusLimit: banditDecisionService.ALPHA,
    },
  };
}

async function maybeLogImpressions(userId, contextType, recommendations = [], options = {}) {
  if (options.deferImpressions) return;
  await banditDecisionService.logImpressions(userId, 'media', recommendations, { contextType, workoutContext: options.workoutContext });
}

async function getContextualRecommendations(user, options = {}) {
  const contextType = normalizeText(options.contextType || 'relaxing') || 'relaxing';
  const now = options.nowDate ? new Date(options.nowDate) : new Date();
  const timeOfDay = options.timeOfDay || inferTimeOfDay(now);
  const dayOfWeek = Number.isFinite(Number(options.dayOfWeek)) ? Number(options.dayOfWeek) : now.getDay();
  const iotContext =
    options.iotContext ||
    (user?.id ? await iotService.getIoTContext(user.id, { user }) : null);
  const recentBehaviorTrend = clamp01(
    toNumber(options.recentBehaviorTrend, iotContext?.activityLevelNormalized ?? 0.5)
  );
  const workoutContext = contextType === 'workout'
    ? {
      ...(options.workoutContext || crossDomainMappingService.buildWorkoutContext({
        workoutType: options.activityType,
        intensity: options.intensity,
        durationMinutes: options.durationMinutes,
        createdAt: now.toISOString(),
      })),
      ...crossDomainMappingService.normalizeSessionIntent({ ...(options.workoutContext || {}), ...options }),
    }
    : null;

  const result = await scoreCandidates({
    user,
    contextType,
    activityType: options.activityType,
    timeOfDay,
    dayOfWeek,
    etaMinutes: options.etaMinutes,
    sessionMinutes: options.sessionMinutes,
    durationMinutes: options.durationMinutes,
    intensity: options.intensity,
    sessionClass: options.sessionClass,
    workoutContext,
    sessionIntent: crossDomainMappingService.normalizeSessionIntent({
      ...(workoutContext || {}),
      ...(options.sessionIntent || {}),
      ...options,
    }),
    limit: options.limit || 8,
    candidatePoolSize: options.candidatePoolSize || 220,
    iotContext,
    recentBehaviorTrend,
  });

  if (!result.recommendations?.length) {
    return {
      contextType,
      ...defaultContentIfEmpty(contextCandidateType(contextType), contextType),
    };
  }

  await maybeLogImpressions(user.id, contextType, result.recommendations, {
    ...options,
    nowDate: now,
    modelVariant: result.model?.variant,
    workoutContext,
  });

  return {
    contextType,
    contentType: result.contentType,
    primary: result.primary,
    backups: result.backups,
    recommendations: result.recommendations,
    workoutContext,
    model: result.model,
    learning: options.includeLearning ? await getLearningVisibility(user.id) : null,
  };
}

async function getContextBundle(user, contexts = [], options = {}) {
  const entries = await Promise.all(
    contexts.map(async (context) => {
      const key = context.key;
      const recommendation = await getContextualRecommendations(user, {
        ...options,
        ...context,
      });
      return [key, recommendation];
    })
  );

  return Object.fromEntries(entries);
}

function normalizeNonEmptyList(list = [], fallbackType) {
  return (Array.isArray(list) ? list : [])
    .map((item) => normalizePublicContentItem(item, fallbackType))
    .filter((item) => item.id && item.title);
}

async function getUnifiedRecommendations(user, options = {}) {
  const requestedContext = normalizeText(options.contextType || '');
  const fallback = buildFallbackCollection(requestedContext || 'daily');
  const inferredType = contextCandidateType(requestedContext || 'eat_in');
  const recentInteractions = await userContentInteractionModel.listInteractionsByUser(user.id, 800);
  const movieSuppression = buildContentSuppressionState(recentInteractions, 'movie');
  const songSuppression = buildContentSuppressionState(recentInteractions, 'song');

  const movieContextType =
    normalizeText(options.movieContextType) ||
    (inferredType === 'movie' && requestedContext ? requestedContext : 'eat_in');
  const songContextType =
    normalizeText(options.songContextType) ||
    (inferredType === 'song' && requestedContext ? requestedContext : 'walking');

  const [movieResult, songResult] = await Promise.allSettled([
    getContextualRecommendations(user, {
      ...options,
      contextType: movieContextType,
      limit: options.movieLimit || 8,
      deferImpressions: true,
    }),
    getContextualRecommendations(user, {
      ...options,
      contextType: songContextType,
      activityType: options.activityType || 'walking',
      limit: options.songLimit || 8,
      deferImpressions: true,
    }),
  ]);

  const moviesFromModel =
    movieResult.status === 'fulfilled'
      ? normalizeNonEmptyList(movieResult.value?.recommendations || [], 'movie')
      : [];
  const songsFromModel =
    songResult.status === 'fulfilled'
      ? normalizeNonEmptyList(songResult.value?.recommendations || [], 'song')
      : [];

  const movieLimit = Math.max(5, Number(options.movieLimit || 8));
  const songLimit = Math.max(5, Number(options.songLimit || 8));

  const filteredMoviesModel = filterSuppressedContent(moviesFromModel, 'movie', movieSuppression);
  const filteredSongsModel = filterSuppressedContent(songsFromModel, 'song', songSuppression);
  const filteredMovieFallback = filterSuppressedContent(fallback.movies, 'movie', movieSuppression);
  const filteredSongFallback = filterSuppressedContent(fallback.songs, 'song', songSuppression);

  const moviesPool = filteredMoviesModel.length
    ? filteredMoviesModel
    : filteredMovieFallback.length
      ? filteredMovieFallback
      : [];
  const songsPool = filteredSongsModel.length
    ? filteredSongsModel
    : filteredSongFallback.length
      ? filteredSongFallback
      : [];

  const movies = dedupeContentRecommendations(moviesPool, 'movie', movieLimit).slice(0, movieLimit);
  const songs = dedupeContentRecommendations(songsPool, 'song', songLimit).slice(0, songLimit);
  for (const [items, contextType] of [[movies, movieContextType], [songs, songContextType]]) {
    if (items.length && !items[0].recommendation?.policyFeatures) {
      const ranked = banditDecisionService.rankCandidatesWithBandit(items.map(item => ({
        ...item, recommendation: { confidence: item.confidencePct / 100 },
      })), { domain: 'media', policyState: await banditDecisionService.getPolicy(user.id, 'media') });
      items.splice(0, items.length, ...ranked);
    }
    if (!options.deferImpressions) await banditDecisionService.logImpressions(user.id, 'media', items, { contextType });
  }
  const learning = await getLearningVisibility(user.id);

  return {
    movies,
    songs,
    contexts: {
      movies: movieContextType,
      songs: songContextType,
    },
    model: {
      movies: movieResult.status === 'fulfilled' ? movieResult.value?.model || null : null,
      songs: songResult.status === 'fulfilled' ? songResult.value?.model || null : null,
    },
    fallbackUsed: {
      movies: moviesFromModel.length === 0,
      songs: songsFromModel.length === 0,
    },
    learning,
    generatedAt: new Date().toISOString(),
  };
}

async function recordContentFeedback(userId, payload = {}) {
  const action = normalizeFeedbackAction(payload.action);
  const selected = POSITIVE_FEEDBACK_ACTIONS.has(action);
  const now = new Date(payload.timestamp || Date.now());
  const timeOfDay = inferTimeOfDay(now);

  const recent = await userContentInteractionModel.listInteractionsByUser(userId, 400);
  let matchedShown = recent.find(
    (row) =>
      normalizeText(row.action) === 'shown' &&
      String(row.itemId || '').trim() === String(payload.itemId || '').trim() &&
      normalizeText(row.contextType) === normalizeText(payload.contextType)
  );

  const eventModel = require('../models/recommendationInteractionModel');
  const event = payload.recommendationEventId
    ? await eventModel.findInteraction(userId, payload.recommendationEventId)
    : null;
  if (event?.context?.candidate) {
    matchedShown = { id: event.id, itemId: event.candidateId, title: event.context.candidate.title,
      contextType: event.context.contextType, features: event.context.candidate.features,
      metadata: { mediaFeatures: event.context.candidate } };
  }

  const features = matchedShown?.features || {
    genreMatch: clamp01(payload.features?.genreMatch),
    moodMatch: clamp01(payload.features?.moodMatch),
    durationFit: clamp01(payload.features?.durationFit),
    contextFit: clamp01(payload.features?.contextFit),
    timeOfDayFit: clamp01(payload.features?.timeOfDayFit),
    historySimilarity: clamp01(payload.features?.historySimilarity),
    activityFit: clamp01(payload.features?.activityFit),
  };
  const shownMediaFeatures = matchedShown?.metadata?.mediaFeatures || {};
  const mediaFeatures = {
    genre: payload.genre || shownMediaFeatures.genre || null,
    artist: payload.artist || shownMediaFeatures.artist || null,
    mood: payload.mood || shownMediaFeatures.mood || null,
    energy: toNumber(payload.energy ?? shownMediaFeatures.energy, 0),
    tempo: toNumber(payload.tempo ?? shownMediaFeatures.tempo, 0),
    durationSeconds: toNumber(payload.durationSeconds ?? shownMediaFeatures.durationSeconds, 0),
    tags: Array.isArray(payload.tags) ? payload.tags : shownMediaFeatures.tags || [],
    activityType: payload.activityType || shownMediaFeatures.activityType || null,
    intensity: payload.intensity || shownMediaFeatures.intensity || null,
    durationMinutes: toNumber(payload.durationMinutes ?? shownMediaFeatures.durationMinutes, 0),
    sessionClass: payload.sessionClass || shownMediaFeatures.sessionClass || null,
  };

  const recorded = await feedbackLearningService.recordDomainFeedback(userId, {
    id: randomUUID(),
    recommendationEventId: payload.recommendationEventId,
    domain: 'media',
    contentType: payload.contentType === 'song' ? 'song' : 'movie',
    itemId: String(payload.itemId || matchedShown?.itemId || '').trim(),
    title: String(payload.title || matchedShown?.title || 'Content recommendation').trim(),
    contextType: String(payload.contextType || matchedShown?.contextType || 'relaxing').trim(),
    timeOfDay,
    dayOfWeek: now.getDay(),
    action,
    score: Number(payload.score || matchedShown?.score || 0),
    confidence: Number(payload.confidence || matchedShown?.confidence || 0),
    features,
    metadata: {
      source: 'feedback',
      reason: payload.reason || null,
      matchedShownId: matchedShown?.id || null,
      mediaFeatures,
    },
    timestamp: now.toISOString(),
  });


  return {
    recorded: true,
    feedbackEventId: recorded.id,
    recommendationEventId: recorded.metadata?.adaptive?.recommendationEventId || null,
    action,
    selected,
  };
}

function normalizeSavedContentPayload(payload = {}) {
  const contentType = normalizeContentType(payload.contentType || payload.type, 'movie');
  const itemId = String(payload.itemId || payload.id || '').trim();
  const title = String(payload.title || '').trim();
  if (!itemId || !title) {
    return null;
  }

  return {
    id: `${contentType}-${itemId}`,
    itemId,
    contentType,
    title,
    artist: contentType === 'song' ? String(payload.artist || '').trim() : '',
    genre: String(payload.genre || '').trim(),
    mood: String(payload.mood || '').trim(),
    energy: toNumber(payload.energy, 0),
    tempo: toNumber(payload.tempo, 0),
    durationSeconds: toNumber(payload.durationSeconds, 0),
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    imageUrl: String(payload.imageUrl || '').trim(),
    activityType: String(payload.activityType || '').trim(),
    intensity: String(payload.intensity || '').trim(),
    durationMinutes: toNumber(payload.durationMinutes, 0),
    sessionClass: String(payload.sessionClass || '').trim(),
    reason: String(payload.reason || '').trim(),
    confidencePct: round(
      clamp(
        toNumber(
          payload.confidencePct !== undefined
            ? payload.confidencePct
            : payload.confidence !== undefined
              ? normalizeContributionPercent(payload.confidence) * 100
              : 0,
          0
        ),
        0,
        100
      ),
      1
    ),
    sourceUrl:
      payload.sourceUrl ||
      `https://www.google.com/search?q=${encodeURIComponent(`${title} ${contentType === 'song' ? 'song' : 'show'}`)}`,
    contextType: String(payload.contextType || '').trim(),
    savedAt: new Date().toISOString(),
  };
}

async function saveContentForLater(userId, payload = {}) {
  const user = await userService.getUserOrThrow(userId);
  const normalized = normalizeSavedContentPayload(payload);
  if (!normalized) {
    return {
      saved: false,
      message: 'itemId and title are required to save content.',
      items: Array.isArray(user.savedContent) ? user.savedContent : [],
      total: Array.isArray(user.savedContent) ? user.savedContent.length : 0,
    };
  }

  const existing = Array.isArray(user.savedContent) ? user.savedContent : [];
  const nextItems = [
    normalized,
    ...existing.filter(
      (item) =>
        !(
          normalizeText(item?.itemId) === normalizeText(normalized.itemId) &&
          normalizeContentType(item?.contentType, 'movie') === normalized.contentType
        )
    ),
  ].slice(0, CONTENT_SAVE_LIMIT);

  await userService.updateUser(userId, {
    savedContent: nextItems,
  });

  await recordContentFeedback(userId, {
    ...payload,
    itemId: normalized.itemId,
    title: normalized.title,
    contentType: normalized.contentType,
    contextType: normalized.contextType || payload.contextType || 'relaxing',
    action: 'save',
    confidence: normalized.confidencePct / 100,
  });

  return {
    saved: true,
    item: normalized,
    items: nextItems,
    total: nextItems.length,
  };
}

async function getSavedContent(userId, options = {}) {
  const user = await userService.getUserOrThrow(userId);
  const limit = clamp(toNumber(options.limit, 20), 1, 100);
  const contentType = normalizeText(options.contentType || '');
  const items = (Array.isArray(user.savedContent) ? user.savedContent : [])
    .filter((item) => !contentType || normalizeContentType(item?.contentType, 'movie') === contentType)
    .sort((a, b) => new Date(b?.savedAt || 0) - new Date(a?.savedAt || 0));

  return {
    items: items.slice(0, limit),
    total: items.length,
  };
}

module.exports = {
  getContextualRecommendations,
  getContextBundle,
  getUnifiedRecommendations,
  recordContentFeedback,
  saveContentForLater,
  getSavedContent,
  buildMediaPreferenceProfile,
  learnedMediaFit,
  workoutMusicFit,
};
