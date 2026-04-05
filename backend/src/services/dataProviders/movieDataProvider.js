const axios = require('axios');
const { MOVIE_SHOW_CANDIDATES } = require('../../data/contentCatalog');
const { readCached, writeCached } = require('./providerCache');

const CACHE_SCOPE = 'movie-data-provider';
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_POOL_SIZE = 220;

const TMDB_GENRE_MAP = {
  28: 'action',
  12: 'adventure',
  16: 'animation',
  35: 'comedy',
  80: 'crime',
  99: 'documentary',
  18: 'drama',
  10751: 'family',
  14: 'fantasy',
  36: 'history',
  27: 'horror',
  10402: 'musical',
  9648: 'mystery',
  10749: 'romance',
  878: 'sci-fi',
  53: 'thriller',
  10752: 'war',
  37: 'western',
  10759: 'action',
  10762: 'family',
  10763: 'news',
  10764: 'reality',
  10765: 'sci-fi',
  10766: 'drama',
  10767: 'talk',
  10768: 'war',
};

const LOCAL_MOVIE_LIBRARY = [
  { title: 'Inception', genre: 'sci-fi', rating: 8.8, runtime: 148, mood: 'focused' },
  { title: 'The Dark Knight', genre: 'action', rating: 9.0, runtime: 152, mood: 'intense' },
  { title: 'Top Gun: Maverick', genre: 'action', rating: 8.3, runtime: 130, mood: 'hype' },
  { title: 'The Social Network', genre: 'drama', rating: 7.8, runtime: 120, mood: 'focused' },
  { title: 'The Pursuit of Happyness', genre: 'drama', rating: 8.0, runtime: 117, mood: 'motivational' },
  { title: 'The Grand Budapest Hotel', genre: 'comedy', rating: 8.1, runtime: 99, mood: 'light' },
  { title: 'Whiplash', genre: 'drama', rating: 8.5, runtime: 107, mood: 'intense' },
  { title: 'The Imitation Game', genre: 'drama', rating: 8.0, runtime: 114, mood: 'focused' },
  { title: 'Arrival', genre: 'sci-fi', rating: 7.9, runtime: 116, mood: 'calm' },
  { title: 'The Theory of Everything', genre: 'drama', rating: 7.7, runtime: 123, mood: 'inspired' },
  { title: 'Creed', genre: 'sports', rating: 7.6, runtime: 133, mood: 'motivational' },
  { title: 'Rush', genre: 'sports', rating: 8.1, runtime: 123, mood: 'hype' },
  { title: 'Remember the Titans', genre: 'sports', rating: 7.8, runtime: 113, mood: 'uplifting' },
  { title: 'Coach Carter', genre: 'sports', rating: 7.3, runtime: 136, mood: 'motivational' },
  { title: 'The Blind Side', genre: 'drama', rating: 7.6, runtime: 129, mood: 'feel-good' },
  { title: 'Julie & Julia', genre: 'comedy', rating: 7.0, runtime: 123, mood: 'light' },
  { title: 'Chef', genre: 'comedy', rating: 7.3, runtime: 114, mood: 'feel-good' },
  { title: 'Burnt', genre: 'drama', rating: 6.6, runtime: 100, mood: 'focused' },
  { title: 'The Hundred-Foot Journey', genre: 'drama', rating: 7.3, runtime: 122, mood: 'relaxed' },
  { title: 'The Last Dance', genre: 'documentary', rating: 9.1, runtime: 50, mood: 'focused', type: 'show' },
  { title: 'Chef Show', genre: 'reality', rating: 8.2, runtime: 32, mood: 'relaxed', type: 'show' },
  { title: 'Drive to Survive', genre: 'sports', rating: 8.5, runtime: 44, mood: 'hype', type: 'show' },
  { title: 'Blue Planet', genre: 'documentary', rating: 9.0, runtime: 50, mood: 'calm', type: 'show' },
  { title: 'Abstract: The Art of Design', genre: 'documentary', rating: 8.3, runtime: 43, mood: 'focused', type: 'show' },
  { title: 'The Crown', genre: 'drama', rating: 8.6, runtime: 58, mood: 'focused', type: 'show' },
  { title: 'Suits', genre: 'drama', rating: 8.4, runtime: 44, mood: 'focused', type: 'show' },
  { title: 'Parks and Recreation', genre: 'comedy', rating: 8.6, runtime: 22, mood: 'light', type: 'show' },
  { title: 'How I Met Your Mother', genre: 'comedy', rating: 8.3, runtime: 22, mood: 'light', type: 'show' },
  { title: 'Community', genre: 'comedy', rating: 8.5, runtime: 22, mood: 'light', type: 'show' },
  { title: 'Chernobyl', genre: 'drama', rating: 9.3, runtime: 63, mood: 'intense', type: 'show' },
  { title: "The Queen's Gambit", genre: 'drama', rating: 8.6, runtime: 56, mood: 'focused', type: 'show' },
  { title: 'The Mandalorian', genre: 'sci-fi', rating: 8.7, runtime: 38, mood: 'hype', type: 'show' },
  { title: 'Andor', genre: 'sci-fi', rating: 8.5, runtime: 45, mood: 'focused', type: 'show' },
  { title: 'Narcos', genre: 'drama', rating: 8.8, runtime: 49, mood: 'intense', type: 'show' },
  { title: 'Mindhunter', genre: 'thriller', rating: 8.6, runtime: 50, mood: 'focused', type: 'show' },
  { title: 'Black Mirror', genre: 'sci-fi', rating: 8.7, runtime: 60, mood: 'intense', type: 'show' },
  { title: 'The Good Place', genre: 'comedy', rating: 8.2, runtime: 22, mood: 'light', type: 'show' },
  { title: 'Derry Girls', genre: 'comedy', rating: 8.5, runtime: 24, mood: 'light', type: 'show' },
  { title: "Schitt's Creek", genre: 'comedy', rating: 8.5, runtime: 22, mood: 'feel-good', type: 'show' },
  { title: 'Luca', genre: 'family', rating: 7.5, runtime: 95, mood: 'feel-good' },
  { title: 'Soul', genre: 'family', rating: 8.0, runtime: 100, mood: 'calm' },
  { title: 'Inside Out', genre: 'family', rating: 8.1, runtime: 95, mood: 'uplifting' },
  { title: 'Moana', genre: 'family', rating: 7.6, runtime: 107, mood: 'uplifting' },
  { title: 'The Incredibles', genre: 'family', rating: 8.0, runtime: 115, mood: 'hype' },
  { title: 'Up', genre: 'family', rating: 8.3, runtime: 96, mood: 'feel-good' },
  { title: 'The Truman Show', genre: 'drama', rating: 8.2, runtime: 103, mood: 'focused' },
  { title: 'Good Will Hunting', genre: 'drama', rating: 8.3, runtime: 126, mood: 'inspired' },
  { title: 'The Internship', genre: 'comedy', rating: 6.3, runtime: 119, mood: 'light' },
  { title: 'The Intern', genre: 'comedy', rating: 7.1, runtime: 121, mood: 'feel-good' },
  { title: 'Begin Again', genre: 'musical', rating: 7.4, runtime: 104, mood: 'calm' },
  { title: 'Sing Street', genre: 'musical', rating: 7.9, runtime: 106, mood: 'uplifting' },
  { title: 'Bohemian Rhapsody', genre: 'musical', rating: 7.9, runtime: 134, mood: 'hype' },
  { title: 'The Greatest Showman', genre: 'musical', rating: 7.5, runtime: 105, mood: 'uplifting' },
  { title: 'The Lego Movie', genre: 'comedy', rating: 7.7, runtime: 100, mood: 'light' },
  { title: 'Palm Springs', genre: 'comedy', rating: 7.4, runtime: 90, mood: 'light' },
  { title: 'Knives Out', genre: 'mystery', rating: 7.9, runtime: 130, mood: 'focused' },
  { title: 'Glass Onion', genre: 'mystery', rating: 7.2, runtime: 139, mood: 'light' },
  { title: 'A Beautiful Mind', genre: 'drama', rating: 8.2, runtime: 135, mood: 'inspired' },
  { title: 'The Big Short', genre: 'drama', rating: 7.8, runtime: 130, mood: 'focused' },
  { title: 'Hidden Figures', genre: 'drama', rating: 7.8, runtime: 127, mood: 'inspired' },
];

const VARIANTS = [
  { id: 'quick', runtimeMultiplier: 0.82, tags: ['quick', 'lunch'], moodOverride: 'light' },
  { id: 'dinner', runtimeMultiplier: 1, tags: ['dinner', 'eat-in'], moodOverride: null },
  { id: 'weekend', runtimeMultiplier: 1.1, tags: ['weekend', 'night'], moodOverride: null },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeMovieItem(item, index = 0) {
  const runtime = Math.max(20, Math.round(toNumber(item.runtime || item.durationMinutes, 110)));
  const genre = String(item.genre || 'drama').trim().toLowerCase();
  const rating = clamp(toNumber(item.rating, 7.2), 4.5, 9.8);
  const popularity = clamp(toNumber(item.popularity, 58 + index % 32), 5, 100);
  const title = String(item.title || item.name || `Movie ${index + 1}`).trim();
  const type = normalizeText(item.type) === 'show' ? 'show' : 'movie';
  const mood = String(item.mood || 'balanced').trim().toLowerCase();
  const tags = Array.from(
    new Set(
      (Array.isArray(item.tags) ? item.tags : [])
        .map((tag) => normalizeText(tag))
        .filter(Boolean)
    )
  );

  return {
    id: String(item.id || `movie-${index + 1}`).trim(),
    title,
    type,
    genre,
    mood,
    durationMinutes: runtime,
    runtime,
    popularity: Number(popularity.toFixed(2)),
    rating: Number(rating.toFixed(1)),
    tags,
    language: String(item.language || 'english').trim().toLowerCase(),
    sourceUrl:
      item.sourceUrl ||
      `https://www.google.com/search?q=${encodeURIComponent(`${title} watch`)}`,
  };
}

function expandLocalMovieDataset() {
  const base = [...MOVIE_SHOW_CANDIDATES, ...LOCAL_MOVIE_LIBRARY].map((item, index) =>
    normalizeMovieItem(item, index)
  );

  const expanded = [];
  base.forEach((item, index) => {
    VARIANTS.forEach((variant) => {
      const runtime = Math.max(20, Math.round(item.runtime * variant.runtimeMultiplier));
      expanded.push({
        ...item,
        id: `${item.id}-${variant.id}`,
        mood: variant.moodOverride || item.mood,
        durationMinutes: runtime,
        runtime,
        popularity: Number(clamp(item.popularity + index % 7, 5, 100).toFixed(2)),
        tags: Array.from(new Set([...item.tags, ...variant.tags])),
      });
    });
  });

  return expanded;
}

async function fetchTmdbCatalog(limit = DEFAULT_POOL_SIZE) {
  const apiKey = String(process.env.TMDB_API_KEY || '').trim();
  if (!apiKey) {
    return [];
  }

  const maxItems = clamp(toNumber(limit, DEFAULT_POOL_SIZE), 100, 500);
  const pages = Math.min(6, Math.max(3, Math.ceil(maxItems / 40)));
  const tmdbBase = 'https://api.themoviedb.org/3';

  const requests = [];
  for (let page = 1; page <= pages; page += 1) {
    requests.push(
      axios.get(`${tmdbBase}/discover/movie`, {
        params: {
          api_key: apiKey,
          sort_by: 'popularity.desc',
          include_adult: false,
          include_video: false,
          page,
        },
        timeout: 5000,
      }),
      axios.get(`${tmdbBase}/discover/tv`, {
        params: {
          api_key: apiKey,
          sort_by: 'popularity.desc',
          include_adult: false,
          page,
        },
        timeout: 5000,
      })
    );
  }

  const settled = await Promise.allSettled(requests);
  const rows = [];

  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      return;
    }

    const list = Array.isArray(result.value?.data?.results) ? result.value.data.results : [];
    const isTv = index % 2 === 1;

    list.forEach((item) => {
      const genreId = Array.isArray(item.genre_ids) ? item.genre_ids[0] : null;
      const genre = TMDB_GENRE_MAP[genreId] || 'drama';
      const title = String(isTv ? item.name : item.title).trim();
      if (!title) {
        return;
      }

      rows.push(
        normalizeMovieItem(
          {
            id: `tmdb-${isTv ? 'tv' : 'movie'}-${item.id}`,
            title,
            type: isTv ? 'show' : 'movie',
            genre,
            mood:
              genre === 'comedy'
                ? 'light'
                : genre === 'action' || genre === 'sports'
                  ? 'hype'
                  : genre === 'documentary'
                    ? 'focused'
                    : 'balanced',
            runtime: isTv ? 45 : 120,
            popularity: item.popularity,
            rating: item.vote_average,
            tags: [genre, 'tmdb', 'trending'],
            sourceUrl: `https://www.themoviedb.org/${isTv ? 'tv' : 'movie'}/${item.id}`,
          },
          rows.length
        )
      );
    });
  });

  return rows.slice(0, maxItems);
}

function applyContextOrdering(items = [], queryContext = {}) {
  const timeOfDay = normalizeText(queryContext.timeOfDay);
  const mealContext = normalizeText(queryContext.mealContext || queryContext.contextType);
  const wantsLong = mealContext === 'dinner' || mealContext === 'eat_in' || timeOfDay === 'night';

  return [...items].sort((a, b) => {
    const aRuntimeScore = wantsLong ? a.runtime : 180 - a.runtime;
    const bRuntimeScore = wantsLong ? b.runtime : 180 - b.runtime;
    const aTagBonus = a.tags.includes(timeOfDay) || a.tags.includes(mealContext) ? 12 : 0;
    const bTagBonus = b.tags.includes(timeOfDay) || b.tags.includes(mealContext) ? 12 : 0;
    const aScore = a.popularity * 0.55 + a.rating * 8 + aTagBonus + aRuntimeScore * 0.1;
    const bScore = b.popularity * 0.55 + b.rating * 8 + bTagBonus + bRuntimeScore * 0.1;
    return bScore - aScore;
  });
}

async function getMovies(queryContext = {}) {
  const requested = clamp(toNumber(queryContext.limit, DEFAULT_POOL_SIZE), 100, 500);
  const cacheKeyParts = [requested];
  const cached = readCached(CACHE_SCOPE, cacheKeyParts, CACHE_TTL_MS);
  if (cached) {
    return applyContextOrdering(cached, queryContext).slice(0, requested);
  }

  let catalog = [];
  try {
    catalog = await fetchTmdbCatalog(requested);
  } catch (_error) {
    catalog = [];
  }

  if (catalog.length < 100) {
    catalog = [...catalog, ...expandLocalMovieDataset()];
  }

  const deduped = [];
  const seen = new Set();
  catalog.forEach((item) => {
    const normalized = normalizeMovieItem(item, deduped.length);
    const key = `${normalizeText(normalized.title)}::${normalizeText(normalized.type)}::${normalized.runtime}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(normalized);
  });

  if (deduped.length < 100) {
    const local = expandLocalMovieDataset();
    for (const item of local) {
      if (deduped.length >= 120) {
        break;
      }
      deduped.push(normalizeMovieItem(item, deduped.length));
    }
  }

  const finalCatalog = deduped.slice(0, Math.max(requested, 180));
  writeCached(CACHE_SCOPE, cacheKeyParts, finalCatalog);
  return applyContextOrdering(finalCatalog, queryContext).slice(0, requested);
}

module.exports = {
  getMovies,
};
