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

function contextMatches(row, contextType) {
  if (!contextType) {
    return true;
  }
  const normalizedContext = normalizeText(contextType);
  const rowContext = normalizeText(row?.contextType || row?.metadata?.contextType || row?.intent);
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
    return {
      totalEvents: 0,
      acceptanceRate: 0.5,
      saveRate: 0.2,
      ignoreRate: 0.2,
      repeatSelectionRate: 0.15,
      delayedRewardProxy: 0.45,
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

  return {
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
}

module.exports = {
  normalizeAction,
  listDomainFeedback,
  recordDomainFeedback,
  buildFeedbackProfile,
};
