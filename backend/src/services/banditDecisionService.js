const recommendationInteractionModel = require('../models/recommendationInteractionModel');
const userContentInteractionModel = require('../models/userContentInteractionModel');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(toNumber(value, 0), 0, 1);
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function deterministicRandom(seedText = '') {
  let hash = 0;
  const seed = String(seedText || '');
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

function computeFeedbackSignalsFromRows(rows = [], options = {}) {
  const targetContext = normalizeText(options.contextType || '');
  const relevant = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!targetContext) {
      return true;
    }
    const rowContext = normalizeText(row?.metadata?.contextType || row?.contextType || row?.intent);
    return !rowContext || rowContext === targetContext;
  });

  if (!relevant.length) {
    return {
      acceptanceRate: 0.5,
      saveRate: 0.2,
      ignoreRate: 0.2,
      repeatSelectionRate: 0.15,
      delayedRewardProxy: 0.45,
      totalEvents: 0,
    };
  }

  const shown = relevant.filter(
    (row) =>
      normalizeText(row?.eventType || row?.action) === 'shown' ||
      normalizeText(row?.action) === 'shown'
  );
  const positive = relevant.filter((row) =>
    ['chosen', 'selected', 'helpful', 'save'].includes(normalizeText(row?.eventType || row?.action))
  );
  const saved = relevant.filter((row) => normalizeText(row?.action) === 'save');
  const ignored = relevant.filter((row) =>
    ['not_interested', 'dismissed', 'ignored'].includes(normalizeText(row?.action))
  );

  const keyCounts = new Map();
  positive.forEach((row) => {
    const key = String(row?.itemId || row?.candidateId || row?.title || '').trim().toLowerCase();
    if (!key) return;
    keyCounts.set(key, toNumber(keyCounts.get(key), 0) + 1);
  });
  const repeatSelections = [...keyCounts.values()].filter((count) => count > 1).length;

  const acceptanceRate =
    shown.length > 0 ? clamp01(positive.length / Math.max(shown.length, 1)) : clamp01(positive.length / 8);
  const saveRate =
    positive.length > 0 ? clamp01(saved.length / Math.max(positive.length, 1)) : clamp01(saved.length / 8);
  const ignoreRate =
    shown.length > 0 ? clamp01(ignored.length / Math.max(shown.length, 1)) : clamp01(ignored.length / 8);
  const repeatSelectionRate =
    keyCounts.size > 0 ? clamp01(repeatSelections / Math.max(keyCounts.size, 1)) : 0.1;

  const delayedRewardProxy = clamp01(
    acceptanceRate * 0.55 + saveRate * 0.2 + repeatSelectionRate * 0.25 - ignoreRate * 0.2
  );

  return {
    acceptanceRate: Number(acceptanceRate.toFixed(4)),
    saveRate: Number(saveRate.toFixed(4)),
    ignoreRate: Number(ignoreRate.toFixed(4)),
    repeatSelectionRate: Number(repeatSelectionRate.toFixed(4)),
    delayedRewardProxy: Number(delayedRewardProxy.toFixed(4)),
    totalEvents: relevant.length,
  };
}

async function getUserFeedbackSignals(userId, options = {}) {
  const domain = normalizeText(options.domain || 'food');
  const limit = Math.max(120, toNumber(options.limit, 1200));

  if (!userId) {
    return computeFeedbackSignalsFromRows([], options);
  }

  if (domain === 'content') {
    const rows = await userContentInteractionModel.listInteractionsByUser(userId, limit);
    return computeFeedbackSignalsFromRows(rows, options);
  }

  const rows = await recommendationInteractionModel.listInteractionsByUser(userId, limit);
  return computeFeedbackSignalsFromRows(rows, options);
}

function delayedRewardForCandidate(candidate = {}, feedbackSignals = {}) {
  const interactionAffinity = clamp01(
    toNumber(candidate?.recommendation?.features?.interactionAffinity, NaN) ||
      toNumber(candidate?.recommendation?.features?.historyScore, NaN) ||
      toNumber(candidate?.recommendation?.features?.historySimilarity, 0.45)
  );
  const repeatSelectionRate = clamp01(toNumber(feedbackSignals.repeatSelectionRate, 0.1));
  const saveRate = clamp01(toNumber(feedbackSignals.saveRate, 0.2));
  const ignorePenalty = clamp01(toNumber(feedbackSignals.ignoreRate, 0.2));

  return clamp01(
    interactionAffinity * 0.5 + repeatSelectionRate * 0.25 + saveRate * 0.25 - ignorePenalty * 0.18
  );
}

function rankCandidatesWithBandit(candidates = [], options = {}) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  if (!safeCandidates.length) {
    return [];
  }

  const immediateWeight = clamp01(toNumber(options.immediateWeight, 0.72));
  const delayedWeight = clamp01(toNumber(options.delayedWeight, 0.28));
  const epsilon = clamp01(toNumber(options.explorationRate, 0.2));
  const feedbackSignals = options.feedbackSignals || computeFeedbackSignalsFromRows([], options);
  const contextType = normalizeText(options.contextType || options.intent || 'daily');
  const hourBucket = new Date().toISOString().slice(0, 13);

  const ranked = safeCandidates
    .map((candidate, index) => {
      const immediateReward = clamp01(
        toNumber(candidate?.recommendation?.confidence, NaN) ||
          toNumber(candidate?.recommendation?.score, 0) / 100 ||
          toNumber(candidate?.confidence, 0)
      );
      const delayedReward = delayedRewardForCandidate(candidate, feedbackSignals);
      const banditScore = clamp01(immediateReward * immediateWeight + delayedReward * delayedWeight);

      return {
        ...candidate,
        _bandit: {
          index,
          immediateReward: Number(immediateReward.toFixed(4)),
          delayedReward: Number(delayedReward.toFixed(4)),
          score: Number(banditScore.toFixed(4)),
        },
      };
    })
    .sort((a, b) => b._bandit.score - a._bandit.score);

  const exploreRoll = deterministicRandom(
    `${options.userId || 'anon'}:${contextType}:${hourBucket}:bandit`
  );
  if (exploreRoll < epsilon && ranked.length > 2) {
    const exploreIndex = Math.min(
      ranked.length - 1,
      1 + Math.floor(deterministicRandom(`${contextType}:${hourBucket}:pick`) * Math.min(3, ranked.length - 1))
    );
    const [exploreCandidate] = ranked.splice(exploreIndex, 1);
    ranked.unshift(exploreCandidate);
  }

  return ranked.map((candidate, index) => {
    const confidence = clamp01(
      toNumber(candidate?.recommendation?.confidence, NaN) || toNumber(candidate._bandit?.score, 0)
    );
    const isWinner = index === 0;
    return {
      ...candidate,
      recommendation: {
        ...(candidate.recommendation || {}),
        rank: index + 1,
        winnerTakeAllSelected: isWinner,
        confidence: Number(confidence.toFixed(4)),
        confidencePct: Number((confidence * 100).toFixed(1)),
        score: Number((confidence * 100).toFixed(2)),
        bandit: {
          immediateReward: candidate._bandit?.immediateReward || 0,
          delayedReward: candidate._bandit?.delayedReward || 0,
          score: candidate._bandit?.score || 0,
          immediateWeight,
          delayedWeight,
        },
        delayedRewardProxy: Number(toNumber(feedbackSignals.delayedRewardProxy, 0.45).toFixed(4)),
      },
      _bandit: undefined,
    };
  });
}

module.exports = {
  getUserFeedbackSignals,
  computeFeedbackSignalsFromRows,
  rankCandidatesWithBandit,
};
