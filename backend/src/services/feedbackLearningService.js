const { randomUUID } = require('crypto');
const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const userContentInteractionModel = require('../models/userContentInteractionModel');
const domainRegistryService = require('./domainRegistryService');
const rewardModelService = require('./rewardModelService');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDomain(value) {
  return domainRegistryService.aliasToDomainId(value || 'food');
}

function normalizeAction(value) {
  const action = normalizeText(value);
  if (action === 'chosen') return 'selected';
  if (action === 'dismissed') return 'not_interested';
  return action || 'shown';
}

function clamp01(value) {
  return Math.max(0, Math.min(1, toNumber(value, 0)));
}

function actionUtility(actionValue) {
  const action = normalizeAction(actionValue);
  if (action === 'save') return 1;
  if (action === 'helpful') return 0.85;
  if (action === 'selected') return 0.72;
  if (action === 'ignored') return -0.25;
  if (action === 'not_interested') return -0.8;
  return 0;
}

function addAffinity(map, key, value) {
  const normalizedKey = normalizeText(key);
  if (!normalizedKey || !Number.isFinite(value) || value === 0) {
    return;
  }
  map.set(normalizedKey, toNumber(map.get(normalizedKey), 0) + value);
}

function normalizeAffinityMap(map, limit = 12) {
  return [...map.entries()]
    .map(([key, weight]) => ({
      key,
      weight: Number(Math.max(-1, Math.min(1, weight)).toFixed(4)),
    }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, limit);
}

function buildPreferenceAffinities(rows = []) {
  const items = new Map();
  const cuisines = new Map();
  const tags = new Map();
  const sources = new Map();

  (Array.isArray(rows) ? rows : []).slice(0, 500).forEach((row, index) => {
    const utility = actionUtility(row?.action || row?.eventType);
    if (utility === 0) {
      return;
    }

    const recency = Math.max(0.35, 1 - index / 520);
    const weight = utility * recency;
    const context = row?.context || row?.metadata || {};
    const features = row?.features || {};

    addAffinity(items, row?.itemId || row?.candidateId || row?.itemName || row?.title, weight);
    addAffinity(items, row?.itemName || row?.title, weight * 0.7);
    addAffinity(cuisines, context.cuisine || context.cuisineType || row?.cuisineType, weight * 0.55);
    addAffinity(sources, context.sourceType || row?.sourceType, weight * 0.45);

    const tagList = [
      ...(Array.isArray(context.tags) ? context.tags : []),
      ...(Array.isArray(features.tags) ? features.tags : []),
    ];
    tagList.forEach((tag) => addAffinity(tags, tag, weight * 0.35));
  });

  return {
    items: normalizeAffinityMap(items),
    cuisines: normalizeAffinityMap(cuisines),
    tags: normalizeAffinityMap(tags),
    sources: normalizeAffinityMap(sources),
  };
}

function buildAdaptiveScoreWeights(profile = {}) {
  const learningStrength = clamp01(toNumber(profile.totalEvents, 0) / 60);
  const delayedSignal = clamp01(toNumber(profile.delayedRewardProxy, 0.45));
  const ignoreRate = clamp01(toNumber(profile.ignoreRate, 0.2));
  const feedbackShift = (delayedSignal - 0.45) * 0.18 * learningStrength;
  const cautionShift = ignoreRate * 0.05 * learningStrength;
  const raw = {
    macroFit: 0.34 - learningStrength * 0.03,
    calorieFit: 0.28 - learningStrength * 0.02 + cautionShift,
    preferenceFit: 0.22 + learningStrength * 0.03,
    feedbackFit: 0.16 + learningStrength * 0.02 + feedbackShift,
  };
  const total = Object.values(raw).reduce((sum, value) => sum + Math.max(0.05, value), 0);

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Number((Math.max(0.05, value) / total).toFixed(4)),
    ])
  );
}

function contextMatches(row, contextType) {
  if (!contextType) {
    return true;
  }
  const normalizedContext = normalizeText(contextType);
  const rowContext = normalizeText(
    row?.contextType || row?.metadata?.contextType || row?.context?.contextType || row?.context?.mode || row?.intent
  );
  return !rowContext || rowContext === normalizedContext;
}

async function listDomainFeedback(userId, options = {}) {
  const domain = normalizeDomain(options.domain);
  const contextType = options.contextType || '';
  const limit = Math.max(20, toNumber(options.limit, 800));

  if (!userId) {
    return [];
  }

  if (domain === 'media') {
    const rows = await userContentInteractionModel.listInteractionsByUser(userId, limit);
    return rows.filter((row) => contextMatches(row, contextType));
  }

  const rows = await recommendationInteractionModel.listInteractionsByUser(userId, limit);
  return rows
    .filter((row) => normalizeDomain(row?.domain || 'food') === domain)
    .filter((row) => contextMatches(row, contextType));
}

async function recordDomainFeedback(userId, payload = {}) {
  const domain = normalizeDomain(payload.domain);
  domainRegistryService.ensureDomain(domain);

  const now = new Date().toISOString();
  const action = normalizeAction(payload.action);
  const contextType = normalizeText(payload.contextType || payload.intent || 'daily');
  const signals = payload.feedbackSignals || {};
  const reward = rewardModelService.rewardFromFeedback(action, signals, payload.rewardConfig || {});

  if (domain === 'media') {
    const record = {
      id: String(payload.id || randomUUID()),
      userId,
      contentType: normalizeText(payload.contentType || 'movie') === 'song' ? 'song' : 'movie',
      itemId: String(payload.itemId || '').trim(),
      title: String(payload.title || '').trim() || String(payload.itemName || '').trim(),
      contextType,
      timeOfDay: payload.timeOfDay || null,
      dayOfWeek: payload.dayOfWeek ?? new Date().getDay(),
      selected: action === 'selected',
      action,
      score: toNumber(payload.score, reward.score * 100),
      confidence: toNumber(payload.confidence, reward.score),
      features: payload.features && typeof payload.features === 'object' ? payload.features : {},
      metadata: {
        ...(payload.metadata || {}),
        domain,
        reward,
      },
      createdAt: now,
    };
    return userContentInteractionModel.createInteraction(record);
  }

  const record = {
    id: String(payload.id || randomUUID()),
    userId,
    domain,
    eventType: action === 'selected' ? 'chosen' : 'shown',
    action,
    itemName: String(payload.itemName || payload.title || '').trim(),
    candidateId: String(payload.itemId || '').trim(),
    candidateRank: toNumber(payload.rank, payload.candidateRank || 0),
    chosen: action === 'selected' ? 1 : 0,
    score: toNumber(payload.score, reward.score * 100),
    confidence: toNumber(payload.confidence, reward.score),
    features: payload.features && typeof payload.features === 'object' ? payload.features : {},
    context: {
      ...(payload.context || {}),
      contextType,
      mode: payload.mode || contextType,
      domain,
      reward,
    },
    createdAt: now,
  };

  return recommendationInteractionModel.createInteraction(record);
}

async function buildFeedbackProfile(userId, options = {}) {
  const rows = await listDomainFeedback(userId, options);
  if (!rows.length) {
    const emptyProfile = {
      totalEvents: 0,
      acceptanceRate: 0.5,
      saveRate: 0.2,
      ignoreRate: 0.2,
      repeatSelectionRate: 0.15,
      delayedRewardProxy: 0.45,
    };
    return {
      ...emptyProfile,
      preferenceAffinities: {
        items: [],
        cuisines: [],
        tags: [],
        sources: [],
      },
      adaptiveScoreWeights: buildAdaptiveScoreWeights(emptyProfile),
    };
  }

  const shown = rows.filter((row) => normalizeAction(row?.action || row?.eventType) === 'shown');
  const selected = rows.filter((row) =>
    ['selected', 'helpful', 'save'].includes(normalizeAction(row?.action || row?.eventType))
  );
  const saved = rows.filter((row) => normalizeAction(row?.action) === 'save');
  const ignored = rows.filter((row) => normalizeAction(row?.action) === 'not_interested');

  const selectedKeys = new Map();
  selected.forEach((row) => {
    const key = String(row?.itemId || row?.candidateId || row?.itemName || row?.title || '')
      .trim()
      .toLowerCase();
    if (!key) {
      return;
    }
    selectedKeys.set(key, toNumber(selectedKeys.get(key), 0) + 1);
  });
  const repeatSelections = [...selectedKeys.values()].filter((count) => count > 1).length;

  const acceptanceRate =
    shown.length > 0 ? selected.length / Math.max(shown.length, 1) : selected.length / 8;
  const saveRate = selected.length > 0 ? saved.length / Math.max(selected.length, 1) : saved.length / 8;
  const ignoreRate =
    shown.length > 0 ? ignored.length / Math.max(shown.length, 1) : ignored.length / 8;
  const repeatSelectionRate =
    selectedKeys.size > 0 ? repeatSelections / Math.max(selectedKeys.size, 1) : 0.1;

  const profile = {
    totalEvents: rows.length,
    acceptanceRate: Number(Math.max(0, Math.min(1, acceptanceRate)).toFixed(4)),
    saveRate: Number(Math.max(0, Math.min(1, saveRate)).toFixed(4)),
    ignoreRate: Number(Math.max(0, Math.min(1, ignoreRate)).toFixed(4)),
    repeatSelectionRate: Number(Math.max(0, Math.min(1, repeatSelectionRate)).toFixed(4)),
    delayedRewardProxy: Number(
      rewardModelService.delayedRewardProxy({
        acceptanceRate,
        saveRate,
        ignoreRate,
        repeatSelectionRate,
      }).toFixed(4)
    ),
  };

  return {
    ...profile,
    preferenceAffinities: buildPreferenceAffinities(rows),
    adaptiveScoreWeights: buildAdaptiveScoreWeights(profile),
  };
}

module.exports = {
  normalizeAction,
  listDomainFeedback,
  recordDomainFeedback,
  buildFeedbackProfile,
};
