const env = require('../config/env');
const { getFallbackDashboardData } = require('../utils/fallbackData');

const FALLBACK_MOVIES = [
  { id: 'fallback-movie-interstellar', title: 'Interstellar', genre: 'sci-fi' },
  { id: 'fallback-movie-martian', title: 'The Martian', genre: 'sci-fi' },
  { id: 'fallback-movie-ford-v-ferrari', title: 'Ford v Ferrari', genre: 'sports drama' },
  { id: 'fallback-movie-moneyball', title: 'Moneyball', genre: 'sports drama' },
];

const FALLBACK_SONGS = [
  { id: 'fallback-song-blinding-lights', title: 'Blinding Lights', artist: 'The Weeknd', genre: 'pop' },
  { id: 'fallback-song-eye-of-the-tiger', title: 'Eye of the Tiger', artist: 'Survivor', genre: 'rock' },
  { id: 'fallback-song-lose-yourself', title: 'Lose Yourself', artist: 'Eminem', genre: 'hip-hop' },
  { id: 'fallback-song-on-top-of-the-world', title: 'On Top of the World', artist: 'Imagine Dragons', genre: 'pop' },
];

function isDemoModeEnabled() {
  return Boolean(env.demoMode);
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

function getContentFallback(contextType = 'daily') {
  const normalizedContext = String(contextType || 'daily').trim().toLowerCase();
  return {
    movies: withReason(
      FALLBACK_MOVIES,
      `Fallback movie pick for ${normalizedContext} context while live ranking warms up.`
    ),
    songs: withReason(
      FALLBACK_SONGS,
      `Fallback song pick for ${normalizedContext} context while live ranking warms up.`
    ),
    fallbackUsed: true,
    generatedAt: new Date().toISOString(),
  };
}

function getRecommendationFallback(domain = 'food') {
  const normalizedDomain = String(domain || 'food').trim().toLowerCase();
  if (normalizedDomain === 'content') {
    return getContentFallback('daily');
  }

  return {
    recommendations: [],
    message: 'Fallback recommendation mode is active.',
    domain: normalizedDomain,
  };
}

module.exports = {
  isDemoModeEnabled,
  getDashboardFallback,
  getContentFallback,
  getRecommendationFallback,
};
