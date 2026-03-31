const directionsService = require('./directionsService');
const { calculateCaloriesBurned } = require('./fitnessService');

async function buildRouteSummary(payload) {
  const route = await directionsService.getRoute(payload);
  const caloriesBurned = calculateCaloriesBurned(route.distanceMiles, payload.mode);

  const response = {
    mode: payload.mode,
    source: route.source,
    distance: {
      miles: Number(route.distanceMiles.toFixed(2)),
      text: route.distanceText,
    },
    duration: {
      minutes: Number(route.durationMinutes.toFixed(1)),
      text: route.durationText,
    },
    caloriesBurned,
    polyline: route.polyline,
  };

  if (Number.isFinite(payload.consumedCalories)) {
    response.consumedCalories = payload.consumedCalories;
    response.calorieBalance = Number((payload.consumedCalories - caloriesBurned).toFixed(0));
  }

  return response;
}

module.exports = {
  buildRouteSummary,
};
