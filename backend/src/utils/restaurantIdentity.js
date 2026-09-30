const { createHash } = require('crypto');

function restaurantId(provider, providerId, place = {}) {
  if (providerId) return `restaurant:${provider}:${String(providerId).trim()}`;
  const location = [place.name, place.address, place.lat, place.lng]
    .map((value) => String(value ?? '').trim().toLowerCase()).join('|');
  return `restaurant:${provider}:${createHash('sha256').update(location).digest('hex').slice(0, 20)}`;
}

module.exports = { restaurantId };
