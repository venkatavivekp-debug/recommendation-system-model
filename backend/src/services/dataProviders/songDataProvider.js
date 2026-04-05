const axios = require('axios');
const { SONG_CANDIDATES } = require('../../data/contentCatalog');
const { readCached, writeCached } = require('./providerCache');

const CACHE_SCOPE = 'song-data-provider';
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_POOL_SIZE = 220;

const LOCAL_SONG_LIBRARY = [
  { title: "Stronger (What Doesn't Kill You)", artist: 'Kelly Clarkson', genre: 'pop', mood: 'uplifting', tempo: 117 },
  { title: "Can't Stop", artist: 'Red Hot Chili Peppers', genre: 'rock', mood: 'hype', tempo: 92 },
  { title: 'Pompeii', artist: 'Bastille', genre: 'alternative', mood: 'uplifting', tempo: 127 },
  { title: 'Sky Full of Stars', artist: 'Coldplay', genre: 'dance', mood: 'uplifting', tempo: 125 },
  { title: 'Firework', artist: 'Katy Perry', genre: 'pop', mood: 'motivational', tempo: 124 },
  { title: 'Dynamite', artist: 'BTS', genre: 'pop', mood: 'upbeat', tempo: 114 },
  { title: 'Industry Baby', artist: 'Lil Nas X', genre: 'hip-hop', mood: 'hype', tempo: 150 },
  { title: 'Levitating (feat. DaBaby)', artist: 'Dua Lipa', genre: 'pop', mood: 'energetic', tempo: 103 },
  { title: 'Peaches', artist: 'Justin Bieber', genre: 'r&b', mood: 'light', tempo: 90 },
  { title: 'As It Was', artist: 'Harry Styles', genre: 'pop', mood: 'calm', tempo: 174 },
  { title: 'Flowers', artist: 'Miley Cyrus', genre: 'pop', mood: 'uplifting', tempo: 118 },
  { title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', genre: 'funk', mood: 'hype', tempo: 115 },
  { title: 'Happy', artist: 'Pharrell Williams', genre: 'pop', mood: 'light', tempo: 160 },
  { title: 'Roar', artist: 'Katy Perry', genre: 'pop', mood: 'motivational', tempo: 92 },
  { title: 'Thunder', artist: 'Imagine Dragons', genre: 'rock', mood: 'hype', tempo: 84 },
  { title: 'Whatever It Takes', artist: 'Imagine Dragons', genre: 'rock', mood: 'hype', tempo: 135 },
  { title: 'Best Day of My Life', artist: 'American Authors', genre: 'indie', mood: 'uplifting', tempo: 100 },
  { title: 'Good 4 U', artist: 'Olivia Rodrigo', genre: 'pop', mood: 'energetic', tempo: 166 },
  { title: "I Ain't Worried", artist: 'OneRepublic', genre: 'pop', mood: 'light', tempo: 140 },
  { title: 'Dreams', artist: 'Fleetwood Mac', genre: 'rock', mood: 'calm', tempo: 120 },
  { title: 'Electric Feel', artist: 'MGMT', genre: 'electronic', mood: 'upbeat', tempo: 103 },
  { title: 'Take On Me', artist: 'a-ha', genre: 'pop', mood: 'upbeat', tempo: 169 },
  { title: 'September', artist: 'Earth, Wind & Fire', genre: 'funk', mood: 'uplifting', tempo: 126 },
  { title: 'Africa', artist: 'Toto', genre: 'rock', mood: 'calm', tempo: 93 },
  { title: 'No Tears Left To Cry', artist: 'Ariana Grande', genre: 'pop', mood: 'uplifting', tempo: 122 },
  { title: 'Feel It Still', artist: 'Portugal. The Man', genre: 'alternative', mood: 'upbeat', tempo: 158 },
  { title: 'Shut Up and Dance', artist: 'Walk The Moon', genre: 'pop', mood: 'hype', tempo: 128 },
  { title: 'One Kiss', artist: 'Calvin Harris & Dua Lipa', genre: 'dance', mood: 'energetic', tempo: 124 },
  { title: 'Prayer in C', artist: 'Lilly Wood & Robin Schulz', genre: 'dance', mood: 'calm', tempo: 122 },
  { title: 'The Nights', artist: 'Avicii', genre: 'electronic', mood: 'motivational', tempo: 126 },
  { title: 'Levels', artist: 'Avicii', genre: 'electronic', mood: 'hype', tempo: 126 },
  { title: 'Titanium', artist: 'David Guetta ft. Sia', genre: 'dance', mood: 'motivational', tempo: 126 },
  { title: 'Animals', artist: 'Martin Garrix', genre: 'electronic', mood: 'hype', tempo: 128 },
  { title: 'Closer', artist: 'The Chainsmokers', genre: 'pop', mood: 'light', tempo: 95 },
  { title: 'Something Just Like This', artist: 'The Chainsmokers & Coldplay', genre: 'pop', mood: 'uplifting', tempo: 103 },
  { title: 'Sunflower', artist: 'Post Malone & Swae Lee', genre: 'hip-hop', mood: 'light', tempo: 90 },
  { title: 'Rockstar', artist: 'Post Malone', genre: 'hip-hop', mood: 'intense', tempo: 160 },
  { title: 'Old Town Road', artist: 'Lil Nas X', genre: 'hip-hop', mood: 'upbeat', tempo: 136 },
  { title: 'Numb', artist: 'Linkin Park', genre: 'rock', mood: 'intense', tempo: 110 },
  { title: 'In the End', artist: 'Linkin Park', genre: 'rock', mood: 'focused', tempo: 105 },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', genre: 'rock', mood: 'hype', tempo: 117 },
  { title: 'Mr. Brightside', artist: 'The Killers', genre: 'rock', mood: 'upbeat', tempo: 148 },
  { title: "Sweet Child O' Mine", artist: "Guns N' Roses", genre: 'rock', mood: 'hype', tempo: 125 },
  { title: 'Thunderstruck', artist: 'AC/DC', genre: 'rock', mood: 'hype', tempo: 134 },
  { title: 'Back In Black', artist: 'AC/DC', genre: 'rock', mood: 'hype', tempo: 94 },
  { title: 'The Final Countdown', artist: 'Europe', genre: 'rock', mood: 'motivational', tempo: 118 },
  { title: 'Riptide', artist: 'Vance Joy', genre: 'indie', mood: 'calm', tempo: 101 },
  { title: 'Budapest', artist: 'George Ezra', genre: 'indie', mood: 'calm', tempo: 128 },
  { title: 'Photograph', artist: 'Ed Sheeran', genre: 'pop', mood: 'calm', tempo: 108 },
  { title: 'Castle on the Hill', artist: 'Ed Sheeran', genre: 'pop', mood: 'uplifting', tempo: 135 },
];

const VARIANTS = [
  { id: 'walk', tags: ['walk', 'walking', 'pickup'], energyShift: 0.08, moodOverride: null },
  { id: 'workout', tags: ['workout', 'run', 'cardio'], energyShift: 0.16, moodOverride: 'energetic' },
  { id: 'focus', tags: ['focus', 'eat-in', 'study'], energyShift: -0.1, moodOverride: 'calm' },
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

function normalizeSongItem(item, index = 0) {
  const title = String(item.title || `Song ${index + 1}`).trim();
  const tempo = clamp(toNumber(item.tempo, 108 + (index % 20)), 60, 190);
  const durationSeconds = Math.max(120, Math.round(toNumber(item.durationSeconds, 180 + (index % 5) * 20)));
  const popularity = clamp(toNumber(item.popularity, 52 + (index % 41)), 5, 100);
  const energy = clamp(toNumber(item.energy, tempo / 190), 0.1, 1);
  const genre = String(item.genre || 'pop').trim().toLowerCase();
  const mood = String(item.mood || (energy > 0.72 ? 'energetic' : 'calm')).trim().toLowerCase();
  const tags = Array.from(
    new Set(
      (Array.isArray(item.tags) ? item.tags : [])
        .map((tag) => normalizeText(tag))
        .filter(Boolean)
    )
  );

  return {
    id: String(item.id || `song-${index + 1}`).trim(),
    type: 'song',
    title,
    artist: String(item.artist || 'Unknown Artist').trim(),
    genre,
    mood,
    tempo: Number(tempo.toFixed(1)),
    energy: Number(energy.toFixed(3)),
    durationSeconds,
    popularity: Number(popularity.toFixed(1)),
    tags,
    sourceUrl:
      item.sourceUrl ||
      `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${item.artist || ''}`)}`,
  };
}

function expandLocalSongDataset() {
  const base = [...SONG_CANDIDATES, ...LOCAL_SONG_LIBRARY].map((item, index) => normalizeSongItem(item, index));
  const expanded = [];

  base.forEach((item, index) => {
    VARIANTS.forEach((variant) => {
      expanded.push({
        ...item,
        id: `${item.id}-${variant.id}`,
        mood: variant.moodOverride || item.mood,
        energy: Number(clamp(item.energy + variant.energyShift, 0.1, 1).toFixed(3)),
        popularity: Number(clamp(item.popularity + index % 9, 5, 100).toFixed(1)),
        tags: Array.from(new Set([...item.tags, ...variant.tags])),
      });
    });
  });

  return expanded;
}

async function fetchSpotifyCatalog(limit = DEFAULT_POOL_SIZE) {
  const token = String(process.env.SPOTIFY_ACCESS_TOKEN || '').trim();
  if (!token) {
    return [];
  }

  const target = clamp(toNumber(limit, DEFAULT_POOL_SIZE), 100, 500);
  const seedQueries = ['workout', 'walking', 'dinner', 'focus', 'uplifting'];
  const requests = seedQueries.map((query) =>
    axios.get('https://api.spotify.com/v1/search', {
      params: {
        q: query,
        type: 'track',
        limit: 40,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 5000,
    })
  );

  const settled = await Promise.allSettled(requests);
  const rows = [];

  settled.forEach((result) => {
    if (result.status !== 'fulfilled') {
      return;
    }
    const tracks = Array.isArray(result.value?.data?.tracks?.items)
      ? result.value.data.tracks.items
      : [];

    tracks.forEach((track) => {
      const title = String(track.name || '').trim();
      if (!title) {
        return;
      }

      rows.push(
        normalizeSongItem(
          {
            id: `spotify-${track.id}`,
            title,
            artist: Array.isArray(track.artists) ? track.artists.map((item) => item.name).join(', ') : 'Unknown Artist',
            genre: 'mixed',
            mood: 'energetic',
            tempo: 112,
            durationSeconds: Math.round(toNumber(track.duration_ms, 210000) / 1000),
            popularity: track.popularity,
            energy: clamp(toNumber(track.popularity, 50) / 100, 0.2, 0.95),
            tags: ['spotify', 'dynamic'],
            sourceUrl: track.external_urls?.spotify,
          },
          rows.length
        )
      );
    });
  });

  return rows.slice(0, target);
}

function applyContextOrdering(items = [], context = {}) {
  const contextType = normalizeText(context.contextType || context.mealContext || '');
  const activityType = normalizeText(context.activityType || '');
  const wantsEnergetic =
    contextType === 'walking' ||
    contextType === 'pickup' ||
    contextType === 'workout' ||
    activityType === 'walking' ||
    activityType === 'running' ||
    activityType === 'cardio';

  return [...items].sort((a, b) => {
    const aEnergyTarget = wantsEnergetic ? a.energy : 1 - a.energy;
    const bEnergyTarget = wantsEnergetic ? b.energy : 1 - b.energy;
    const aTagBonus = a.tags.includes(contextType) ? 0.15 : 0;
    const bTagBonus = b.tags.includes(contextType) ? 0.15 : 0;
    const aScore = aEnergyTarget * 0.45 + (a.popularity / 100) * 0.35 + (a.tempo / 200) * 0.2 + aTagBonus;
    const bScore = bEnergyTarget * 0.45 + (b.popularity / 100) * 0.35 + (b.tempo / 200) * 0.2 + bTagBonus;
    return bScore - aScore;
  });
}

async function getSongs(context = {}) {
  const requested = clamp(toNumber(context.limit, DEFAULT_POOL_SIZE), 100, 500);
  const cacheKeyParts = [requested];
  const cached = readCached(CACHE_SCOPE, cacheKeyParts, CACHE_TTL_MS);
  if (cached) {
    return applyContextOrdering(cached, context).slice(0, requested);
  }

  let catalog = [];
  try {
    catalog = await fetchSpotifyCatalog(requested);
  } catch (_error) {
    catalog = [];
  }

  if (catalog.length < 100) {
    catalog = [...catalog, ...expandLocalSongDataset()];
  }

  const deduped = [];
  const seen = new Set();
  catalog.forEach((item) => {
    const normalized = normalizeSongItem(item, deduped.length);
    const key = `${normalizeText(normalized.title)}::${normalizeText(normalized.artist)}::${normalized.tempo}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(normalized);
  });

  if (deduped.length < 100) {
    const local = expandLocalSongDataset();
    for (const item of local) {
      if (deduped.length >= 140) {
        break;
      }
      deduped.push(normalizeSongItem(item, deduped.length));
    }
  }

  const finalCatalog = deduped.slice(0, Math.max(requested, 180));
  writeCached(CACHE_SCOPE, cacheKeyParts, finalCatalog);
  return applyContextOrdering(finalCatalog, context).slice(0, requested);
}

module.exports = {
  getSongs,
};
