const ATHENS_GEORGIA_CENTER = {
  lat: 33.9519,
  lng: -83.3576,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 2) {
  return Number(Number(value || 0).toFixed(decimals));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSearchOrigin(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
    return {
      lat: parsedLat,
      lng: parsedLng,
      source: 'user_location',
    };
  }

  return {
    lat: ATHENS_GEORGIA_CENTER.lat,
    lng: ATHENS_GEORGIA_CENTER.lng,
    source: 'athens_fallback',
  };
}

function estimateWalkingStats(distanceMiles, bodyWeightKg = 70) {
  const miles = Math.max(0, toNumber(distanceMiles, 0));
  const weight = clamp(toNumber(bodyWeightKg, 70), 35, 220);
  const steps = Math.round(miles * 2250);
  const caloriesPerMile = weight * 1.35;
  const caloriesBurned = Math.round(miles * caloriesPerMile);
  const minutes = Math.round((miles / 3) * 60);

  return {
    distanceMiles: round(miles, 2),
    estimatedSteps: steps,
    estimatedCaloriesBurned: caloriesBurned,
    estimatedMinutes: Math.max(1, minutes),
  };
}

function estimateTravelByMode(distanceMiles, mode = 'walking') {
  const miles = Math.max(0, toNumber(distanceMiles, 0));
  const normalizedMode = String(mode || 'walking').toLowerCase();
  const speedMph = normalizedMode === 'driving' ? 24 : normalizedMode === 'running' ? 6 : 3;
  const durationMinutes = Math.max(1, Math.round((miles / speedMph) * 60));

  return {
    mode: normalizedMode,
    distanceMiles: round(miles, 2),
    durationMinutes,
  };
}

function buildTravelEstimates(distanceMiles, bodyWeightKg = 70) {
  const walking = estimateWalkingStats(distanceMiles, bodyWeightKg);

  return {
    walking,
    driving: estimateTravelByMode(distanceMiles, 'driving'),
  };
}

module.exports = {
  ATHENS_GEORGIA_CENTER,
  normalizeSearchOrigin,
  estimateWalkingStats,
  estimateTravelByMode,
  buildTravelEstimates,
};
