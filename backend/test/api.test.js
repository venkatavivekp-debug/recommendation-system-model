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
const contentRecommendationService = require('../src/services/contentRecommendationService');
const candidateGenerationService = require('../src/services/candidateGenerationService');
const foodDataProvider = require('../src/services/dataProviders/foodDataProvider');
const bandit = require('../src/services/banditDecisionService');

test('compact impression storage preserves queued writes, isolated reads, and fresh-process durability', async () => {
  const { DataStore } = require('../src/models/dataStore');
  const file = path.join(testDir, 'compact-impressions.json');
  const store = new DataStore(file, { compact: true });
  await Promise.all(Array.from({ length: 12 }, (_, id) => store.updateData(data => {
    data.recommendationInteractions.push({ id, userId: `user-${id % 2}` });
  })));
  const snapshot = await store.readData();
  assert.deepEqual(snapshot.recommendationInteractions.map(row => row.id), Array.from({ length: 12 }, (_, i) => i));
  snapshot.recommendationInteractions.length = 0;
  assert.equal((await store.readData()).recommendationInteractions.length, 12);
  const reopened = new DataStore(file, { compact: true });
  assert.deepEqual(await reopened.readData(), await store.readData());
  await assert.rejects(fs.access(`${file}.tmp`));
  await assert.rejects(store.updateData(() => { throw new Error('aborted write'); }), /aborted/);
  assert.equal((await reopened.readData()).recommendationInteractions.length, 12);
  await store.updateData(data => { data.recommendationInteractions.push({ id: 12 }); });
  assert.equal((await reopened.readData()).recommendationInteractions.length, 13);
  await fs.rm(file);
});

test('LinUCB is finite, symmetric, deterministic, and can explore through uncertainty alone', () => {
  const candidate = (id, confidence, macroFit = 0) => ({ id, recommendation: { confidence, features: { macroFit } } });
  const candidates = [candidate('familiar', 0.6), candidate('uncertain', 0.59, 1)];
  const state = bandit.initialState();
  state.A[0][0] = 1000;
  state.A[1][1] = 1000;
  state.b[1] = 100;
  const ranked = bandit.rankCandidatesWithBandit(candidates, { domain: 'media', policyState: state });
  assert.equal(ranked[0].id, 'uncertain');
  assert.equal(ranked[0].recommendation.explorationSelected, true);
  assert.ok(ranked[1].recommendation.bandit.exploitation > ranked[0].recommendation.bandit.exploitation);
  assert.deepEqual(ranked, bandit.rankCandidatesWithBandit(candidates, { domain: 'media', policyState: state }));
  for (const item of ranked) {
    const trace = item.recommendation.scoreTrace;
    assert.ok(Number.isFinite(trace.finalScore));
    assert.ok(trace.explorationBonus >= 0 && trace.explorationBonus <= bandit.ALPHA);
    assert.equal(trace.finalScore, trace.baseScore + trace.adaptivePolicyContribution + trace.explorationBonus);
    assert.ok(Math.abs(Object.values(trace.featureContributions).reduce((a, b) => a + b, 0) - trace.adaptivePolicyContribution) < 1e-12);
  }
  assert.equal(bandit.candidateFeatures(candidate('zero', 0)).values.baseRelevance, 0);
  assert.equal(bandit.initialState().A[0][0], 1);
  for (const invalid of [{}, { ...state, b: [NaN] }, { ...state, appliedEvents: [] }, { ...state, A: state.A.map(row => row.map(() => 0)) }]) {
    assert.throws(() => bandit.rankCandidatesWithBandit(candidates, { policyState: invalid }), /needs repair/);
  }
});

test('prospective feedback uses original features, persists, deduplicates, and isolates users and domains', async () => {
  const userModel = require('../src/models/userModel');
  const feedback = require('../src/services/feedbackLearningService');
  const events = require('../src/models/recommendationInteractionModel');
  const id = `bandit-${Date.now()}`;
  await userModel.createUser({ id, email: `${id}@example.com`, preferences: { preferredCuisine: 'Italian' } });
  const candidate = { id: 'policy-food', title: 'Policy Food', recommendation: { confidence: 0.6, features: { macroFit: 0.9, preferenceFit: 0.8 } } };
  const ranked = bandit.rankCandidatesWithBandit([candidate], { domain: 'food' });
  await bandit.logImpressions(id, 'food', ranked, { contextType: 'daily', sessionIntent: 'chicken' });
  const eventId = ranked[0].recommendation.recommendationEventId;
  const payload = { domain: 'food', itemId: candidate.id, itemName: candidate.title, recommendationEventId: eventId, action: 'selected', features: { macroFit: 999 } };
  const beforeOther = await bandit.getPolicy('other-user', 'food');
  const beforeFitness = await bandit.getPolicy(id, 'fitness');
  const beforeMedia = await bandit.getPolicy(id, 'media');
  await Promise.all([feedback.recordDomainFeedback(id, payload), feedback.recordDomainFeedback(id, payload)]);
  let state = await bandit.getPolicy(id, 'food');
  assert.equal(state.updateCount, 1);
  const x = ranked[0].recommendation.policyFeatures.vector;
  assert.deepEqual(state.b, x);
  assert.equal(bandit.rankCandidatesWithBandit([candidate], { policyState: state })[0].recommendation.bandit.exploitation > 0, true);
  for (let i = 0; i < x.length; i += 1) for (let j = 0; j < x.length; j += 1) {
    assert.equal(state.A[i][j], state.A[j][i]);
    assert.equal(state.A[i][j], (i === j ? 1 : 0) + x[i] * x[j]);
  }
  const stored = await events.listInteractionsByUser(id, 100, { feedbackOnly: true });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].context.adaptive.recommendationEventId, eventId);
  assert.deepEqual(stored[0].context.adaptive.features.vector, x);
  await feedback.recordDomainFeedback(id, { ...payload, action: 'save' });
  const saved = await bandit.getPolicy(id, 'food');
  assert.deepEqual(saved.b, x.map(value => 2 * value));
  await feedback.recordDomainFeedback(id, { ...payload, action: 'not_interested' });
  state = await bandit.getPolicy(id, 'food');
  assert.equal(state.updateCount, 3);
  assert.ok(state.b.every((value, i) => Math.abs(value - x[i]) < 1e-12));
  const profile = await feedback.buildFeedbackProfile(id, { domain: 'food' });
  assert.equal(bandit.rankCandidatesWithBandit([candidate], { domain: 'food', feedbackSignals: profile, policyState: state }).length, 0);
  await bandit.applyFeedback(id, { ...payload, action: 'shown' });
  await bandit.applyFeedback(id, { ...payload, action: 'ignored' });
  assert.equal((await bandit.getPolicy(id, 'food')).updateCount, 3);
  assert.deepEqual(await bandit.getPolicy(id, 'fitness'), beforeFitness);
  assert.deepEqual(await bandit.getPolicy(id, 'media'), beforeMedia);
  assert.deepEqual(await bandit.getPolicy('other-user', 'food'), beforeOther);
  await assert.rejects(bandit.applyFeedback('other-user', payload), /does not match/);
  await assert.rejects(bandit.applyFeedback(id, { ...payload, domain: 'media' }), /does not match/);
  await assert.rejects(bandit.applyFeedback(id, { ...payload, itemId: 'spoofed' }), /does not match/);
  const { execFileSync } = require('node:child_process');
  const persisted = JSON.parse(execFileSync(process.execPath, ['-e',
    'const d=JSON.parse(require("node:fs").readFileSync(process.argv[1]));console.log(JSON.stringify(d.users.find(u=>u.id===process.argv[2]).adaptivePolicies.food));',
    process.env.DATASTORE_PATH, id], { encoding: 'utf8' }));
  assert.deepEqual(persisted, state);
  assert.deepEqual((await userModel.findUserById(id)).preferences, { preferredCuisine: 'Italian' });
  await feedback.recordDomainFeedback(id, { ...payload, recommendationEventId: undefined, action: 'helpful' });
  assert.equal((await bandit.getPolicy(id, 'food')).updateCount, 3);
  for (const domain of ['fitness', 'media']) {
    const recommendations = bandit.rankCandidatesWithBandit([candidate], { domain });
    await bandit.logImpressions(id, domain, recommendations);
    await bandit.applyFeedback(id, { ...payload, domain, action: 'not_interested', recommendationEventId: recommendations[0].recommendation.recommendationEventId });
    const negative = await bandit.getPolicy(id, domain);
    assert.deepEqual(negative.b, recommendations[0].recommendation.policyFeatures.vector.map(value => 0 - value));
    assert.deepEqual(await bandit.getPolicy(id, 'food'), state);
    assert.deepEqual(await bandit.getPolicy('other-user', domain), bandit.initialState());
  }
});

test('session and workout features are temporary and carry explicit cross-domain provenance', () => {
  const source = crossDomainMappingService.buildWorkoutContext({ id: 'run-1', createdAt: new Date().toISOString(), workoutType: 'running', intensity: 'intense', durationMinutes: 60, foodPreference: 'chicken' });
  const mapped = crossDomainMappingService.mapFitnessToFoodContext({ exerciseSummary: { latestWorkout: source } });
  const signals = crossDomainMappingService.contextProvenance('fitness', 'food', source, mapped.reason, { macroFocus: mapped.macroFocus });
  assert.equal(signals[0].sourceEvent, 'run-1');
  assert.equal(signals[0].targetDomain, 'food');
  assert.equal(signals[0].sourceTimestamp, source.sourceTimestamp);
  const candidates = [{ id: 'carbs', title: 'Chicken rice', ingredients: ['chicken'], nutrition: { calories: 600, protein: 25, carbs: 80 } },
    { id: 'protein', title: 'Tofu', ingredients: ['tofu'], nutrition: { calories: 600, protein: 45, carbs: 10 } }];
  const context = { remaining: { calories: 600 }, crossDomain: mapped, sessionIntent: source };
  const rows = recommendationScoringService.scoreCandidates(candidates, context, 2);
  const state = bandit.initialState();
  const beforeState = JSON.stringify(state);
  const ranked = bandit.rankCandidatesWithBandit(rows, { policyState: state, crossDomainSignals: signals });
  assert.equal(ranked[0].id, 'carbs');
  assert.ok(ranked[0].recommendation.policyFeatures.values.crossDomainFit > 0);
  assert.equal(ranked[0].recommendation.policyFeatures.values.sessionIntentFit, 1);
  assert.equal(JSON.stringify(state), beforeState);
  const without = recommendationScoringService.scoreCandidates(candidates, { remaining: { calories: 600 }, macroFocus: 'protein' }, 2);
  assert.equal(without[0].id, 'protein');
  assert.equal(bandit.candidateFeatures(without[0]).values.crossDomainFit, 0);
  assert.equal(crossDomainMappingService.latestWorkoutContext([{ ...source, createdAt: '2000-01-01' }]), null);
  const fitness = crossDomainMappingService.mapFoodToFitnessContext({ consumed: { calories: 2700 }, remaining: { calories: -500 }, sourceContext: { sourceTimestamp: source.sourceTimestamp, sourceEventId: 'meal-1' } });
  assert.equal(fitness.activityType, 'walking');
  assert.equal(fitness.crossDomainSignals[0].sourceDomain, 'food');
  assert.deepEqual(crossDomainMappingService.mapFoodToFitnessContext().crossDomainSignals, []);
  const duplicates = [ranked[0], { ...ranked[0], id: 'duplicate' }, ranked[1]];
  assert.equal(recommendationScoringService.selectDiverseCandidates(duplicates, 3).length, 2);
});

let server;
let baseUrl;
let token;

test('Food and Media HTTP feedback retain impression IDs and policy state across login', async () => {
  const credentials = { email: `policy-http-${Date.now()}@example.com`, password: 'student123' };
  await request('/api/auth/register', { auth: false, method: 'POST', body: { ...credentials, firstName: 'Policy', lastName: 'HTTP' } });
  const login = await request('/api/auth/login', { auth: false, method: 'POST', body: credentials });
  const headers = { Authorization: `Bearer ${login.json.data.token}` };
  const id = login.json.data.user.id;
  const userModel = require('../src/models/userModel');
  const originalPreferences = (await userModel.findUserById(id)).preferences;
  const food = await request('/api/food/recommendations?limit=5', { headers });
  const target = food.json.data.recommendations[1];
  assert.ok(target.recommendation.recommendationEventId);
  const selection = { itemId: target.id, itemName: target.foodName || target.name, recommendationEventId: target.recommendation.recommendationEventId, action: 'selected' };
  const feedback = await request('/api/food/feedback', { headers, method: 'POST', body: selection });
  assert.equal(feedback.response.status, 201);
  const state = await bandit.getPolicy(id, 'food');
  assert.equal(state.updateCount, 1);
  assert.equal((await bandit.getPolicy(id, 'media')).updateCount, 0);
  const again = await request('/api/auth/login', { auth: false, method: 'POST', body: credentials });
  const freshHeaders = { Authorization: `Bearer ${again.json.data.token}` };
  const after = await request('/api/food/recommendations?limit=20', { headers: freshHeaders });
  const learned = after.json.data.recommendations.find(item => item.id === target.id);
  assert.ok(learned.recommendation.bandit.exploitation > 0);
  assert.deepEqual(await bandit.getPolicy(id, 'food'), state);
  await request('/api/food/feedback', { headers, method: 'POST', body: { ...selection, action: 'not_interested' } });
  const suppressed = await request('/api/food/recommendations?limit=20', { headers: freshHeaders });
  assert.ok(!suppressed.json.data.recommendations.some(item => item.id === target.id));
  const content = await request('/api/content/recommendations?contextType=workout&activityType=running&durationMinutes=20&intensity=intense&musicPreference=rock', { headers });
  assert.equal(content.response.status, 200);
  for (const item of [...content.json.data.movies, ...content.json.data.songs]) {
    assert.ok(item.recommendation?.recommendationEventId);
    const t = item.recommendation.scoreTrace;
    assert.ok(Math.abs(t.baseRelevance + t.preferenceContribution + t.contextContribution + t.feedbackContribution + t.crossDomainContextContribution - t.baseScore) < 1e-8);
    const event = await require('../src/models/recommendationInteractionModel').findInteraction(id, item.recommendation.recommendationEventId);
    assert.equal(event.context.adaptive.policyVersion, bandit.POLICY_VERSION);
    assert.equal(event.context.adaptive.featureSchemaVersion, bandit.FEATURE_SCHEMA_VERSION);
  }
  const song = content.json.data.songs[0];
  assert.ok(song.recommendation.crossDomainSignals.length);
  assert.ok(song.recommendation.scoreTrace.crossDomainContextContribution > 0);
  assert.match(song.reason, /context.*(?:shaped|contributed)/i);
  assert.doesNotMatch(song.reason, /high.energy.*fits|high.energy fit/i);
  const mediaFeedback = await request('/api/content/feedback', { headers, method: 'POST', body: {
    itemId: song.id, title: song.title, contentType: 'song', contextType: 'workout', action: 'helpful',
    recommendationEventId: song.recommendation.recommendationEventId,
  } });
  assert.equal(mediaFeedback.response.status, 200);
  assert.equal(mediaFeedback.json.data.recommendationEventId, song.recommendation.recommendationEventId);
  const mediaState = await bandit.getPolicy(id, 'media');
  assert.equal(mediaState.updateCount, 1);
  assert.deepEqual(mediaState.b, song.recommendation.policyFeatures.vector.map(value => value * 0.5));
  assert.equal((await bandit.getPolicy(id, 'fitness')).updateCount, 0);
  const stateBeforeIntent = JSON.stringify(mediaState);
  await request('/api/content/recommendations?contextType=workout&activityType=running&durationMinutes=60&intensity=intense&musicPreference=pop', { headers });
  assert.equal(JSON.stringify(await bandit.getPolicy(id, 'media')), stateBeforeIntent);
  assert.deepEqual((await userModel.findUserById(id)).preferences, originalPreferences);
});

test('final food diversity keeps the highest-ranked variant without merging distinct meals', () => {
  const titles = ['Chicken Salad (post-workout)', 'Chicken Salad (x-large)', 'Chicken Salad', 'Chicken Rice Bowl', 'Chicken Wrap'];
  const rows = titles.map((title, index) => ({ id: String(index), title }));
  const selected = recommendationScoringService.selectDiverseCandidates(rows, 5);
  assert.deepEqual(selected.map((item) => item.title), [titles[0], titles[3], titles[4]]);
  assert.deepEqual(selected.map((item) => item.recommendation.rank), [1, 2, 3]);
});

test('limited food pools retain distinct chicken families on cold and cached reads', async () => {
  for (let read = 0; read < 2; read += 1) {
    const rows = await foodDataProvider.getFoods({ limit: 100 });
    const families = new Set(rows.filter((item) => /chicken/i.test(item.baseFoodName)).map((item) => item.baseFoodName));
    assert.equal(families.size, 3);
    assert.ok(rows.length <= 100);
  }
});

test('content explanation enrichment can preserve the actual contextual reason', () => {
  const { enrichRecommendation } = require('../src/services/explanationService');
  const reason = 'High-energy tracks fit this short intense workout.';
  const item = enrichRecommendation({ reason, topFactors: [{ feature: 'historySimilarity', contribution: 1 }] }, { preserveReason: true });
  assert.equal(item.reason, reason);
  assert.equal(item.recommendation.explanation, reason);
});

test('curated playlist labels do not become learned artist preferences', () => {
  for (const artist of ['Curated playlist', 'recommendation-system-model Curated']) {
    const profile = contentRecommendationService.buildMediaPreferenceProfile([
      { contentType: 'song', action: 'selected', contextType: 'workout', createdAt: new Date().toISOString(), metadata: { mediaFeatures: { artist, genre: 'rock' } } },
    ], 'song', 'workout');
    assert.ok(profile.totals.has('genre:rock'));
    assert.equal([...profile.totals.keys()].some(key => key.startsWith('artist:')), false);
  }
});

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

test('protected API rejects an invalid bearer token with 401', async () => {
  const { response, json } = await request('/api/dashboard', {
    headers: { Authorization: 'Bearer invalid-token' },
  });

  assert.equal(response.status, 401);
  assert.equal(json.success, false);
});

test('logged current workout becomes the active exercise context', async () => {
  const logged = await request('/api/exercises/log', {
    method: 'POST',
    body: {
      workoutType: 'running',
      durationMinutes: 20,
      intensity: 'intense',
      exercises: [{ name: 'running', durationMinutes: 20, intensity: 'intense' }],
    },
  });
  assert.equal(logged.response.status, 201);

  const today = await request('/api/exercises/today');
  assert.equal(today.json.data.workoutContext.activityType, 'running');
  assert.equal(today.json.data.workoutContext.sessionClass, 'short_intense');
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
  assert.ok(afterSave.json.data.results[rank].recommendation.scoreTrace.feedbackContribution > 0);
  const other = await request('/api/auth/register', { auth: false, method: 'POST', body: { firstName: 'Other', lastName: 'User', email: 'isolated@example.com', password: 'student123' } });
  assert.equal(other.response.status, 201);
  const otherLogin = await request('/api/auth/login', { auth: false, method: 'POST', body: { email: 'isolated@example.com', password: 'student123' } });
  const second = await request(query, { headers: { Authorization: `Bearer ${otherLogin.json.data.token}` } });
  assert.ok(second.json.data.results.some((x) => targets.some((target) => target.placeId === x.placeId)));
  assert.ok(second.json.data.results.every((x) => x.recommendation.scoreTrace.feedbackContribution === 0));
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
  assert.equal(json.data.model, 'contextfit-bandit-v1');
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

test('recent workout session distinguishes endurance carbs from strength protein', () => {
  const longRun = crossDomainMappingService.mapFitnessToFoodContext({
    exerciseSummary: { latestWorkout: crossDomainMappingService.buildWorkoutContext({
      workoutType: 'running', intensity: 'intense', durationMinutes: 60, caloriesBurned: 620,
    }) },
    preferences: {},
  });
  const strength = crossDomainMappingService.mapFitnessToFoodContext({
    exerciseSummary: { latestWorkout: crossDomainMappingService.buildWorkoutContext({
      workoutType: 'strength', intensity: 'intense', durationMinutes: 40, caloriesBurned: 300,
    }) },
    preferences: {},
  });

  assert.equal(longRun.macroFocus, 'carbs');
  assert.equal(longRun.workoutContext.sessionClass, 'long_endurance');
  assert.equal(longRun.workoutContext.durationClass, 'long');
  assert.equal(strength.macroFocus, 'protein');
  assert.equal(strength.workoutContext.sessionClass, 'strength_recovery');
  assert.equal(strength.workoutContext.durationClass, 'medium');
});

test('temporary workout context expires after 24 hours', () => {
  const now = Date.parse('2026-10-06T16:00:00.000Z');
  const current = { createdAt: '2026-10-06T10:00:00.000Z', workoutType: 'running', durationMinutes: 60, foodPreference: 'Chicken' };
  const stale = { createdAt: '2026-10-05T10:00:00.000Z', workoutType: 'strength', durationMinutes: 45, foodPreference: 'Pasta' };

  assert.equal(crossDomainMappingService.latestWorkoutContext([current], now).foodPreference, 'Chicken');
  assert.equal(crossDomainMappingService.latestWorkoutContext([stale], now), null);
});

test('learned chicken preference is retained while workout context shifts macro fit', () => {
  const candidates = [
    { id: 'chicken-protein', title: 'Chicken Protein Bowl', itemType: 'meal', cuisine: 'bowls', ingredients: ['chicken', 'rice'], tags: ['high-protein', 'balanced', 'recovery'], nutrition: { calories: 600, protein: 48, carbs: 40, fats: 15 } },
    { id: 'chicken-grain', title: 'Chicken Grain Bowl', itemType: 'meal', cuisine: 'grain-bowls', ingredients: ['chicken', 'rice'], tags: ['carb-forward', 'balanced', 'recovery'], nutrition: { calories: 600, protein: 30, carbs: 90, fats: 15 } },
    { id: 'tofu-grain', title: 'Tofu Grain Bowl', itemType: 'meal', cuisine: 'tofu-bowls', ingredients: ['tofu', 'rice'], tags: ['carb-forward', 'balanced', 'recovery'], nutrition: { calories: 600, protein: 30, carbs: 90, fats: 15 } },
  ];
  const feedbackProfile = {
    acceptanceRate: 0.5, saveRate: 0.2, ignoreRate: 0.2,
    preferenceAffinities: { items: [], cuisines: [], tags: [], sources: [], ingredients: [{ key: 'chicken', weight: 0.9 }] },
  };
  const contextFor = (workoutType, durationMinutes) => {
    const workout = crossDomainMappingService.buildWorkoutContext({ workoutType, durationMinutes, intensity: 'intense' });
    const crossDomain = crossDomainMappingService.mapFitnessToFoodContext({ exerciseSummary: { latestWorkout: workout }, preferences: {} });
    return { remaining: { calories: 600, protein: 45, carbs: 80, fats: 20 }, preferences: {}, feedbackProfile, crossDomain, macroFocus: crossDomain.macroFocus, sessionIntent: { foodPreference: 'Chicken' } };
  };
  const strength = recommendationScoringService.scoreCandidates(candidates, contextFor('strength', 45), 3);
  const endurance = recommendationScoringService.scoreCandidates(candidates, contextFor('running', 60), 3);

  assert.equal(strength[0].id, 'chicken-protein');
  assert.equal(endurance[0].id, 'chicken-grain');
  assert.ok(strength[0].recommendation.features.sessionIntentFit > 0.5);
  assert.ok(endurance[0].recommendation.features.sessionIntentFit > 0.5);
});

test('session intent changes the current food ranking without adding learned history', async () => {
  const candidates = [
    { id: 'a-oat-bowl', title: 'Apple Oat Bowl', ingredients: ['oats', 'berries'], nutrition: { calories: 500, protein: 20, carbs: 70, fats: 12 }, tags: ['balanced'] },
    { id: 'z-chicken-rice', title: 'Chicken Rice Bowl', ingredients: ['chicken', 'rice'], nutrition: { calories: 500, protein: 20, carbs: 70, fats: 12 }, tags: ['balanced'] },
  ];
  const baseContext = { remaining: { calories: 500, protein: 25, carbs: 70, fats: 15 }, preferences: {}, macroFocus: 'balanced' };
  const withoutIntent = recommendationScoringService.scoreCandidates(candidates, baseContext, 2);
  const withIntent = recommendationScoringService.scoreCandidates(candidates, {
    ...baseContext,
    sessionIntent: { foodPreference: 'Chicken' },
  }, 2);
  assert.equal(withoutIntent[0].id, 'a-oat-bowl');
  assert.equal(withIntent[0].id, 'z-chicken-rice');
  assert.match(withIntent[0].recommendation.reason, /asked for this session/i);

  const email = `session-intent-${Date.now()}@example.com`;
  await request('/api/auth/register', { auth: false, method: 'POST', body: { firstName: 'Intent', lastName: 'Only', email, password: 'student123' } });
  const login = await request('/api/auth/login', { auth: false, method: 'POST', body: { email, password: 'student123' } });
  const userId = login.json.data.user.id;
  const logged = await request('/api/exercises/log', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.json.data.token}` },
    body: {
      workoutType: 'running', durationMinutes: 60, intensity: 'intense',
      foodPreference: 'Chicken', musicPreference: 'Rock', preferenceNote: 'carbs',
      exercises: [{ name: 'running', durationMinutes: 60, intensity: 'intense' }],
    },
  });
  assert.equal(logged.response.status, 201);
  const sessionContext = await request('/api/exercises/today', {
    headers: { Authorization: `Bearer ${login.json.data.token}` },
  });
  assert.equal(sessionContext.json.data.workoutContext.foodPreference, 'Chicken');
  assert.equal(sessionContext.json.data.workoutContext.musicPreference, 'Rock');
  const foodProfile = await require('../src/services/feedbackStorageService').getFoodFeedbackProfile(userId);
  assert.equal(foodProfile.totalEvents, 0);
  assert.deepEqual(foodProfile.preferenceAffinities.items, []);
});

test('current-session diet request takes precedence over the stored candidate diet', async () => {
  const originalGetFoods = foodDataProvider.getFoods;
  let requestedDiet;
  foodDataProvider.getFoods = async (options) => {
    requestedDiet = options.preferredDiet;
    return [];
  };
  try {
    await candidateGenerationService.generateCandidates({
      domain: 'food',
      user: { preferences: { preferredDiet: 'vegan' } },
      context: { preferredDiet: 'veg', intent: 'eat_in' },
      poolSize: 1,
    });
    assert.equal(requestedDiet, 'veg');
  } finally {
    foodDataProvider.getFoods = originalGetFoods;
  }
});

test('workout music ranking distinguishes short intensity from long endurance', () => {
  const energetic = { genre: 'rock', mood: 'motivational', energy: 0.95, tempo: 145 };
  const steady = { genre: 'pop', mood: 'steady', energy: 0.68, tempo: 126 };
  const shortRun = { sessionClass: 'short_intense' };
  const longRun = { sessionClass: 'long_endurance' };

  assert.ok(contentRecommendationService.workoutMusicFit(energetic, shortRun) > contentRecommendationService.workoutMusicFit(steady, shortRun));
  assert.ok(contentRecommendationService.workoutMusicFit(steady, longRun) > contentRecommendationService.workoutMusicFit(energetic, longRun));
  assert.notEqual(
    contentRecommendationService.workoutMusicFit(steady, { sessionClass: 'moderate_session', durationClass: 'medium' }),
    contentRecommendationService.workoutMusicFit(steady, { sessionClass: 'moderate_session', durationClass: 'short' })
  );
});

test('learned Rock taste remains relevant while workout duration changes music fit', () => {
  const interactions = [{
    contentType: 'song', action: 'selected', contextType: 'workout', createdAt: new Date().toISOString(),
    metadata: { mediaFeatures: { genre: 'rock', mood: 'motivational', energy: 0.88, tempo: 140, sessionClass: 'short_intense' } },
  }];
  const shortProfile = contentRecommendationService.buildMediaPreferenceProfile(interactions, 'song', 'workout', { sessionClass: 'short_intense' });
  const longProfile = contentRecommendationService.buildMediaPreferenceProfile(interactions, 'song', 'workout', { sessionClass: 'long_endurance' });
  const rockSteady = { genre: 'rock', mood: 'steady', energy: 0.68, tempo: 126 };
  const popSteady = { genre: 'pop', mood: 'steady', energy: 0.68, tempo: 126 };
  assert.ok(contentRecommendationService.learnedMediaFit(rockSteady, longProfile) > 0.5);
  assert.ok(contentRecommendationService.workoutMusicFit(rockSteady, { sessionClass: 'short_intense' }) < contentRecommendationService.workoutMusicFit({ ...rockSteady, mood: 'motivational', energy: 0.92, tempo: 145 }, { sessionClass: 'short_intense' }));
  assert.ok(contentRecommendationService.workoutMusicFit(rockSteady, { sessionClass: 'long_endurance' }) > contentRecommendationService.workoutMusicFit(popSteady, { sessionClass: 'long_endurance' }) - 0.01);
  assert.ok(shortProfile.hasEvidence && longProfile.hasEvidence);
});

test('selected song feedback builds a persisted-feature preference signal', () => {
  const profile = contentRecommendationService.buildMediaPreferenceProfile([
    {
      contentType: 'song', action: 'selected', contextType: 'workout', createdAt: new Date().toISOString(),
      metadata: { mediaFeatures: { genre: 'rock', mood: 'motivational', energy: 0.9, tempo: 140, sessionClass: 'short_intense' } },
    },
    {
      contentType: 'song', action: 'not_interested', contextType: 'workout', createdAt: new Date().toISOString(),
      metadata: { mediaFeatures: { genre: 'jazz', mood: 'calm', energy: 0.25, tempo: 80, sessionClass: 'short_intense' } },
    },
  ], 'song', 'workout', { sessionClass: 'short_intense' });

  assert.ok(contentRecommendationService.learnedMediaFit({ genre: 'rock', mood: 'motivational', energy: 0.9, tempo: 140 }, profile) > 0.5);
  assert.ok(contentRecommendationService.learnedMediaFit({ genre: 'jazz', mood: 'calm', energy: 0.25, tempo: 80 }, profile) < 0.5);
});

test('song feedback stores its workout features and exposes learned preferences', async () => {
  const email = `media-session-${Date.now()}@example.com`;
  await request('/api/auth/register', {
    auth: false,
    method: 'POST',
    body: { firstName: 'Media', lastName: 'Learner', email, password: 'student123' },
  });
  const login = await request('/api/auth/login', {
    auth: false,
    method: 'POST',
    body: { email, password: 'student123' },
  });
  const userToken = login.json.data.token;
  const before = await request('/api/content/recommendations?contextType=workout&activityType=running&intensity=intense&durationMinutes=20&musicPreference=Rock', {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const song = before.json?.data?.songs?.find((item) => item.genre);
  assert.ok(song);
  assert.equal(before.json.data.learning.preferences.some((item) => item.label === 'rock'), false);

  const feedback = await request('/api/content/feedback', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
    body: {
      itemId: song.id,
      title: song.title,
      contentType: 'song',
      action: 'selected',
      contextType: 'workout',
      artist: song.artist,
      genre: song.genre,
      mood: song.mood,
      energy: song.energy,
      tempo: song.tempo,
      durationSeconds: song.durationSeconds,
      activityType: 'running',
      intensity: 'intense',
      durationMinutes: 20,
      sessionClass: 'short_intense',
    },
  });
  assert.equal(feedback.response.status, 200);

  const after = await request('/api/content/recommendations?contextType=workout&activityType=running&intensity=intense&durationMinutes=20', {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.ok(after.json.data.learning.preferences.some((item) => item.label === song.genre.toLowerCase()));

  const isolationEmail = `media-isolation-${Date.now()}@example.com`;
  await request('/api/auth/register', {
    auth: false,
    method: 'POST',
    body: { firstName: 'Second', lastName: 'User', email: isolationEmail, password: 'student123' },
  });
  const isolatedLogin = await request('/api/auth/login', {
    auth: false,
    method: 'POST',
    body: { email: isolationEmail, password: 'student123' },
  });
  const isolated = await request('/api/content/recommendations?contextType=workout&activityType=running&intensity=intense&durationMinutes=20', {
    headers: { Authorization: `Bearer ${isolatedLogin.json.data.token}` },
  });
  assert.equal(
    isolated.json.data.learning.preferences.some((item) => item.label === song.genre.toLowerCase()),
    false
  );
});

test('Not Interested on a song persists server-side suppression for that user', async () => {
  const email = `media-ignore-${Date.now()}@example.com`;
  await request('/api/auth/register', { auth: false, method: 'POST', body: { firstName: 'Media', lastName: 'Ignore', email, password: 'student123' } });
  const login = await request('/api/auth/login', { auth: false, method: 'POST', body: { email, password: 'student123' } });
  const auth = { Authorization: `Bearer ${login.json.data.token}` };
  const before = await request('/api/content/recommendations?contextType=workout&activityType=running&intensity=intense&durationMinutes=20', { headers: auth });
  const target = before.json.data.songs[0];
  assert.ok(target?.id);
  const feedback = await request('/api/content/feedback', {
    method: 'POST',
    headers: auth,
    body: {
      itemId: target.id, title: target.title, contentType: 'song', action: 'not_interested',
      contextType: 'workout', genre: target.genre, mood: target.mood, energy: target.energy,
      tempo: target.tempo, activityType: 'running', intensity: 'intense', durationMinutes: 20,
      sessionClass: 'short_intense',
    },
  });
  assert.equal(feedback.response.status, 200);
  const after = await request('/api/content/recommendations?contextType=workout&activityType=running&intensity=intense&durationMinutes=20', { headers: auth });
  assert.equal(after.json.data.songs.some((song) => song.id === target.id), false);
});

test('content feedback rejects actions outside the shared interaction vocabulary', async () => {
  const invalid = await request('/api/content/feedback', {
    method: 'POST',
    body: { itemId: 'song-1', title: 'Track', contentType: 'song', contextType: 'workout', action: 'dismiss' },
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.json.success, false);
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
