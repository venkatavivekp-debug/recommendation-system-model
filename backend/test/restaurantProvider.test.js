const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const env = require('../src/config/env');
const provider = require('../src/services/restaurantProviderService');
const google = require('../src/services/googlePlacesService');
const { restaurantId } = require('../src/utils/restaurantIdentity');
const feedback = require('../src/services/feedbackLearningService');
const bandit = require('../src/services/banditDecisionService');
const scoring = require('../src/services/recommendationScoringService');

test('restaurant identities and legacy fallback aliases are stable', () => {
  const options = { lat: 33.9519, lng: -83.3576, radiusMiles: 5, keyword: 'chicken' };
  const first = google.buildAthensFallbackPlaces(options);
  const second = google.buildAthensFallbackPlaces({ ...options, keyword: 'rice' });
  assert.deepEqual(first.map((x) => x.placeId), second.map((x) => x.placeId));
  const kfc = first.find((x) => x.name === 'KFC');
  assert.ok(kfc.legacyIds.includes('athens-fallback-7'));
  assert.ok(kfc.legacyIds.includes('rest-kfc-athens'));
  const profile = { itemPreferences: feedback.buildItemPreferences([{ candidateId: 'athens-fallback-7', action: 'not_interested', createdAt: new Date().toISOString() }]) };
  assert.equal(feedback.itemFeedback(kfc, profile).suppressed, true);
  assert.equal(restaurantId('osm', 'node:12'), 'restaurant:osm:node:12');
  assert.notEqual(restaurantId('osm', 'node:12'), restaurantId('osm', 'way:12'));
});

test('OSM nodes and way centers normalize without invented ratings or nutrition', () => {
  const place = provider.normalizeOsm({ type: 'way', id: 12, center: { lat: 33.95, lon: -83.35 }, tags: { name: 'Fixture restaurant', amenity: 'restaurant', cuisine: 'thai;asian' } });
  assert.equal(place.placeId, 'restaurant:osm:way:12');
  assert.deepEqual(place.categories, ['restaurant', 'thai', 'asian']);
  assert.equal(place.rating, null);
  assert.equal(place.nutrition, undefined);
  assert.equal(provider.normalizeOsm({ type: 'node', id: 3, tags: {} }), null);
});

test('exact dislikes persist, strengthen, expire and yield to a later positive action', () => {
  const now = Date.now();
  const row = (action, ago = 0) => ({ candidateId: 'restaurant:osm:node:12', action, createdAt: new Date(now - ago).toISOString() });
  const one = feedback.buildItemPreferences([row('not_interested')]);
  const two = feedback.buildItemPreferences([row('not_interested'), row('not_interested', 1000)]);
  const candidate = { id: 'restaurant:osm:node:12', recommendation: { confidence: 0.99 } };
  const profile = { itemPreferences: two };
  assert.ok(two[candidate.id].weight < one[candidate.id].weight);
  assert.equal(bandit.rankCandidatesWithBandit([candidate], { domain: 'food', feedbackSignals: profile, explorationRate: 1 }).length, 0);
  assert.equal(scoring.scoreCandidates([candidate], { feedbackProfile: profile }).length, 0);
  const expired = feedback.buildItemPreferences([row('not_interested', 8 * 86400000)]);
  assert.equal(expired[candidate.id].suppressed, false);
  const repeated = feedback.buildItemPreferences([row('not_interested', 8 * 86400000), row('not_interested', 9 * 86400000)]);
  assert.equal(repeated[candidate.id].suppressed, true);
  const capped = feedback.buildItemPreferences(Array.from({ length: 5 }, (_, i) => row('not_interested', (31 + i) * 86400000)));
  assert.equal(capped[candidate.id].suppressed, false);
  const rejected = feedback.buildItemPreferences([row('not_interested'), row('save', 1000), row('save', 2000)]);
  assert.equal(rejected[candidate.id].weight, -0.8);
  assert.equal(rejected[candidate.id].suppressed, true);
  const ignored = feedback.buildItemPreferences([row('ignored'), row('not_interested', 1000)]);
  assert.equal(ignored[candidate.id].suppressed, true);
  const liked = feedback.buildItemPreferences([row('save'), row('not_interested', 1000)]);
  assert.equal(liked[candidate.id].suppressed, false);
  assert.ok(liked[candidate.id].weight > 0);
  const selected = feedback.buildItemPreferences([row('selected'), row('not_interested', 1000), row('not_interested', 2000)]);
  assert.equal(selected[candidate.id].suppressed, false);
  assert.equal(feedback.itemFeedback({ ...candidate, id: 'other' }, profile).weight, 0);
});

test('zero affinity remains zero rather than falling through to history defaults', () => {
  const ranked = bandit.rankCandidatesWithBandit([{ id: 'a', recommendation: { confidence: 0.5, features: { interactionAffinity: 0 } } }, { id: 'b', recommendation: { confidence: 0.5, features: { interactionAffinity: 0.5 } } }], { explorationRate: 0 });
  assert.equal(ranked[0].id, 'b');
});

test('case-sensitive provider IDs do not share suppression or affinity', () => {
  const itemPreferences = feedback.buildItemPreferences([{ candidateId: 'restaurant:google:AbC', action: 'not_interested', createdAt: new Date().toISOString() }]);
  const profile = { itemPreferences, preferenceAffinities: { items: [{ key: 'restaurant:google:AbC', weight: -0.8 }] } };
  assert.equal(feedback.itemFeedback({ id: 'restaurant:google:AbC' }, profile).suppressed, true);
  assert.equal(feedback.itemFeedback({ id: 'restaurant:google:abc' }, profile).suppressed, false);
  assert.equal(scoring.affinityFit({ id: 'restaurant:google:abc' }, profile), 0.5);
});

test('cached fallback places keep stable IDs but use the current food illustration', async (t) => {
  const previousProvider = env.restaurantProvider;
  env.restaurantProvider = 'local';
  t.after(() => { env.restaurantProvider = previousProvider; });
  const options = { lat: 33.9519, lng: -83.3576, radiusMiles: 4 };
  const first = await provider.searchNearbyRestaurants({ ...options, keyword: 'chicken' });
  const second = await provider.searchNearbyRestaurants({ ...options, keyword: 'rice' });
  assert.equal(first.source.fetchedAt, second.source.fetchedAt);
  const original = first.candidates[0];
  const updated = second.candidates.find((item) => item.placeId === original.placeId);
  assert.ok(updated);
  assert.equal(updated.foodName, 'rice');
  assert.notEqual(updated.foodImage, original.foodImage);
});

test('equal-time feedback is newest first and prototype-like IDs are ordinary items', async (t) => {
  const store = require('../src/models/dataStore');
  const interactions = require('../src/models/recommendationInteractionModel');
  const createdAt = new Date().toISOString();
  t.mock.method(store, 'readData', async () => ({ recommendationInteractions: [
    { userId: 'fixture', candidateId: '__proto__', action: 'save', createdAt },
    { userId: 'fixture', candidateId: '__proto__', action: 'not_interested', createdAt },
  ] }));
  const rows = await interactions.listInteractionsByUser('fixture', 10, { feedbackOnly: true });
  const profile = feedback.buildItemPreferences(rows);
  assert.equal(profile.__proto__.lastAction, 'not_interested');
  assert.equal(profile.__proto__.suppressed, true);
});

test('restaurant suppression does not replace existing media affinities', async (t) => {
  const content = require('../src/models/userContentInteractionModel');
  t.mock.method(content, 'listInteractionsByUser', async () => [{ itemId: 'movie-1', title: 'Fixture movie', action: 'save', createdAt: new Date().toISOString() }]);
  const profile = await feedback.buildFeedbackProfile('fixture', { domain: 'media' });
  assert.deepEqual(profile.itemPreferences, {});
  assert.ok(profile.preferenceAffinities.items.some((item) => item.key === 'fixture movie' && item.weight > 0));
});

test('provider caches and deduplicates a larger bounded candidate pool', async (t) => {
  env.restaurantProvider = 'osm';
  env.fallbackMode = false;
  let calls = 0;
  // Synthetic provider fixtures are used only here, never in the application catalog.
  const elements = Array.from({ length: 60 }, (_, i) => ({ type: 'node', id: i + 1, lat: 33.95 + i * 0.0001, lon: -83.35, tags: { name: `Fixture ${i}`, amenity: 'restaurant', cuisine: i % 2 ? 'thai' : 'mexican' } }));
  t.mock.method(axios, 'get', async () => { calls++; return { data: { elements: [...elements, elements[0], { ...elements[0], type: 'way', id: 100 }] } }; });
  const options = { lat: 33.95, lng: -83.35, radiusMiles: 5, keyword: 'chicken' };
  const [first, second] = await Promise.all([provider.searchNearbyRestaurants(options), provider.searchNearbyRestaurants(options)]);
  const nextQuery = await provider.searchNearbyRestaurants({ ...options, keyword: 'rice' });
  assert.equal(calls, 1);
  assert.equal(first.source.rawCount, 62);
  assert.equal(first.source.normalizedCount, 60);
  assert.equal(first.candidates.length, 50);
  assert.equal(new Set(first.candidates.map((x) => x.placeId)).size, 50);
  assert.deepEqual(second.candidates, nextQuery.candidates);
});

test('Google discovery keeps provider IDs and aliases without exposing its key', async (t) => {
  const previousKey = env.googleApiKey;
  env.restaurantProvider = 'auto';
  env.googleApiKey = 'fixture-only-key';
  t.after(() => { env.googleApiKey = previousKey; env.restaurantProvider = 'osm'; });
  t.mock.method(axios, 'get', async () => ({ data: { status: 'OK', results: [{ place_id: 'GoogleFixture', name: 'Fixture place', geometry: { location: { lat: 33.95, lng: -83.35 } }, types: ['restaurant'] }] } }));
  const result = await provider.searchNearbyRestaurants({ lat: 33.95, lng: -83.35, radiusMiles: 4, keyword: 'rice' });
  assert.equal(result.source.provider, 'google');
  assert.equal(result.source.fallback, false);
  assert.equal(result.candidates[0].placeId, 'restaurant:google:GoogleFixture');
  assert.deepEqual(result.candidates[0].legacyIds, ['GoogleFixture']);
  assert.ok(!JSON.stringify(result).includes(env.googleApiKey));
});

test('successful empty provider response stays empty; timeouts use labelled fallback and cooldown', async (t) => {
  let calls = 0;
  t.mock.method(axios, 'get', async () => { calls++; return { data: { elements: [] } }; });
  const empty = await provider.searchNearbyRestaurants({ lat: 1, lng: 1, radiusMiles: 2 });
  assert.equal(empty.candidates.length, 0);
  assert.equal(empty.source.fallback, false);
  t.mock.restoreAll();
  t.mock.method(axios, 'get', async () => { calls++; throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }); });
  const fallback = await provider.searchNearbyRestaurants({ lat: 33.9519, lng: -83.3576, radiusMiles: 5 });
  assert.ok(fallback.candidates.length > 0);
  assert.equal(fallback.source.provider, 'local');
  assert.equal(fallback.source.fallbackReason, 'provider_unavailable');
  await provider.searchNearbyRestaurants({ lat: 33.952, lng: -83.3576, radiusMiles: 5 });
  assert.equal(calls, 2);
});
