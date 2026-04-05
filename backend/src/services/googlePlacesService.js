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

const ATHENS_CURATED_RESTAURANTS = [
  {
    name: 'The Place',
    cuisineType: 'Southern',
    rating: 4.6,
    userRatingsTotal: 1800,
    address: '229 E Broad St, Athens, GA 30601',
    lat: 33.9594,
    lng: -83.3738,
    websiteUrl: 'https://www.theplaceathens.com',
  },
  {
    name: "Mamma's Boy",
    cuisineType: 'Breakfast',
    rating: 4.5,
    userRatingsTotal: 2400,
    address: '197 Oak St, Athens, GA 30601',
    lat: 33.9539,
    lng: -83.3655,
    websiteUrl: 'https://mamasboyathens.com',
  },
  {
    name: 'Taqueria Tsunami',
    cuisineType: 'Mexican Fusion',
    rating: 4.4,
    userRatingsTotal: 1500,
    address: '320 E Clayton St, Athens, GA 30601',
    lat: 33.9588,
    lng: -83.3731,
    websiteUrl: 'https://taqueriatsunami.com',
  },
  {
    name: 'Your Pie Athens',
    cuisineType: 'Pizza',
    rating: 4.3,
    userRatingsTotal: 1300,
    address: '175 N Lumpkin St, Athens, GA 30601',
    lat: 33.9586,
    lng: -83.3774,
    websiteUrl: 'https://yourpie.com',
  },
  {
    name: 'Clocked',
    cuisineType: 'Burgers',
    rating: 4.4,
    userRatingsTotal: 2000,
    address: '259 W Washington St, Athens, GA 30601',
    lat: 33.9583,
    lng: -83.3782,
    websiteUrl: 'https://clockedathens.com',
  },
  {
    name: 'Last Resort Grill',
    cuisineType: 'American',
    rating: 4.5,
    userRatingsTotal: 2200,
    address: '184 W Clayton St, Athens, GA 30601',
    lat: 33.9581,
    lng: -83.3773,
    websiteUrl: 'https://lastresortgrill.com',
  },
  {
    name: 'Chipotle Athens',
    cuisineType: 'Mexican',
    rating: 4.2,
    userRatingsTotal: 2200,
    address: '1850 Epps Bridge Pkwy, Athens, GA 30606',
    lat: 33.9329,
    lng: -83.4419,
    websiteUrl: 'https://www.chipotle.com',
  },
  {
    name: "McDonald's Athens",
    cuisineType: 'Fast Food',
    rating: 4.0,
    userRatingsTotal: 3300,
    address: '121 Alps Rd, Athens, GA 30606',
    lat: 33.9485,
    lng: -83.4161,
    websiteUrl: 'https://www.mcdonalds.com',
  },
  {
    name: 'Subway Athens',
    cuisineType: 'Sandwiches',
    rating: 4.1,
    userRatingsTotal: 1000,
    address: '437 E Broad St, Athens, GA 30601',
    lat: 33.9598,
    lng: -83.371,
    websiteUrl: 'https://www.subway.com',
  },
  {
    name: 'Taco Bell Athens',
    cuisineType: 'Tex-Mex',
    rating: 4.0,
    userRatingsTotal: 1700,
    address: '1905 W Broad St, Athens, GA 30606',
    lat: 33.9514,
    lng: -83.4063,
    websiteUrl: 'https://www.tacobell.com',
  },
];

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

function buildPlaceMapsUrl(placeId) {
  if (!placeId) {
    return null;
  }

  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

function buildWebSearchUrl(name) {
  if (!name) {
    return null;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(`${name} restaurant`)}`;
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
    mapsUrl: buildPlaceMapsUrl(result.place_id),
    websiteUrl: null,
    websiteSearchUrl: buildWebSearchUrl(result.name),
  };
}

function buildAthensFallbackPlaces({ keyword, lat, lng, radiusMiles }) {
  const normalizedKeyword = toTitleCase(keyword);

  return ATHENS_CURATED_RESTAURANTS
    .map((place, index) => {
      const distance = Number(haversineMiles(lat, lng, place.lat, place.lng).toFixed(2));

      return {
        placeId: `athens-curated-${index + 1}`,
        name: place.name,
        address: place.address,
        rating: place.rating,
        userRatingsTotal: place.userRatingsTotal,
        reviewSnippet: compactReviewSnippet(
          `${place.name} is a reliable ${place.cuisineType.toLowerCase()} option in Athens for ${keyword}.`
        ),
        cuisineType: place.cuisineType,
        lat: place.lat,
        lng: place.lng,
        distance,
        restaurantImage: buildRestaurantImage(place.name, place.cuisineType),
        foodImage: buildFoodImage(normalizedKeyword),
        foodName: normalizedKeyword,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`,
        websiteUrl: place.websiteUrl,
        websiteSearchUrl: buildWebSearchUrl(place.name),
        sourceType: 'athens_curated_fallback',
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
      fields: 'rating,user_ratings_total,reviews,types,photos,editorial_summary,url,website',
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
      mapsUrl: details.url || place.mapsUrl,
      websiteUrl: details.website || place.websiteUrl || '',
    };
  });
}

async function searchNearbyRestaurants({ keyword, lat, lng, radiusMiles, enrichDetails = true }) {
  if (!env.googleApiKey) {
    if (env.enableGoogleFallbackMocks) {
      logger.warn('GOOGLE_API_KEY is missing. Using curated Athens fallback restaurants.');
      return buildAthensFallbackPlaces({ keyword, lat, lng, radiusMiles });
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
      logger.warn('Google Places API failed. Falling back to curated Athens restaurants.', {
        message: error.message,
      });
      return buildAthensFallbackPlaces({ keyword, lat, lng, radiusMiles });
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
