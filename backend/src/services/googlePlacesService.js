const axios = require('axios');
const AppError = require('../utils/appError');
const env = require('../config/env');
const logger = require('../utils/logger');
const { haversineMiles, milesToMeters } = require('../utils/geo');

function normalizePlace(result, lat, lng) {
  const placeLat = result.geometry?.location?.lat;
  const placeLng = result.geometry?.location?.lng;

  if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) {
    return null;
  }

  return {
    placeId: result.place_id,
    name: result.name,
    address: result.vicinity || result.formatted_address || 'Address unavailable',
    rating: Number.isFinite(result.rating) ? result.rating : null,
    lat: placeLat,
    lng: placeLng,
    distance: Number(haversineMiles(lat, lng, placeLat, placeLng).toFixed(2)),
  };
}

function buildMockPlaces({ keyword, lat, lng, radiusMiles }) {
  const offsets = [
    [0.004, 0.003],
    [0.006, -0.002],
    [-0.003, 0.004],
    [0.008, 0.007],
    [-0.006, -0.004],
    [0.012, -0.005],
    [-0.009, 0.006],
    [0.01, 0.001],
  ];

  return offsets
    .map((offset, index) => {
      const placeLat = lat + offset[0];
      const placeLng = lng + offset[1];
      const distance = Number(haversineMiles(lat, lng, placeLat, placeLng).toFixed(2));

      return {
        placeId: `mock-place-${index + 1}`,
        name: `${keyword} Spot ${index + 1}`,
        address: `${120 + index} Demo Street`,
        rating: Number((3.5 + (index % 4) * 0.3).toFixed(1)),
        lat: placeLat,
        lng: placeLng,
        distance,
      };
    })
    .filter((place) => place.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}

async function searchNearbyRestaurants({ keyword, lat, lng, radiusMiles }) {
  if (!env.googleApiKey) {
    if (env.enableGoogleFallbackMocks) {
      logger.warn('GOOGLE_API_KEY is missing. Using fallback restaurant mocks.');
      return buildMockPlaces({ keyword, lat, lng, radiusMiles });
    }

    throw new AppError('GOOGLE_API_KEY is not configured', 500, 'CONFIG_ERROR');
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
      params: {
        key: env.googleApiKey,
        location: `${lat},${lng}`,
        radius: milesToMeters(radiusMiles),
        keyword,
        type: 'restaurant',
      },
    });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      throw new AppError(
        `Google Places error: ${response.data.status}`,
        502,
        'UPSTREAM_ERROR',
        response.data.error_message ? { errorMessage: response.data.error_message } : null
      );
    }

    const places = (response.data.results || [])
      .map((result) => normalizePlace(result, lat, lng))
      .filter(Boolean)
      .filter((place) => place.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);

    return places;
  } catch (error) {
    if (env.enableGoogleFallbackMocks) {
      logger.warn('Google Places API failed. Falling back to mock places.', {
        message: error.message,
      });
      return buildMockPlaces({ keyword, lat, lng, radiusMiles });
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('Failed to fetch places from Google', 502, 'UPSTREAM_ERROR');
  }
}

module.exports = {
  searchNearbyRestaurants,
};
