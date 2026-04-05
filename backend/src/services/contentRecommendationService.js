const { randomUUID } = require('crypto');
const { MOVIE_SHOW_CANDIDATES, SONG_CANDIDATES } = require('../data/contentCatalog');
const userContentInteractionModel = require('../models/userContentInteractionModel');
const featureService = require('./featureService');
const mlModelService = require('./mlModelService');
const recommendationService = require('./recommendationService');
const {
  normalizeContentPreferences,
  createDefaultContentPreferences,
} = require('./userDefaultsService');

const FALLBACK_MOVIES = [
  { id: 'fallback-movie-interstellar', title: 'Interstellar', genre: 'sci-fi' },
  { id: 'fallback-movie-martian', title: 'The Martian', genre: 'sci-fi' },
  { id: 'fallback-movie-ford-v-ferrari', title: 'Ford v Ferrari', genre: 'sports' },
  { id: 'fallback-movie-moneyball', title: 'Moneyball', genre: 'drama' },
];

const FALLBACK_SONGS = [
  { id: 'fallback-song-blinding-lights', title: 'Blinding Lights', artist: 'The Weeknd', genre: 'pop' },
  { id: 'fallback-song-eye-of-the-tiger', title: 'Eye of the Tiger', artist: 'Survivor', genre: 'rock' },
  { id: 'fallback-song-lose-yourself', title: 'Lose Yourself', artist: 'Eminem', genre: 'hip-hop' },
  { id: 'fallback-song-on-top-of-the-world', title: 'On Top of the World', artist: 'Imagine Dragons', genre: 'pop' },
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

function computeActivityFit(candidate, contextType, activityType, etaMinutes) {
  const normalizedContext = normalizeText(contextType);
  const activity = normalizeText(activityType);

  if (candidate.type === 'song') {
    const tempo = toNumber(candidate.tempo, 100);
    const durationMinutes = toNumber(candidate.durationSeconds, 0) / 60;
    const targetDuration = clamp(toNumber(etaMinutes, 0) || 20, 10, 75);

    if (normalizedContext === 'workout' || ['running', 'cardio', 'strength'].includes(activity)) {
      const tempoScore = clamp01((tempo - 90) / 65);
      return clamp01(tempoScore * 0.7 + computeDurationFit(candidate, { typicalWatchTime: targetDuration }, targetDuration) * 0.3);
    }

    if (normalizedContext === 'walking' || normalizedContext === 'pickup' || normalizedContext === 'go-there') {
      const tempoFit = clamp01(1 - Math.abs(tempo - 112) / 70);
      const durationFit = clamp01(1 - Math.abs(durationMinutes - targetDuration) / Math.max(targetDuration, 12));
      return clamp01(tempoFit * 0.6 + durationFit * 0.4);
    }

    return clamp01(1 - Math.abs(tempo - 100) / 90);
  }

  if (normalizedContext === 'eat_in' || normalizedContext === 'eat_out' || normalizedContext === 'while_eating') {
    return 0.82;
  }

  return 0.55;
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

function catalogForContext(contextType) {
  return contextCandidateType(contextType) === 'song' ? SONG_CANDIDATES : MOVIE_SHOW_CANDIDATES;
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

function normalizePublicContentItem(item, fallbackType) {
  const isSong = fallbackType === 'song' || normalizeText(item?.type) === 'song';
  const confidenceRaw =
    item?.confidencePct !== undefined
      ? Number(item.confidencePct)
      : Number(item?.confidence !== undefined ? item.confidence * 100 : item?.probability || 0);
  const confidencePct = clamp(toNumber(confidenceRaw, 78), 0, 100);
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
    topFactors: Array.isArray(item?.topFactors) ? item.topFactors.slice(0, 3) : [],
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
  limit = 3,
}) {
  const contentType = contextCandidateType(contextType);
  const catalog = catalogForContext(contextType).map((item) => normalizeCandidate(item, contentType));

  if (!catalog.length) {
    return defaultContentIfEmpty(contentType, contextType);
  }

  const preferences = normalizeContentPreferences(user?.contentPreferences || createDefaultContentPreferences());
  const interactions = await userContentInteractionModel.listInteractionsByUser(user.id, 800);
  const historyProfile = buildHistoryProfile(interactions, new Date());
  const targetDuration = contextDefaultDuration(contextType, {
    etaMinutes,
    sessionMinutes,
    durationMinutes,
  });

  const contentModel = await mlModelService.getUserContentModel(user);
  const scored = catalog.map((candidate) => {
    const features = {
      genreMatch: computeGenreMatch(candidate, preferences),
      moodMatch: computeMoodMatch(candidate, preferences, contextType, activityType),
      durationFit: computeDurationFit(candidate, preferences, targetDuration),
      contextFit: computeContextFit(candidate, contextType),
      timeOfDayFit: computeTimeOfDayFit(candidate, timeOfDay),
      historySimilarity: computeHistorySimilarity(candidate, historyProfile),
      activityFit: computeActivityFit(candidate, contextType, activityType, etaMinutes),
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
      contribution: round(toNumber(contentModel.weights[index + 1], 0) * toNumber(normalizedFeatures[key], 0), 4),
    }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3)
      .map((factor) => ({
        ...factor,
        contribution: round(Math.abs(factor.contribution), 4),
      }));

    const reason = buildReason(modeScores.winner, features, contextType);

    return {
      ...candidate,
      score: round(blended * 100, 2),
      confidence: round(blended, 4),
      confidencePct: round(blended * 100, 1),
      probability: round(probability, 4),
      reason,
      topFactors,
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

  const recommendations = unifiedRanked.slice(0, Math.max(3, limit)).map((item) => ({
    ...item,
    score: item.recommendation?.score ?? item.score,
    confidence: item.recommendation?.confidence ?? item.confidence,
    confidencePct: item.recommendation?.confidencePct ?? item.confidencePct,
    probability: item.recommendation?.probability ?? item.probability,
    reason: item.recommendation?.reason ?? item.reason,
    topFactors: item.recommendation?.topFeatures ?? item.topFactors,
  }));

  return {
    contentType,
    recommendations,
    primary: recommendations[0] || null,
    backups: recommendations.slice(1, 3),
    model: {
      variant: contentModel.coldStart ? 'heuristic_blend' : 'ml_blend',
      trained: Boolean(contentModel.trained),
      sampleSize: Number(contentModel.sampleSize || 0),
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

  const result = await scoreCandidates({
    user,
    contextType,
    activityType: options.activityType,
    timeOfDay,
    dayOfWeek,
    etaMinutes: options.etaMinutes,
    sessionMinutes: options.sessionMinutes,
    durationMinutes: options.durationMinutes,
    limit: options.limit || 3,
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
      limit: options.movieLimit || 3,
      logImpressions: options.logImpressions !== false,
    }),
    getContextualRecommendations(user, {
      ...options,
      contextType: songContextType,
      activityType: options.activityType || 'walking',
      limit: options.songLimit || 3,
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

  const movies = (moviesFromModel.length ? moviesFromModel : fallback.movies).slice(0, 3);
  const songs = (songsFromModel.length ? songsFromModel : fallback.songs).slice(0, 3);

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

module.exports = {
  getContextualRecommendations,
  getContextBundle,
  getUnifiedRecommendations,
  recordContentFeedback,
};
