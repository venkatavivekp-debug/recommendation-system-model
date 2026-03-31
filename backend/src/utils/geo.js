const EARTH_RADIUS_MILES = 3958.8;
const METERS_PER_MILE = 1609.34;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

function milesToMeters(miles) {
  return Math.round(miles * METERS_PER_MILE);
}

function metersToMiles(meters) {
  return meters / METERS_PER_MILE;
}

module.exports = {
  haversineMiles,
  milesToMeters,
  metersToMiles,
};
