const assert = require('node:assert/strict');
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

const app = require('../src/app');

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

test('invalid input and malformed JSON return safe errors', async () => {
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
