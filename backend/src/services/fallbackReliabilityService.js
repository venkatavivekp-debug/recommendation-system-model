const env = require('../config/env');
const { getFallbackDashboardData } = require('../utils/fallbackData');
const userContentInteractionModel = require('../models/userContentInteractionModel');

const FALLBACK_MOVIES = [
  { id: 'fallback-movie-interstellar', type: 'movie', title: 'Interstellar', genre: 'sci-fi' },
  { id: 'fallback-movie-martian', type: 'movie', title: 'The Martian', genre: 'sci-fi' },
  { id: 'fallback-movie-ford-v-ferrari', type: 'movie', title: 'Ford v Ferrari', genre: 'sports drama' },
  { id: 'fallback-movie-moneyball', type: 'movie', title: 'Moneyball', genre: 'sports drama' },
];

const FALLBACK_SONGS = [
  { id: 'fallback-song-blinding-lights', type: 'song', title: 'Blinding Lights', artist: 'The Weeknd', genre: 'pop' },
  { id: 'fallback-song-eye-of-the-tiger', type: 'song', title: 'Eye of the Tiger', artist: 'Survivor', genre: 'rock' },
  { id: 'fallback-song-lose-yourself', type: 'song', title: 'Lose Yourself', artist: 'Eminem', genre: 'hip-hop' },
  { id: 'fallback-song-on-top-of-the-world', type: 'song', title: 'On Top of the World', artist: 'Imagine Dragons', genre: 'pop' },
];

function isFallbackModeEnabled() {
  return Boolean(env.fallbackMode);
}

function getDashboardFallback(user = null) {
  const base = getFallbackDashboardData();
  const firstName = String(user?.firstName || '').trim();

  return {
    ...base,
    aiInsights: {
      ...(base.aiInsights || {}),
      bestNextAction:
        firstName.length > 0
          ? `${firstName}, choose a high-protein option to stay aligned today.`
          : base.aiInsights?.bestNextAction,
    },
  };
}

function withReason(items = [], reason) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    ...item,
    reason: item.reason || reason,
    confidence: Number((0.78 - index * 0.04).toFixed(2)),
    confidencePct: Number((78 - index * 4).toFixed(1)),
  }));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSuppressionSet(interactions = []) {
  const sorted = [...(Array.isArray(interactions) ? interactions : [])].sort(
    (a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0)
  );
  const latestById = new Map();
  sorted.forEach((row) => {
    const id = String(row?.itemId || '').trim();
    if (!id || latestById.has(id)) {
      return;
    }
    latestById.set(id, normalizeText(row?.action));
  });
  return new Set(
    [...latestById.entries()]
      .filter(([, action]) => action === 'not_interested')
      .map(([id]) => id)
  );
}

function buildGenrePreferenceMap(interactions = []) {
  const prefs = new Map();
  (Array.isArray(interactions) ? interactions : []).forEach((row) => {
    const action = normalizeText(row?.action);
    if (!['selected', 'helpful', 'save'].includes(action)) {
      return;
    }
    const genre = normalizeText(row?.metadata?.genre || row?.genre || '');
    if (!genre) {
      return;
    }
    prefs.set(genre, (prefs.get(genre) || 0) + (action === 'save' ? 1.3 : 1));
  });
  return prefs;
}

function rankByPreference(items = [], genrePreferenceMap = new Map()) {
  return [...items].sort((a, b) => {
    const aScore = Number(genrePreferenceMap.get(normalizeText(a.genre)) || 0);
    const bScore = Number(genrePreferenceMap.get(normalizeText(b.genre)) || 0);
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

function prioritizeByContext(items = [], contextType = '', type = 'song') {
  const normalizedContext = normalizeText(contextType);
  const priorityByContext = {
    movie: {
      walking: ['fallback-movie-ford-v-ferrari', 'fallback-movie-moneyball'],
      workout: ['fallback-movie-ford-v-ferrari', 'fallback-movie-moneyball'],
      eat_out: ['fallback-movie-martian', 'fallback-movie-interstellar'],
      eat_in: ['fallback-movie-interstellar', 'fallback-movie-martian'],
      daily: ['fallback-movie-interstellar', 'fallback-movie-moneyball'],
    },
    song: {
      walking: ['fallback-song-on-top-of-the-world', 'fallback-song-blinding-lights'],
      workout: ['fallback-song-eye-of-the-tiger', 'fallback-song-lose-yourself'],
      eat_out: ['fallback-song-blinding-lights', 'fallback-song-on-top-of-the-world'],
      eat_in: ['fallback-song-blinding-lights', 'fallback-song-on-top-of-the-world'],
      daily: ['fallback-song-blinding-lights', 'fallback-song-eye-of-the-tiger'],
    },
  };

  const typeKey = type === 'movie' ? 'movie' : 'song';
  const priorities =
    priorityByContext[typeKey][normalizedContext] ||
    priorityByContext[typeKey].daily ||
    [];
  const priorityOrder = new Map(priorities.map((id, index) => [id, index]));

  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const aRank = priorityOrder.has(a.id) ? priorityOrder.get(a.id) : 999;
    const bRank = priorityOrder.has(b.id) ? priorityOrder.get(b.id) : 999;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

async function getContentFallback(userId = null, contextType = 'daily') {
  const normalizedContext = String(contextType || 'daily').trim().toLowerCase();
  let filteredMovies = [...FALLBACK_MOVIES];
  let filteredSongs = [...FALLBACK_SONGS];

  if (userId) {
    try {
      const interactions = await userContentInteractionModel.listInteractionsByUser(userId, 600);
      const suppression = buildSuppressionSet(interactions);
      const genrePrefs = buildGenrePreferenceMap(interactions);

      filteredMovies = rankByPreference(
        filteredMovies.filter((item) => !suppression.has(item.id)),
        genrePrefs
      );
      filteredSongs = rankByPreference(
        filteredSongs.filter((item) => !suppression.has(item.id)),
        genrePrefs
      );
    } catch (_error) {
      filteredMovies = [...FALLBACK_MOVIES];
      filteredSongs = [...FALLBACK_SONGS];
    }
  }

  if (!filteredMovies.length) {
    filteredMovies = [...FALLBACK_MOVIES];
  }
  if (!filteredSongs.length) {
    filteredSongs = [...FALLBACK_SONGS];
  }

  filteredMovies = prioritizeByContext(filteredMovies, normalizedContext, 'movie');
  filteredSongs = prioritizeByContext(filteredSongs, normalizedContext, 'song');

  return {
    movies: withReason(
      filteredMovies,
      `Baseline movie pick for ${normalizedContext} context while live ranking warms up.`
    ),
    songs: withReason(
      filteredSongs,
      `Baseline song pick for ${normalizedContext} context while live ranking warms up.`
    ),
    fallbackUsed: true,
    generatedAt: new Date().toISOString(),
  };
}

function getRecommendationFallback(domain = 'food') {
  const normalizedDomain = String(domain || 'food').trim().toLowerCase();
  if (normalizedDomain === 'content') {
    return {
      movies: withReason(FALLBACK_MOVIES, 'Baseline movie pick while live scoring warms up.'),
      songs: withReason(FALLBACK_SONGS, 'Baseline song pick while live scoring warms up.'),
      fallbackUsed: true,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    recommendations: [],
    message: 'Fallback recommendation mode is active.',
    domain: normalizedDomain,
  };
}

module.exports = {
  isFallbackModeEnabled,
  getDashboardFallback,
  getContentFallback,
  getRecommendationFallback,
};
