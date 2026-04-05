const DEFAULT_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function nowMs() {
  return Date.now();
}

function getCacheKey(scope, keyParts = []) {
  return [scope, ...keyParts.map((item) => String(item || '').trim())].join('::');
}

function readCached(scope, keyParts = [], ttlMs = DEFAULT_TTL_MS) {
  const key = getCacheKey(scope, keyParts);
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (nowMs() - entry.cachedAt > ttlMs) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeCached(scope, keyParts = [], value) {
  const key = getCacheKey(scope, keyParts);
  cache.set(key, {
    cachedAt: nowMs(),
    value,
  });
  return value;
}

module.exports = {
  DEFAULT_TTL_MS,
  readCached,
  writeCached,
};
