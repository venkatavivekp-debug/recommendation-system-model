const { randomUUID } = require('crypto');
const foodDataProvider = require('./dataProviders/foodDataProvider');
const movieDataProvider = require('./dataProviders/movieDataProvider');
const songDataProvider = require('./dataProviders/songDataProvider');
const domainRegistryService = require('./domainRegistryService');

const ATHENS_CURATED_RESTAURANTS = [
  {
    id: 'rest-chipotle-athens',
    name: 'Chipotle',
    cuisine: 'Mexican',
    rating: 4.2,
    lat: 33.9329,
    lng: -83.4419,
    nutrition: { calories: 650, protein: 40, carbs: 62, fats: 24, fiber: 12 },
    tags: ['high-protein', 'balanced', 'quick'],
  },
  {
    id: 'rest-subway-athens',
    name: 'Subway',
    cuisine: 'Sandwiches',
    rating: 4.1,
    lat: 33.9598,
    lng: -83.371,
    nutrition: { calories: 400, protein: 20, carbs: 44, fats: 11, fiber: 6 },
    tags: ['light', 'quick'],
  },
  {
    id: 'rest-mcdonalds-athens',
    name: "McDonald's",
    cuisine: 'Fast Food',
    rating: 4.0,
    lat: 33.9485,
    lng: -83.4161,
    nutrition: { calories: 700, protein: 25, carbs: 74, fats: 34, fiber: 3 },
    tags: ['fast-food', 'quick'],
  },
  {
    id: 'rest-kfc-athens',
    name: 'KFC',
    cuisine: 'Fried Chicken',
    rating: 3.9,
    lat: 33.9437,
    lng: -83.4107,
    nutrition: { calories: 850, protein: 35, carbs: 66, fats: 46, fiber: 4 },
    tags: ['high-protein', 'fast-food'],
  },
  {
    id: 'rest-taco-bell-athens',
    name: 'Taco Bell',
    cuisine: 'Tex-Mex',
    rating: 4.0,
    lat: 33.9514,
    lng: -83.4063,
    nutrition: { calories: 550, protein: 18, carbs: 58, fats: 24, fiber: 5 },
    tags: ['quick', 'fast-food'],
  },
];

const FITNESS_CATALOG = [
  {
    id: 'fitness-recovery-walk',
    title: 'Recovery Walk',
    itemType: 'activity',
    intensity: 'light',
    durationMinutes: 25,
    estimatedCaloriesBurned: 120,
    tags: ['recovery', 'low-impact'],
  },
  {
    id: 'fitness-strength-session',
    title: 'Strength Session',
    itemType: 'activity',
    intensity: 'moderate',
    durationMinutes: 40,
    estimatedCaloriesBurned: 260,
    tags: ['strength', 'muscle'],
  },
  {
    id: 'fitness-cardio-session',
    title: 'Cardio Session',
    itemType: 'activity',
    intensity: 'high',
    durationMinutes: 35,
    estimatedCaloriesBurned: 320,
    tags: ['cardio', 'endurance'],
  },
  {
    id: 'fitness-mobility-session',
    title: 'Mobility and Stretch',
    itemType: 'recovery',
    intensity: 'light',
    durationMinutes: 20,
    estimatedCaloriesBurned: 75,
    tags: ['mobility', 'recovery'],
  },
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

function inferMacroFocus(remaining = {}) {
  const entries = [
    { key: 'protein', value: toNumber(remaining.protein, 0) },
    { key: 'carbs', value: toNumber(remaining.carbs, 0) },
    { key: 'fats', value: toNumber(remaining.fats, 0) },
    { key: 'fiber', value: toNumber(remaining.fiber, 0) },
  ].sort((a, b) => b.value - a.value);
  return entries[0]?.key || 'balanced';
}

function inferMealTypeByClock() {
  const hour = new Date().getHours();
  if (hour < 11) {
    return 'breakfast';
  }
  if (hour < 16) {
    return 'lunch';
  }
  return 'dinner';
}

function normalizeContext(context = {}) {
  return {
    intent: normalizeText(context.intent || context.mode || 'daily'),
    timeOfDay: normalizeText(context.timeOfDay || ''),
    activityType: normalizeText(context.activityType || ''),
    mealContext: normalizeText(context.mealContext || context.contextType || ''),
    macroFocus: normalizeText(context.macroFocus || ''),
    remaining: context.remaining || {},
  };
}

function candidateKey(candidate = {}, index = 0) {
  return String(candidate.id || candidate.title || candidate.name || `candidate-${index}`)
    .trim()
    .toLowerCase();
}

function dedupeCandidates(candidates = []) {
  const seen = new Set();
  return (Array.isArray(candidates) ? candidates : []).filter((candidate, index) => {
    const key = candidateKey(candidate, index);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mapFoodRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((item, index) => ({
    id: item.id || `food-${index + 1}-${randomUUID().slice(0, 8)}`,
    domain: 'food',
    itemType: 'meal',
    title: item.foodName || item.name || 'Meal option',
    cuisine: item.cuisine || null,
    sourceType: item.sourceType || 'food_dataset',
    nutrition: {
      calories: toNumber(item.calories, 0),
      protein: toNumber(item.protein, 0),
      carbs: toNumber(item.carbs, 0),
      fats: toNumber(item.fats, 0),
      fiber: toNumber(item.fiber, 0),
    },
    ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    metadata: item,
  }));
}

function mapRestaurantRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((item) => ({
    id: item.id,
    domain: 'food',
    itemType: 'restaurant',
    title: item.name,
    cuisine: item.cuisine,
    rating: item.rating,
    lat: item.lat,
    lng: item.lng,
    nutrition: item.nutrition,
    tags: item.tags || [],
    metadata: item,
  }));
}

async function generateFoodCandidates({ user = null, context = {}, poolSize = 220 } = {}) {
  const normalizedContext = normalizeContext(context);
  const remaining = normalizedContext.remaining || {};
  const preferredDiet =
    user?.preferences?.preferredDiet || user?.preferredDiet || context?.preferredDiet || 'non-veg';
  const macroFocus = normalizedContext.macroFocus || inferMacroFocus(remaining);

  const foods = await foodDataProvider.getFoods({
    limit: Math.max(80, toNumber(poolSize, 220)),
    macroFocus,
    mealType: context.mealType || inferMealTypeByClock(),
    preferredDiet,
    query: context.query || '',
    timeOfDay: normalizedContext.timeOfDay || null,
  });

  const mealCandidates = mapFoodRows(foods);
  const restaurantCandidates = mapRestaurantRows(ATHENS_CURATED_RESTAURANTS);

  const candidates = dedupeCandidates([...mealCandidates, ...restaurantCandidates]);

  return {
    domain: 'food',
    context: normalizedContext,
    candidates,
    groups: {
      meals: mealCandidates,
      restaurants: restaurantCandidates,
    },
  };
}

function mapMovieRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((item, index) => ({
    id: item.id || `movie-${index + 1}`,
    domain: 'media',
    itemType: 'movie',
    title: item.title || 'Movie option',
    genre: item.genre || '',
    durationMinutes: toNumber(item.runtime || item.durationMinutes, 0),
    mood: item.mood || '',
    rating: toNumber(item.rating, 0),
    tags: Array.isArray(item.tags) ? item.tags : [],
    metadata: item,
  }));
}

function mapSongRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((item, index) => ({
    id: item.id || `song-${index + 1}`,
    domain: 'media',
    itemType: 'song',
    title: item.title || 'Song option',
    artist: item.artist || 'Unknown Artist',
    genre: item.genre || '',
    tempo: toNumber(item.tempo, 0),
    energy: toNumber(item.energy, 0),
    mood: item.mood || '',
    durationSeconds: toNumber(item.durationSeconds, 0),
    tags: Array.isArray(item.tags) ? item.tags : [],
    metadata: item,
  }));
}

async function generateMediaCandidates({ context = {}, poolSize = 220 } = {}) {
  const normalizedContext = normalizeContext(context);
  const safePool = Math.max(80, toNumber(poolSize, 220));
  const [movies, songs] = await Promise.all([
    movieDataProvider.getMovies({
      limit: safePool,
      contextType: normalizedContext.mealContext || normalizedContext.intent || 'daily',
      activityType: normalizedContext.activityType || null,
      mealContext: normalizedContext.mealContext || null,
      timeOfDay: normalizedContext.timeOfDay || null,
    }),
    songDataProvider.getSongs({
      limit: safePool,
      contextType: normalizedContext.mealContext || normalizedContext.intent || 'daily',
      activityType: normalizedContext.activityType || null,
      mealContext: normalizedContext.mealContext || null,
      timeOfDay: normalizedContext.timeOfDay || null,
    }),
  ]);

  const movieCandidates = mapMovieRows(movies);
  const songCandidates = mapSongRows(songs);

  const candidates = dedupeCandidates([...movieCandidates, ...songCandidates]);

  return {
    domain: 'media',
    context: normalizedContext,
    candidates,
    groups: {
      movies: movieCandidates,
      songs: songCandidates,
    },
  };
}

async function generateFitnessCandidates({ context = {} } = {}) {
  const normalizedContext = normalizeContext(context);
  const activityLevel = clamp(toNumber(context.activityLevel, 0.55), 0, 1);
  const suggestedActivity = normalizeText(context.activityType || context.foodToFitness?.activityType || '');
  const suggestedIntensity = normalizeText(context.intensity || context.foodToFitness?.intensity || '');

  const candidates = FITNESS_CATALOG.map((item) => {
    const itemText = normalizeText([item.title, item.itemType, ...(item.tags || [])].join(' '));
    return {
      ...item,
      domain: 'fitness',
      context: normalizedContext,
      relevance: clamp(
        (item.intensity === 'high'
          ? activityLevel * 0.8 + 0.2
          : item.intensity === 'moderate'
            ? 0.5 + activityLevel * 0.4
            : 0.7 - activityLevel * 0.2) +
          (suggestedActivity && itemText.includes(suggestedActivity.replace('walking', 'walk')) ? 0.12 : 0) +
          (suggestedIntensity && normalizeText(item.intensity) === suggestedIntensity ? 0.08 : 0),
        0,
        1
      ),
    };
  }).sort((a, b) => b.relevance - a.relevance);

  return {
    domain: 'fitness',
    context: normalizedContext,
    candidates,
    groups: {
      activities: candidates.filter((item) => item.itemType === 'activity'),
      recovery: candidates.filter((item) => item.itemType === 'recovery'),
    },
  };
}

async function generateCandidates({ domain, user = null, context = {}, poolSize = 220 } = {}) {
  const normalizedDomain = domainRegistryService.ensureDomain(domain).id;

  if (normalizedDomain === 'food') {
    return generateFoodCandidates({ user, context, poolSize });
  }
  if (normalizedDomain === 'media') {
    return generateMediaCandidates({ context, poolSize });
  }
  if (normalizedDomain === 'fitness') {
    return generateFitnessCandidates({ context, poolSize });
  }

  return {
    domain: normalizedDomain,
    context: normalizeContext(context),
    candidates: [],
    groups: {},
  };
}

async function generateCrossDomainCandidates({
  domains = ['food', 'fitness', 'media'],
  user = null,
  context = {},
  poolSize = 220,
} = {}) {
  const selectedDomains = (Array.isArray(domains) ? domains : [])
    .map((value) => domainRegistryService.aliasToDomainId(value))
    .filter((value, index, arr) => value && arr.indexOf(value) === index);

  const bundles = await Promise.all(
    selectedDomains.map((domain) =>
      generateCandidates({
        domain,
        user,
        context,
        poolSize,
      })
    )
  );

  const byDomain = {};
  bundles.forEach((bundle) => {
    byDomain[bundle.domain] = bundle;
  });

  return {
    domains: selectedDomains,
    bundles,
    byDomain,
  };
}

module.exports = {
  generateCandidates,
  generateCrossDomainCandidates,
};
