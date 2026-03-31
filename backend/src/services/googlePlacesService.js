const axios = require('axios');
const AppError = require('../utils/appError');
const env = require('../config/env');
const logger = require('../utils/logger');
const { haversineMiles, milesToMeters } = require('../utils/geo');
const { buildRestaurantImage, buildFoodImage, compactReviewSnippet } = require('../utils/media');

const GENERIC_TYPES = new Set([
  'restaurant',
  'food',
  'point_of_interest',
  'establishment',
  'meal_takeaway',
  'meal_delivery',
]);

function toTitleCase(text) {
  return String(text || '')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractCuisine(types = []) {
  const cuisine = types.find((type) => !GENERIC_TYPES.has(type));
  return cuisine ? toTitleCase(cuisine.replace(/_/g, ' ')) : 'Local Cuisine';
}

function buildGooglePhotoUrl(photoReference) {
  if (!photoReference || !env.googleApiKey) {
    return null;
  }

  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoReference}&key=${env.googleApiKey}`;
}

function normalizePlace(result, lat, lng, keyword) {
  const placeLat = result.geometry?.location?.lat;
  const placeLng = result.geometry?.location?.lng;

  if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) {
    return null;
  }

  const cuisineType = extractCuisine(result.types || []);
  const restaurantImage =
    buildGooglePhotoUrl(result.photos?.[0]?.photo_reference) || buildRestaurantImage(result.name, cuisineType);

  return {
    placeId: result.place_id,
    name: result.name,
    address: result.vicinity || result.formatted_address || 'Address unavailable',
    rating: Number.isFinite(result.rating) ? result.rating : null,
    userRatingsTotal: Number(result.user_ratings_total || 0),
    reviewSnippet: '',
    cuisineType,
    lat: placeLat,
    lng: placeLng,
    distance: Number(haversineMiles(lat, lng, placeLat, placeLng).toFixed(2)),
    restaurantImage,
    foodImage: buildFoodImage(toTitleCase(keyword)),
    foodName: toTitleCase(keyword),
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

  const cuisineMap = ['Italian', 'Mediterranean', 'American', 'Mexican', 'Japanese', 'Indian'];

  return offsets
    .map((offset, index) => {
      const placeLat = lat + offset[0];
      const placeLng = lng + offset[1];
      const distance = Number(haversineMiles(lat, lng, placeLat, placeLng).toFixed(2));
      const cuisineType = cuisineMap[index % cuisineMap.length];
      const placeName = `${toTitleCase(keyword)} House ${index + 1}`;

      return {
        placeId: `mock-place-${index + 1}`,
        name: placeName,
        address: `${120 + index} Demo Street`,
        rating: Number((3.5 + (index % 4) * 0.3).toFixed(1)),
        userRatingsTotal: 30 + index * 17,
        reviewSnippet: compactReviewSnippet(
          `Popular ${keyword} option with reliable portions and quick service. Good pick for repeat visits.`
        ),
        cuisineType,
        lat: placeLat,
        lng: placeLng,
        distance,
        restaurantImage: buildRestaurantImage(placeName, cuisineType),
        foodImage: buildFoodImage(toTitleCase(keyword)),
        foodName: toTitleCase(keyword),
      };
    })
    .filter((place) => place.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}

async function fetchPlaceDetails(placeId) {
  const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
    params: {
      key: env.googleApiKey,
      place_id: placeId,
      fields: 'rating,user_ratings_total,reviews,types,photos,editorial_summary',
    },
  });

  if (response.data.status !== 'OK') {
    return null;
  }

  return response.data.result || null;
}

async function enrichPlacesWithDetails(places) {
  const slice = places.slice(0, 8);

  const detailsById = await Promise.all(
    slice.map(async (place) => {
      try {
        const details = await fetchPlaceDetails(place.placeId);
        return [place.placeId, details];
      } catch (error) {
        return [place.placeId, null];
      }
    })
  );

  const detailMap = new Map(detailsById);

  return places.map((place) => {
    const details = detailMap.get(place.placeId);

    if (!details) {
      return place;
    }

    const reviewText = details.reviews?.[0]?.text || details.editorial_summary?.overview || '';
    const cuisineType = extractCuisine(details.types || []);

    return {
      ...place,
      rating: Number.isFinite(details.rating) ? details.rating : place.rating,
      userRatingsTotal: Number(details.user_ratings_total || place.userRatingsTotal || 0),
      reviewSnippet: compactReviewSnippet(reviewText),
      cuisineType,
      restaurantImage:
        buildGooglePhotoUrl(details.photos?.[0]?.photo_reference) || place.restaurantImage,
    };
  });
}

async function searchNearbyRestaurants({ keyword, lat, lng, radiusMiles, enrichDetails = true }) {
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

    let places = (response.data.results || [])
      .map((result) => normalizePlace(result, lat, lng, keyword))
      .filter(Boolean)
      .filter((place) => place.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);

    if (enrichDetails && places.length > 0) {
      places = await enrichPlacesWithDetails(places);
    }

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
