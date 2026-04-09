const { randomUUID } = require('crypto');
const userContentInteractionModel = require('../models/userContentInteractionModel');
const userService = require('./userService');
const featureService = require('./featureService');
const mlModelService = require('./mlModelService');
const recommendationService = require('./recommendationService');
const iotService = require('./iotService');
const multiCandidateService = require('./multiCandidateService');
const crossDomainSequenceService = require('./crossDomainSequenceService');
const banditDecisionService = require('./banditDecisionService');
const explanationService = require('./explanationService');
const movieDataProvider = require('./dataProviders/movieDataProvider');
const songDataProvider = require('./dataProviders/songDataProvider');
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

function deterministicRandom(seedText = '') {
  let hash = 0;
  const seed = String(seedText || '');
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

function shuffleDeterministically(list = [], seedText = '') {
  const seeded = (Array.isArray(list) ? list : []).map((item, index) => ({
    item,
    score: deterministicRandom(`${seedText}:${item?.id || item?.title || index}:${index}`),
  }));

  return seeded.sort((a, b) => a.score - b.score).map((entry) => entry.item);
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

function targetMoodForContext(contextType, activityType) {
  const normalized = normalizeText(contextType);
  const activity = normalizeText(activityType);

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

function computeMoodMatch(candidate, preferences, contextType, activityType) {
  const mood = normalizeText(candidate.mood);
  const preferred = new Set((preferences.preferredMoods || []).map(normalizeText));
  const contextual = new Set(targetMoodForContext(contextType, activityType));

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
  recentBehaviorTrend = 0.5
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
  const scores = MODE_DEFINITIONS.map((mode) => {
    let score = 0;

    if (mode.id === 'genre_preference_fit') {
      score = features.genreMatch * 0.58 + features.historySimilarity * 0.2 + features.contextFit * 0.22;
    }
    if (mode.id === 'mood_fit') {
      score = features.moodMatch * 0.62 + features.timeOfDayFit * 0.18 + features.activityFit * 0.2;
    }
    if (mode.id === 'duration_fit') {
      score = features.durationFit * 0.68 + features.contextFit * 0.18 + features.timeOfDayFit * 0.14;
    }
    if (mode.id === 'time_of_day_fit') {
      score = features.timeOfDayFit * 0.7 + features.moodMatch * 0.18 + features.durationFit * 0.12;
    }
    if (mode.id === 'history_similarity_fit') {
      score = features.historySimilarity * 0.66 + features.genreMatch * 0.2 + features.contextFit * 0.14;
    }
    if (mode.id === 'activity_fit') {
      score = features.activityFit * 0.65 + features.contextFit * 0.23 + features.durationFit * 0.12;
    }

    return {
      ...mode,
      score: clamp01(score),
    };
  }).sort((a, b) => b.score - a.score);

  return {
    winner: scores[0],
    backups: scores.slice(1, 3),
    all: scores,
  };
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
  const limit = Number.isFinite(Number(options.candidatePoolSize))
    ? Number(options.candidatePoolSize)
    : 220;

  if (contentType === 'song') {
    return songDataProvider.getSongs({
      limit,
      contextType,
      activityType: options.activityType,
      mealContext: options.mealContext,
      timeOfDay: options.timeOfDay,
    });
  }

  return movieDataProvider.getMovies({
    limit,
    contextType,
    activityType: options.activityType,
    mealContext: options.mealContext,
    timeOfDay: options.timeOfDay,
  });
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

function withExplorationMix(items = [], limit = 8, options = {}) {
  const ranked = Array.isArray(items) ? items : [];
  const safeLimit = Math.max(1, toNumber(limit, 8));
  if (!ranked.length) {
    return [];
  }

  const exploitCount = Math.max(1, Math.round(safeLimit * 0.8));
  const exploreCount = Math.max(0, safeLimit - exploitCount);
  const top = ranked.slice(0, exploitCount);
  const tail = ranked.slice(exploitCount);

  const seed = `${options.userId || 'anon'}:${options.contextType || 'daily'}:${new Date()
    .toISOString()
    .slice(0, 13)}`;
  const explorationPicks = shuffleDeterministically(tail, seed).slice(0, exploreCount);

  const combined = [...top, ...explorationPicks];
  return combined.map((item, index) => ({
    ...item,
    recommendation: {
      ...(item.recommendation || {}),
      rank: index + 1,
      winnerTakeAllSelected: index === 0,
      explorationSelected: index >= top.length,
    },
  }));
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

  return {
    acceptedItems: accepted,
    ignoredItems: ignored,
    dismissedItems: dismissed,
    shownItems: shown,
    acceptanceRatePct: totalActions > 0 ? round((accepted / totalActions) * 100, 1) : 0,
    ignoreRatePct: totalActions > 0 ? round((ignored / totalActions) * 100, 1) : 0,
    preferenceShift: buildPreferenceShiftNote(interactions),
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
    contextType: item?.context?.contextType || item?.contextType || null,
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
}) {
  const contentType = contextCandidateType(contextType);
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
  const historyProfile = buildHistoryProfile(interactions, new Date());
  const targetDuration = contextDefaultDuration(contextType, {
    etaMinutes,
    sessionMinutes,
    durationMinutes,
  });

  const contentModel = await mlModelService.getUserContentModel(user);
  const scored = eligibleCatalog.map((candidate) => {
    const features = {
      genreMatch: computeGenreMatch(candidate, preferences),
      moodMatch: computeMoodMatch(candidate, preferences, contextType, activityType),
      durationFit: computeDurationFit(candidate, preferences, targetDuration),
      contextFit: computeContextFit(candidate, contextType),
      timeOfDayFit: computeTimeOfDayFit(candidate, timeOfDay),
      historySimilarity: computeHistorySimilarity(candidate, historyProfile),
      activityFit: computeActivityFit(
        candidate,
        contextType,
        activityType,
        etaMinutes,
        iotContext || {},
        recentBehaviorTrend
      ),
    };

    const modeScores = computeModeScores(features);
    const averageModeScore =
      modeScores.all.reduce((sum, item) => sum + Number(item.score || 0), 0) /
      Math.max(modeScores.all.length, 1);
    const heuristic = clamp01(modeScores.winner.score * 0.72 + averageModeScore * 0.28);

    const probability = mlModelService.predictContentScore(
      features,
      contentModel.weights,
      contentModel.featureStats
    );

    const blended = contentModel.coldStart
      ? clamp01(heuristic * 0.82 + probability * 0.18)
      : clamp01(heuristic * 0.58 + probability * 0.42);

    const normalizedFeatures = featureService.normalizeContentFeatures(features, contentModel.featureStats);
    const topFactors = featureService.CONTENT_FEATURE_KEYS.map((key, index) => ({
      name: key,
      contribution: Math.abs(
        round(toNumber(contentModel.weights[index + 1], 0) * toNumber(normalizedFeatures[key], 0), 4)
      ),
    }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3)
      .map((factor) => ({
        ...factor,
        contribution: round(Math.abs(factor.contribution), 4),
      }));
    const normalizedTopFactors = normalizeFeatureContributions(topFactors).slice(0, 3);

    const reason = buildReason(modeScores.winner, features, contextType);

    return {
      ...candidate,
      score: round(blended * 100, 2),
      confidence: round(blended, 4),
      confidencePct: round(blended * 100, 1),
      probability: round(probability, 4),
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
      },
    };
  });

  const unifiedRanked = recommendationService.rankWithUnifiedPipeline(
    scored.map((item) => ({
      ...item,
      recommendation: {
        score: item.score,
        probability: item.probability,
        reason: item.reason,
        topFeatures: item.topFactors,
      },
    })),
    {
      modelVariant: contentModel.coldStart ? 'heuristic' : 'ml',
      getHeuristicScore: (candidate) => toNumber(candidate.score, 0) / 100,
      getMlScore: (candidate) => toNumber(candidate.probability, 0),
      getReason: (candidate) => candidate.reason,
      getTopFactors: (candidate) => candidate.topFactors || [],
      blend: (heuristicScore, mlScore) =>
        contentModel.coldStart
          ? clamp01(heuristicScore * 0.82 + mlScore * 0.18)
          : clamp01(heuristicScore * 0.58 + mlScore * 0.42),
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
    Math.max(5, limit)
  );
  const multiCandidateRanked = multiCandidateService.generateCandidates(dedupedRanked, {
    domain: 'content',
    intent: contextType,
    perMode: 2,
    maxPool: Math.max(12, Math.max(5, limit) * 3),
  });
  const sequenceState = crossDomainSequenceService.buildSequenceState({
    intent: contextType,
    contextType,
    contentInteractions: interactions,
    iotContext,
  });
  const sequenceAdjusted = crossDomainSequenceService.applySequenceBoost(
    multiCandidateRanked,
    sequenceState,
    {
      intent: contextType,
      domain: 'content',
    }
  );
  const feedbackSignals = banditDecisionService.computeFeedbackSignalsFromRows(interactions, {
    contextType,
  });
  const banditRanked = banditDecisionService.rankCandidatesWithBandit(sequenceAdjusted, {
    domain: 'content',
    userId: user?.id,
    contextType,
    feedbackSignals,
    immediateWeight: 0.68,
    delayedWeight: 0.32,
    explorationRate: 0.2,
  });
  const sequenceNote = crossDomainSequenceService.buildSequenceNote(sequenceState, contextType);
  const explainedRanked = explanationService
    .enrichRecommendationList(banditRanked, {
      fallbackReason: 'Strong content fit for your current context.',
    })
    .map((item) => ({
      ...item,
      sequenceInsight: sequenceNote,
      recommendation: {
        ...(item.recommendation || {}),
        sequenceInsight: sequenceNote,
      },
    }));
  const recommendations = withExplorationMix(explainedRanked, Math.max(5, limit), {
    userId: user?.id,
    contextType,
  });

  return {
    contentType,
    recommendations,
    primary: recommendations[0] || null,
    backups: recommendations.slice(1, 3),
    model: {
      variant: contentModel.coldStart ? 'heuristic_blend' : 'ml_blend',
      trained: Boolean(contentModel.trained),
      sampleSize: Number(contentModel.sampleSize || 0),
      explorationPct: 20,
      exploitationPct: 80,
      delayedRewardProxy: feedbackSignals.delayedRewardProxy,
    },
  };
}

async function maybeLogImpressions(userId, contextType, recommendations = [], options = {}) {
  if (!options.logImpressions) {
    return;
  }

  const timeOfDay = inferTimeOfDay(options.nowDate || new Date());
  const dayOfWeek = (options.nowDate || new Date()).getDay();

  await Promise.all(
    recommendations.slice(0, 3).map((item, index) =>
      userContentInteractionModel.createInteraction({
        id: randomUUID(),
        userId,
        contentType: item.type === 'song' ? 'song' : 'movie',
        itemId: item.id,
        title: item.title,
        contextType,
        timeOfDay,
        dayOfWeek,
        selected: false,
        action: 'shown',
        score: Number(item.score || 0),
        confidence: Number(item.confidence || 0),
        features: item.features || {},
        metadata: {
          rank: index + 1,
          modelVariant: item?.model?.variant || options.modelVariant || 'heuristic_blend',
          winnerMode: item.winnerMode?.id || null,
          genre: item.genre || null,
          artist: item.artist || null,
          explorationSelected: Boolean(item.recommendation?.explorationSelected),
        },
        createdAt: new Date().toISOString(),
      })
    )
  );
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

  const result = await scoreCandidates({
    user,
    contextType,
    activityType: options.activityType,
    timeOfDay,
    dayOfWeek,
    etaMinutes: options.etaMinutes,
    sessionMinutes: options.sessionMinutes,
    durationMinutes: options.durationMinutes,
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
  });

  return {
    contextType,
    contentType: result.contentType,
    primary: result.primary,
    backups: result.backups,
    recommendations: result.recommendations,
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
      logImpressions: options.logImpressions !== false,
    }),
    getContextualRecommendations(user, {
      ...options,
      contextType: songContextType,
      activityType: options.activityType || 'walking',
      limit: options.songLimit || 8,
      logImpressions: options.logImpressions !== false,
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
      : fallback.movies;
  const songsPool = filteredSongsModel.length
    ? filteredSongsModel
    : filteredSongFallback.length
      ? filteredSongFallback
      : fallback.songs;

  const movies = dedupeContentRecommendations(moviesPool, 'movie', movieLimit).slice(0, movieLimit);
  const songs = dedupeContentRecommendations(songsPool, 'song', songLimit).slice(0, songLimit);
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

function normalizeFeedbackAction(action) {
  const normalized = normalizeText(action);
  if (['selected', 'helpful', 'save', 'dismissed', 'not_interested'].includes(normalized)) {
    return normalized;
  }
  return 'selected';
}

async function recordContentFeedback(userId, payload = {}) {
  const action = normalizeFeedbackAction(payload.action);
  const selected = POSITIVE_FEEDBACK_ACTIONS.has(action);
  const now = new Date(payload.timestamp || Date.now());
  const timeOfDay = inferTimeOfDay(now);

  const recent = await userContentInteractionModel.listInteractionsByUser(userId, 400);
  const matchedShown = recent.find(
    (row) =>
      normalizeText(row.action) === 'shown' &&
      String(row.itemId || '').trim() === String(payload.itemId || '').trim() &&
      normalizeText(row.contextType) === normalizeText(payload.contextType)
  );

  const features = matchedShown?.features || {
    genreMatch: clamp01(payload.features?.genreMatch),
    moodMatch: clamp01(payload.features?.moodMatch),
    durationFit: clamp01(payload.features?.durationFit),
    contextFit: clamp01(payload.features?.contextFit),
    timeOfDayFit: clamp01(payload.features?.timeOfDayFit),
    historySimilarity: clamp01(payload.features?.historySimilarity),
    activityFit: clamp01(payload.features?.activityFit),
  };

  await userContentInteractionModel.createInteraction({
    id: randomUUID(),
    userId,
    contentType: payload.contentType === 'song' ? 'song' : 'movie',
    itemId: String(payload.itemId || matchedShown?.itemId || '').trim(),
    title: String(payload.title || matchedShown?.title || 'Content recommendation').trim(),
    contextType: String(payload.contextType || matchedShown?.contextType || 'relaxing').trim(),
    timeOfDay,
    dayOfWeek: now.getDay(),
    selected,
    action,
    score: Number(payload.score || matchedShown?.score || 0),
    confidence: Number(payload.confidence || matchedShown?.confidence || 0),
    features,
    metadata: {
      source: 'feedback',
      reason: payload.reason || null,
      matchedShownId: matchedShown?.id || null,
    },
    createdAt: now.toISOString(),
  });

  await mlModelService.onlineUpdateContentModel(userId, features, selected ? 1 : 0);

  return {
    recorded: true,
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
};
