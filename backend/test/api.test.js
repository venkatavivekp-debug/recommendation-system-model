const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const testDir = path.join(os.tmpdir(), `recommendation-system-model-test-${process.pid}`);
process.env.NODE_ENV = 'test';
process.env.DATASTORE_PATH = path.join(testDir, 'store.json');
process.env.MONGODB_URI = '';
process.env.FALLBACK_MODE = 'false';
process.env.GOOGLE_API_KEY = '';
process.env.RESTAURANT_PROVIDER = 'local';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.RATE_LIMIT_WINDOW_MS = String(10 * 60 * 1000);

const app = require('../src/app');
const rateLimiter = require('../src/middleware/rateLimiter');
const crossDomainMappingService = require('../src/services/crossDomainMappingService');
const recommendationScoringService = require('../src/services/recommendationScoringService');

let server;
let baseUrl;
let token;

async function request(pathname, options = {}) {
  const headers = {
    ...(options.body || options.rawBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token && options.auth !== false ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.rawBody ?? (options.body ? JSON.stringify(options.body) : undefined),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_error) {
    json = null;
  }

  return { response, json, text };
}

test.before(async () => {
  await fs.mkdir(testDir, { recursive: true });
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const email = `student-${Date.now()}@example.com`;
  const password = 'student123';
  const register = await request('/api/auth/register', {
    auth: false,
    method: 'POST',
    body: {
      firstName: 'Student',
      lastName: 'Tester',
      email,
      password,
    },
  });
  assert.equal(register.response.status, 201);

  const login = await request('/api/auth/login', {
    auth: false,
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.response.status, 200);
  assert.ok(login.json?.data?.token);
  token = login.json.data.token;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await fs.rm(testDir, { recursive: true, force: true });
});

test('dashboard returns a stable summary payload', async () => {
  const { response, json } = await request('/api/dashboard');

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(json.data.today);
  assert.ok(json.data.recommendedForRemainingDay);
});

test('search endpoint handles normal and empty-result searches', async () => {
  const normal = await request('/api/search?q=healthy&type=all');
  assert.equal(normal.response.status, 200);
  assert.equal(normal.json.success, true);
  assert.ok(Array.isArray(normal.json.data.results));

  const unusual = await request('/api/search?q=zzzznotreal&type=all');
  assert.equal(unusual.response.status, 200);
  assert.equal(unusual.json.success, true);
  assert.ok(Array.isArray(unusual.json.data.results));
});

test('restaurant search uses its own item feedback on the next request', async () => {
  const before = await request('/api/search?q=rice&type=all');
  const target = before.json.data.results[0];
  assert.ok(target?.placeId);
  const feedback = await request('/api/food/feedback', {
    method: 'POST',
    body: {
      itemId: target.placeId,
      itemName: target.foodName,
      action: 'not_interested',
      contextType: 'search',
      mode: 'search',
    },
  });
  assert.equal(feedback.response.status, 201);
  const after = await request('/api/search?q=rice&type=all');
  const updated = after.json.data.results.find((item) => item.placeId === target.placeId);
  assert.equal(updated, undefined);
  assert.ok(feedback.json.data.profile.itemPreferences[target.placeId].weight < 0);
});

test('three restaurant dislikes survive fresh searches; saves increase rank; users remain isolated', async () => {
  const query = '/api/search?q=chicken&type=all';
  const initial = await request(query);
  const targets = initial.json.data.results.slice(0, 3);
  assert.equal(targets.length, 3);
  for (const target of targets) {
    const result = await request('/api/food/feedback', { method: 'POST', body: { itemId: target.placeId, itemName: target.name, action: 'not_interested', contextType: 'search' } });
    assert.equal(result.response.status, 201);
    const fresh = await request(query);
    assert.ok(!fresh.json.data.results.some((x) => x.placeId === target.placeId));
    const delivery = await request('/api/food/recommendations?mode=delivery');
    assert.ok(!delivery.json.data.recommendations.some((x) => x.id === target.placeId));
  }
  const beforeSave = await request(query);
  const liked = beforeSave.json.data.results[3];
  assert.ok(liked);
  await request('/api/food/feedback', { method: 'POST', body: { itemId: liked.placeId, itemName: liked.name, action: 'save', contextType: 'search' } });
  const afterSave = await request(query);
  const rank = afterSave.json.data.results.findIndex((x) => x.placeId === liked.placeId);
  assert.ok(rank < 3);
  assert.ok(afterSave.json.data.results[rank].recommendation.bandit.feedbackAdjustment > 0);
  const other = await request('/api/auth/register', { auth: false, method: 'POST', body: { firstName: 'Other', lastName: 'User', email: 'isolated@example.com', password: 'student123' } });
  assert.equal(other.response.status, 201);
  const otherLogin = await request('/api/auth/login', { auth: false, method: 'POST', body: { email: 'isolated@example.com', password: 'student123' } });
  const second = await request(query, { headers: { Authorization: `Bearer ${otherLogin.json.data.token}` } });
  assert.ok(second.json.data.results.some((x) => targets.some((target) => target.placeId === x.placeId)));
  assert.ok(second.json.data.results.every((x) => x.recommendation.bandit.feedbackAdjustment === 0));
});

test('daily boundaries agree with UTC calendar dates across timezone offsets', () => {
  const { startOfToday, endOfToday, toDateKey } = require('../src/utils/dateLock');
  const lateEvening = new Date('2026-09-27T23:27:00-04:00');
  assert.equal(toDateKey(lateEvening), '2026-09-28');
  assert.equal(startOfToday(lateEvening).toISOString(), '2026-09-28T00:00:00.000Z');
  assert.equal(endOfToday(lateEvening).toISOString(), '2026-09-28T23:59:59.999Z');
});

test('logistic training treats saved and helpful feedback as positive labels', async () => {
  const userService = require('../src/services/userService');
  const interactionModel = require('../src/models/recommendationInteractionModel');
  const mlModelService = require('../src/services/mlModelService');
  const email = 'feedback-labels@example.com';
  const registered = await request('/api/auth/register', {
    auth: false,
    method: 'POST',
    body: { firstName: 'Labels', lastName: 'Test', email, password: 'student123' },
  });
  assert.equal(registered.response.status, 201);
  const user = await userService.getUserByEmail(email);
  await interactionModel.createInteractions(Array.from({ length: 36 }, (_, index) => ({
    id: `label-test-${index}`,
    userId: user.id,
    eventType: 'shown',
    action: index < 3 ? 'save' : index < 6 ? 'helpful' : 'not_interested',
    chosen: 0,
    features: { proteinMatch: index < 6 ? 1 : 0 },
    createdAt: new Date().toISOString(),
  })));
  const model = await mlModelService.trainModel(user.id, { iterations: 1 });
  // Training requires at least six positives; the legacy 'shown' field must not override explicit feedback.
  assert.equal(model.trained, true);
  assert.equal(model.trainingSampleSize, 36);
});

test('food recommendations return ranked adaptive results', async () => {
  const { response, json } = await request('/api/food/recommendations?limit=5&q=bowl');

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data.recommendations));
  assert.ok(json.data.recommendations.length > 0);
  assert.ok(json.data.recommendations[0].recommendation?.rank >= 1);
  assert.equal(json.data.model, 'lightweight_rule_scoring_v1');
});

test('food feedback updates the profile used by future recommendations', async () => {
  const before = await request('/api/food/recommendations?limit=5&q=bowl');
  const target = before.json.data.recommendations[0];

  const feedback = await request('/api/food/feedback', {
    method: 'POST',
    body: {
      itemId: target.itemId || target.id,
      itemName: target.foodName || target.name,
      action: 'not_interested',
      contextType: 'daily',
      mode: 'daily',
      rank: target.recommendation?.rank,
      score: target.recommendation?.score,
      confidence: target.recommendation?.confidence,
      features: target.recommendation?.features || target.recommendation?.factors || {},
      sourceType: target.sourceType,
      cuisineType: target.cuisineType,
    },
  });

  assert.equal(feedback.response.status, 201);
  assert.equal(feedback.json.success, true);

  const after = await request('/api/food/recommendations?limit=5&q=bowl');
  const affinities = after.json.data.context.feedbackProfile.preferenceAffinities.items;
  const itemKey = String(target.itemId || target.id).toLowerCase();
  const nameKey = String(target.foodName || target.name).toLowerCase();
  const learnedSignal = affinities.find((entry) => entry.key === itemKey || entry.key === nameKey);

  assert.ok(learnedSignal);
  assert.ok(learnedSignal.weight < 0);
});

test('feedback affinity can change recommendation ranking order', () => {
  const candidates = [
    {
      id: 'alpha-bowl',
      title: 'Alpha Bowl',
      itemType: 'meal',
      cuisine: 'balanced',
      nutrition: { calories: 650, protein: 36, carbs: 54, fats: 18 },
      tags: ['balanced'],
    },
    {
      id: 'beta-bowl',
      title: 'Beta Bowl',
      itemType: 'meal',
      cuisine: 'balanced',
      nutrition: { calories: 650, protein: 36, carbs: 54, fats: 18 },
      tags: ['balanced'],
    },
  ];
  const context = {
    remaining: { calories: 650, protein: 40, carbs: 60, fats: 20 },
    macroFocus: 'balanced',
    preferences: {},
  };

  const before = recommendationScoringService.scoreCandidates(candidates, context, 2);
  assert.equal(before[0].id, 'alpha-bowl');

  const after = recommendationScoringService.scoreCandidates(
    candidates,
    {
      ...context,
      feedbackProfile: {
        acceptanceRate: 0.5,
        saveRate: 0.2,
        ignoreRate: 0.2,
        preferenceAffinities: {
          items: [{ key: 'alpha-bowl', weight: -1 }],
          cuisines: [],
          tags: [],
          sources: [],
        },
      },
    },
    2
  );

  assert.equal(after[0].id, 'beta-bowl');
  assert.ok(after[0].recommendation.score > after[1].recommendation.score);
});

test('workout context influences food scoring toward recovery meals', () => {
  const crossDomain = crossDomainMappingService.mapFitnessToFoodContext({
    exerciseSummary: {
      totalCaloriesBurned: 520,
      workoutsDone: 1,
      strengthWorkouts: 1,
      totalSteps: 7000,
    },
    preferences: {},
  });
  const candidates = [
    {
      id: 'recovery-bowl',
      title: 'Recovery Protein Bowl',
      itemType: 'meal',
      cuisine: 'balanced',
      nutrition: { calories: 680, protein: 46, carbs: 58, fats: 16 },
      tags: ['high-protein', 'balanced'],
    },
    {
      id: 'light-salad',
      title: 'Light Garden Salad',
      itemType: 'meal',
      cuisine: 'balanced',
      nutrition: { calories: 420, protein: 9, carbs: 38, fats: 14 },
      tags: ['light', 'balanced'],
    },
  ];

  assert.equal(crossDomain.macroFocus, 'protein');
  assert.ok(crossDomain.preferredTags.includes('high-protein'));

  const ranked = recommendationScoringService.scoreCandidates(
    candidates,
    {
      remaining: { calories: 650, protein: 45, carbs: 65, fats: 20 },
      preferences: {},
      crossDomain,
      macroFocus: crossDomain.macroFocus,
    },
    2
  );

  assert.equal(ranked[0].id, 'recovery-bowl');
  assert.ok(
    ranked[0].recommendation.features.crossDomainFit >
      ranked[1].recommendation.features.crossDomainFit
  );
});

test('invalid input and malformed JSON return safe errors', async () => {
  for (const query of ['radius=bad', 'radius=0', 'radius=21', 'lat=91&lng=0', 'lat=33']) {
    const invalidLocation = await request(`/api/food/recommendations?${query}`);
    assert.equal(invalidLocation.response.status, 400);
    assert.equal(invalidLocation.json.success, false);
  }
  const invalidSearch = await request('/api/search?q=&type=all');
  assert.equal(invalidSearch.response.status, 400);
  assert.equal(invalidSearch.json.success, false);

  const invalidFeedback = await request('/api/food/feedback', {
    method: 'POST',
    body: {},
  });
  assert.equal(invalidFeedback.response.status, 400);
  assert.equal(invalidFeedback.json.success, false);

  const malformed = await request('/api/search', {
    method: 'POST',
    rawBody: '{bad json',
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.json.success, false);
  assert.equal(malformed.json.error.code, 'INVALID_JSON');
});

test('robustness checks handle bad user input without crashes', async () => {
  const missingUser = await request('/api/dashboard', { auth: false });
  assert.equal(missingUser.response.status, 401);
  assert.equal(missingUser.json.success, false);

  const invalidRecommendationParams = await request(
    '/api/food/recommendations?limit=bad&poolSize=bad&q=%3Cscript%3Ealert(1)%3C%2Fscript%3E'
  );
  assert.equal(invalidRecommendationParams.response.status, 200);
  assert.equal(invalidRecommendationParams.json.success, true);
  assert.ok(Array.isArray(invalidRecommendationParams.json.data.recommendations));

  const oversizedSearch = await request(`/api/search?q=${'x'.repeat(500)}&type=all`);
  assert.equal(oversizedSearch.response.status, 400);
  assert.equal(oversizedSearch.json.success, false);

  const scriptLikeSearch = await request('/api/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E&type=all');
  assert.ok(scriptLikeSearch.response.status < 500);
  assert.equal(typeof scriptLikeSearch.json.success, 'boolean');

  const objectSearch = await request('/api/search', {
    method: 'POST',
    body: {
      q: { text: 'healthy' },
      type: 'all',
    },
  });
  assert.equal(objectSearch.response.status, 400);
  assert.equal(objectSearch.json.success, false);

  const invalidType = await request('/api/search?q=healthy&type=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  assert.equal(invalidType.response.status, 400);
  assert.equal(invalidType.json.success, false);

  const missingRecommendationId = await request('/api/food/feedback', {
    method: 'POST',
    body: {
      action: 'selected',
    },
  });
  assert.equal(missingRecommendationId.response.status, 400);
  assert.equal(missingRecommendationId.json.success, false);

  const objectFeedback = await request('/api/food/feedback', {
    method: 'POST',
    body: {
      itemId: { id: 'bad-shape' },
      action: 'save',
    },
  });
  assert.equal(objectFeedback.response.status, 400);
  assert.equal(objectFeedback.json.success, false);
});

test('rate limiter returns a safe response after repeated requests', async () => {
  const limitedApp = express();
  const limitKey = `rate-limit-test-${Date.now()}`;
  limitedApp.use(rateLimiter({ windowMs: 1000, maxRequests: 2, keyGenerator: () => limitKey }));
  limitedApp.get('/limited', (_req, res) => res.json({ success: true }));

  const limitedServer = http.createServer(limitedApp);
  await new Promise((resolve) => {
    limitedServer.listen(0, '127.0.0.1', resolve);
  });

  const limitedUrl = `http://127.0.0.1:${limitedServer.address().port}/limited`;

  try {
    const first = await fetch(limitedUrl);
    const second = await fetch(limitedUrl);
    const third = await fetch(limitedUrl);
    const thirdJson = await third.json();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.equal(thirdJson.success, false);
    assert.equal(thirdJson.error.code, 'RATE_LIMITED');
  } finally {
    await new Promise((resolve, reject) => {
      limitedServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
