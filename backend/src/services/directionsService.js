const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');
const AppError = require('../utils/appError');
const { haversineMiles, metersToMiles } = require('../utils/geo');

function formatDuration(minutes) {
  if (minutes < 60) {
    return `${Math.round(minutes)} mins`;
  }

  const hours = Math.floor(minutes / 60);
  const rem = Math.round(minutes % 60);
  return `${hours} hr ${rem} min`;
}

function formatDistance(miles) {
  return `${miles.toFixed(2)} mi`;
}

function fallbackRoute({ originLat, originLng, destinationLat, destinationLng, mode }) {
  const distanceMiles = haversineMiles(originLat, originLng, destinationLat, destinationLng);

  const speedByMode = {
    walking: 3,
    running: 6,
    driving: 28,
  };

  const mph = speedByMode[mode] || 3;
  const durationMinutes = (distanceMiles / mph) * 60;

  return {
    source: 'fallback',
    distanceMiles,
    distanceText: formatDistance(distanceMiles),
    durationMinutes,
    durationText: formatDuration(durationMinutes),
    polyline: null,
  };
}

async function getRouteFromGoogle(payload) {
  const apiMode = payload.mode === 'running' ? 'walking' : payload.mode;
  const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
    params: {
      key: env.googleApiKey,
      origin: `${payload.originLat},${payload.originLng}`,
      destination: `${payload.destinationLat},${payload.destinationLng}`,
      mode: apiMode,
    },
  });

  if (response.data.status !== 'OK') {
    throw new AppError(
      `Google Directions error: ${response.data.status}`,
      502,
      'UPSTREAM_ERROR',
      response.data.error_message ? { errorMessage: response.data.error_message } : null
    );
  }

  const route = response.data.routes?.[0];
  const leg = route?.legs?.[0];

  if (!route || !leg) {
    throw new AppError('Google Directions returned no route', 502, 'UPSTREAM_ERROR');
  }

  const distanceMiles = metersToMiles(leg.distance.value);
  let durationMinutes = leg.duration.value / 60;

  if (payload.mode === 'running') {
    durationMinutes = durationMinutes / 2;
  }

  return {
    source: 'google',
    distanceMiles,
    distanceText: formatDistance(distanceMiles),
    durationMinutes,
    durationText: formatDuration(durationMinutes),
    polyline: route.overview_polyline?.points || null,
  };
}

async function getRoute(payload) {
  if (!env.googleApiKey) {
    logger.warn('GOOGLE_API_KEY not set for directions. Using fallback route calculation.');
    return fallbackRoute(payload);
  }

  try {
    return await getRouteFromGoogle(payload);
  } catch (error) {
    if (env.enableGoogleFallbackMocks) {
      logger.warn('Google Directions failed. Falling back to local route estimation.', {
        message: error.message,
      });
      return fallbackRoute(payload);
    }

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('Unable to fetch route from Google Directions', 502, 'UPSTREAM_ERROR');
  }
}

module.exports = {
  getRoute,
};
