const axios = require('axios');
const env = require('../config/env');
const googlePlacesService = require('./googlePlacesService');
const { restaurantId } = require('../utils/restaurantIdentity');
const { haversineMiles, milesToMeters } = require('../utils/geo');
const logger = require('../utils/logger');
const { buildFoodImage } = require('../utils/media');

const cache = new Map();
const pending = new Map();
const TTL = 30 * 60 * 1000;
let retryAfter = 0;

function normalizeOsm(element) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!['node', 'way', 'relation'].includes(element.type) || !element.id) return null;
  return {
    placeId: restaurantId('osm', `${element.type}:${element.id}`),
    provider: 'osm', name: tags.name, lat, lng,
    address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' '),
    cuisineType: tags.cuisine?.replace(/;/g, ', ') || 'Restaurant',
    categories: [tags.amenity, ...(tags.cuisine?.split(';') || [])].filter(Boolean),
    rating: null, userRatingsTotal: 0,
    mapsUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    sourceType: 'openstreetmap',
    sourceMetadata: { attribution: 'OpenStreetMap contributors', nutrition: 'not_provided' },
  };
}

function normalizeCandidates(rows, { lat, lng, radiusMiles }) {
  const seen = new Set();
  return rows.filter(Boolean).filter((place) => {
    if (!place.name || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
    const identity = place.placeId;
    const location = `${place.name.trim().toLowerCase()}|${place.lat.toFixed(4)}|${place.lng.toFixed(4)}`;
    if (!identity || seen.has(identity) || seen.has(location)) return false;
    seen.add(identity);
    seen.add(location);
    return true;
  }).map((place) => ({ ...place, distance: haversineMiles(lat, lng, place.lat, place.lng) }))
    .filter((place) => place.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}

async function discover(options) {
  const { lat, lng, radiusMiles, keyword } = options;
  if (env.fallbackMode || env.restaurantProvider === 'local') {
    return { rows: googlePlacesService.buildAthensFallbackPlaces(options), provider: 'local', fallbackReason: 'demo_mode' };
  }
  if (Date.now() < retryAfter) {
    return { rows: googlePlacesService.buildAthensFallbackPlaces(options), provider: 'local', fallbackReason: 'provider_cooldown' };
  }
  try {
    if (env.googleApiKey && env.restaurantProvider !== 'osm') {
      const rows = await googlePlacesService.searchNearbyRestaurants({ ...options, enrichDetails: false, allowFallback: false });
      return { provider: 'google', rows: rows.map((place) => ({
        ...place, placeId: restaurantId('google', place.placeId), legacyIds: [place.placeId],
        provider: 'google', sourceType: 'google_places',
      })) };
    }
    // Query nearby POIs, not menu items. User text never enters Overpass QL.
    const query = `[out:json][timeout:5];nwr[amenity~"^(restaurant|fast_food)$"](around:${Math.round(milesToMeters(Math.min(radiusMiles, 10)))},${lat},${lng});out center tags;`;
    const response = await axios.get(env.overpassUrl, {
      params: { data: query }, timeout: 6500, maxContentLength: 4 * 1024 * 1024,
      headers: { 'User-Agent': 'recommendation-system-model/1.0 (student restaurant discovery)' },
    });
    if (!Array.isArray(response.data?.elements) || response.data.remark) throw new Error('Incomplete Overpass response');
    return { rows: response.data.elements.map(normalizeOsm), provider: 'osm', rawCount: response.data.elements.length };
  } catch (error) {
    retryAfter = Date.now() + 60 * 1000;
    logger.warn('Restaurant provider unavailable; using local demo catalog.', { status: error.response?.status || error.code || 'upstream_error' });
    return { rows: googlePlacesService.buildAthensFallbackPlaces({ lat, lng, radiusMiles, keyword }), provider: 'local', fallbackReason: 'provider_unavailable' };
  }
}

async function searchNearbyRestaurants(options) {
  const { lat, lng, radiusMiles = 5, keyword = '' } = options;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !Number.isFinite(radiusMiles) || radiusMiles <= 0 || radiusMiles > 20) {
    throw new Error('Invalid restaurant search location');
  }
  const provider = env.restaurantProvider === 'local' || env.fallbackMode ? 'local' : env.googleApiKey && env.restaurantProvider !== 'osm' ? 'google' : 'osm';
  const key = [provider, lat, lng, radiusMiles, provider === 'google' ? keyword.toLowerCase() : ''].join('|');
  const cached = cache.get(key);
  let data = cached && cached.expires > Date.now() ? cached.data : null;
  if (!data) {
    if (!pending.has(key)) {
      const request = discover({ lat, lng, radiusMiles, keyword }).then((result) => {
        const normalized = normalizeCandidates(result.rows, { lat, lng, radiusMiles });
        const value = { ...result, rows: normalized, normalizedCount: normalized.length, rawCount: result.rawCount ?? result.rows.length, fetchedAt: new Date().toISOString() };
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { data: value, expires: Date.now() + (result.fallbackReason === 'provider_unavailable' || result.fallbackReason === 'provider_cooldown' ? 60000 : TTL) });
        return value;
      }).finally(() => pending.delete(key));
      pending.set(key, request);
    }
    data = await pending.get(key);
  }
  // OSM cuisine/name tags provide relevance, not proof a queried dish is on the menu.
  const words = keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const relevance = (place) => words.filter((word) => `${place.name} ${place.cuisineType}`.toLowerCase().includes(word)).length;
  const foodImage = data.provider === 'local' ? buildFoodImage(keyword) : null;
  const candidates = [...data.rows].sort((a, b) => relevance(b) - relevance(a) || a.distance - b.distance).slice(0, 50)
    .map((place) => data.provider === 'local' ? { ...place, foodName: keyword, foodImage } : place);
  return {
    candidates,
    source: {
      provider: data.provider, fallback: data.provider === 'local',
      fallbackReason: data.fallbackReason || null,
      rawCount: data.rawCount, normalizedCount: data.normalizedCount,
      candidateCount: candidates.length,
      uniqueCuisines: new Set(candidates.map((item) => item.cuisineType).filter((cuisine) => cuisine && cuisine !== 'Restaurant')).size,
      duplicateCount: candidates.length - new Set(candidates.map((item) => item.placeId)).size,
      discoveryRadiusMiles: data.provider === 'osm' ? Math.min(radiusMiles, 10) : radiusMiles,
      fetchedAt: data.fetchedAt,
      attribution: data.provider === 'osm' ? 'OpenStreetMap contributors' : null,
    },
  };
}

module.exports = { searchNearbyRestaurants, normalizeOsm, normalizeCandidates };
