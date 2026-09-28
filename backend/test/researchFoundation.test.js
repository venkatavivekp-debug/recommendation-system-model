const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeInteraction,
  normalizeItemId,
  sampleNegatives,
  temporalSplit,
} = require('../src/research/recommendationData');
const {
  ndcgAtK,
  precisionAtK,
  rankingMetricsAtK,
  recallAtK,
} = require('../src/research/rankingMetrics');
const { feedbackSignalForAction } = require('../src/utils/feedbackSignals');

test('canonical interaction normalization keeps domain-aware item identity', () => {
  assert.equal(normalizeItemId('food', '123'), 'food:123');
  assert.equal(normalizeItemId('media', '123'), 'media:123');

  const row = normalizeInteraction({
    userId: 'u1',
    contentType: 'song',
    itemId: 'spotify-track-9',
    action: 'dismissed',
    createdAt: '2026-01-03T10:00:00.000Z',
    contextType: 'walking',
  });

  assert.deepEqual(row, {
    userId: 'u1',
    itemId: 'media:spotify-track-9',
    domain: 'media',
    action: 'not_interested',
    signal: {
      label: 'negative',
      utility: -0.8,
      immediateReward: 0.05,
      positive: false,
    },
    timestamp: '2026-01-03T10:00:00.000Z',
    context: {
      contextType: 'walking',
      sourceType: null,
      rank: null,
    },
  });
});

test('feedback signals reuse the existing learning semantics', () => {
  assert.equal(feedbackSignalForAction('save').utility, 1);
  assert.equal(feedbackSignalForAction('saved').action, 'save');
  assert.equal(feedbackSignalForAction('helpful').immediateReward, 0.85);
  assert.equal(feedbackSignalForAction('ignored').label, 'weak_negative');
  assert.equal(feedbackSignalForAction('chosen').action, 'selected');
});

test('temporal split keeps earlier interactions before later interactions per user', () => {
  const rows = ['1', '2', '3', '4', '5'].map((day) => ({
    userId: 'u1',
    itemId: `meal-${day}`,
    domain: 'food',
    action: 'selected',
    createdAt: `2026-01-0${day}T00:00:00.000Z`,
  }));

  const split = temporalSplit(rows, { trainRatio: 0.6, validationRatio: 0.2 });

  assert.deepEqual(split.train.map((row) => row.itemId), ['food:meal-1', 'food:meal-2', 'food:meal-3']);
  assert.deepEqual(split.validation.map((row) => row.itemId), ['food:meal-4']);
  assert.deepEqual(split.test.map((row) => row.itemId), ['food:meal-5']);
});

test('negative sampling is deterministic and avoids known positives in the same domain', () => {
  const positives = [
    { userId: 'u1', itemId: 'a', domain: 'food', action: 'selected', createdAt: '2026-01-01' },
    { userId: 'u1', itemId: 'b', domain: 'food', action: 'save', createdAt: '2026-01-02' },
  ];
  const candidates = [
    { id: 'a', domain: 'food' },
    { id: 'b', domain: 'food' },
    { id: 'c', domain: 'food' },
    { id: 'd', domain: 'food' },
    { id: 'c', domain: 'media' },
  ];

  const first = sampleNegatives({ positives, candidates, negativesPerPositive: 2, seed: 'fixed' });
  const second = sampleNegatives({ positives, candidates, negativesPerPositive: 2, seed: 'fixed' });

  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  assert.ok(first.every((row) => row.domain === 'food'));
  assert.ok(first.every((row) => !['food:a', 'food:b'].includes(row.itemId)));
});

test('ranking metrics match manually checked examples', () => {
  const ranked = ['b', 'a', 'd'];
  const relevant = ['b', 'd'];

  assert.equal(precisionAtK(ranked, relevant, 3), 2 / 3);
  assert.equal(recallAtK(ranked, relevant, 3), 1);
  assert.ok(Math.abs(ndcgAtK(ranked, relevant, 3) - 0.91972) < 0.0001);
  assert.deepEqual(rankingMetricsAtK({ rankedItems: ranked, relevantItems: relevant, k: 3 }), {
    precision: 2 / 3,
    recall: 1,
    ndcg: ndcgAtK(ranked, relevant, 3),
  });
});
