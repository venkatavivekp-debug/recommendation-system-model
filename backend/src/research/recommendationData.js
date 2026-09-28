const domainRegistryService = require('../services/domainRegistryService');
const { feedbackSignalForAction, normalizeFeedbackAction } = require('../utils/feedbackSignals');

function normalizeDomain(value = 'food') {
  const domain = domainRegistryService.aliasToDomainId(value || 'food');
  return domainRegistryService.isSupportedDomain(domain) ? domain : 'food';
}

function slug(value) {
  return String(value || 'unknown-item')
    .trim()
    .toLowerCase()
    .replace(/^([a-z]+):/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-item';
}

function normalizeItemId(domainValue, rawId) {
  const domain = normalizeDomain(domainValue);
  return `${domain}:${slug(rawId)}`;
}

function timestampIso(value) {
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function inferDomain(row = {}, defaults = {}) {
  return normalizeDomain(
    row.domain ||
      row.context?.domain ||
      row.metadata?.domain ||
      row.contentType ||
      defaults.domain ||
      'food'
  );
}

function interactionItemId(row = {}, defaults = {}) {
  return (
    row.itemId ||
    row.candidateId ||
    row.placeId ||
    row.foodId ||
    row.recipeId ||
    row.itemName ||
    row.title ||
    row.foodName ||
    defaults.itemId ||
    defaults.itemName
  );
}

function normalizeInteraction(row = {}, defaults = {}) {
  const domain = inferDomain(row, defaults);
  const action = normalizeFeedbackAction(row.action || row.eventType || defaults.action);
  const signal = feedbackSignalForAction(action);

  return {
    userId: String(row.userId || defaults.userId || '').trim(),
    itemId: normalizeItemId(domain, interactionItemId(row, defaults)),
    domain,
    action: signal.action,
    signal: {
      label: signal.label,
      utility: signal.utility,
      immediateReward: signal.immediateReward,
      positive: signal.positive,
    },
    timestamp: timestampIso(row.timestamp || row.createdAt || defaults.timestamp),
    context: {
      contextType: row.contextType || row.context?.contextType || row.metadata?.contextType || row.context?.mode || null,
      sourceType: row.sourceType || row.context?.sourceType || row.metadata?.sourceType || null,
      rank: row.rank ?? row.candidateRank ?? null,
    },
  };
}

function normalizeInteractions(rows = [], defaults = {}) {
  return (Array.isArray(rows) ? rows : []).map((row) => normalizeInteraction(row, defaults));
}

function splitSorted(rows, options = {}) {
  const sorted = [...rows].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const total = sorted.length;
  if (total <= 1) {
    return { train: sorted, validation: [], test: [] };
  }

  const trainRatio = Number(options.trainRatio ?? 0.7);
  const validationRatio = Number(options.validationRatio ?? 0.15);
  let trainEnd = Math.max(1, Math.floor(total * trainRatio));
  let validationEnd = Math.floor(total * (trainRatio + validationRatio));

  if (total >= 3 && validationEnd <= trainEnd) {
    validationEnd = trainEnd + 1;
  }
  if (validationEnd >= total) {
    validationEnd = total - 1;
  }
  if (trainEnd >= validationEnd) {
    trainEnd = Math.max(1, validationEnd - 1);
  }

  return {
    train: sorted.slice(0, trainEnd),
    validation: sorted.slice(trainEnd, validationEnd),
    test: sorted.slice(validationEnd),
  };
}

function temporalSplit(interactions = [], options = {}) {
  const rows = normalizeInteractions(interactions);
  if (options.perUser === false) {
    return splitSorted(rows, options);
  }

  const grouped = new Map();
  rows.forEach((row) => {
    const key = row.userId || 'unknown-user';
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });

  const split = { train: [], validation: [], test: [] };
  [...grouped.values()].forEach((group) => {
    const next = splitSorted(group, options);
    split.train.push(...next.train);
    split.validation.push(...next.validation);
    split.test.push(...next.test);
  });
  return split;
}

function hashSeed(seedText) {
  let hash = 2166136261;
  const text = String(seedText || 'seed');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seedText) {
  let state = hashSeed(seedText);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffled(list = [], seedText = '') {
  const random = seededRandom(seedText);
  return [...list]
    .map((item) => ({ item, order: random() }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.item);
}

function normalizeCandidate(candidate, fallbackDomain) {
  if (typeof candidate === 'string') {
    const [prefix] = candidate.split(':');
    const domain = domainRegistryService.isSupportedDomain(prefix) ? prefix : fallbackDomain;
    return { itemId: normalizeItemId(domain, candidate), domain: normalizeDomain(domain) };
  }

  const domain = normalizeDomain(candidate?.domain || fallbackDomain);
  const rawId = candidate?.itemId || candidate?.id || candidate?.title || candidate?.name;
  return { itemId: normalizeItemId(domain, rawId), domain };
}

function sampleNegatives({
  positives = [],
  candidates = [],
  candidateItemIds = [],
  negativesPerPositive = 4,
  seed = 'negative-sampling',
  domain = 'food',
} = {}) {
  const positiveRows = normalizeInteractions(positives, { domain });
  const candidateRows = [...candidateItemIds, ...candidates].map((item) => normalizeCandidate(item, domain));
  const knownByUser = new Map();

  positiveRows.forEach((row) => {
    const key = row.userId || 'unknown-user';
    knownByUser.set(key, new Set([...(knownByUser.get(key) || []), row.itemId]));
  });

  const count = Math.max(0, Number(negativesPerPositive) || 0);
  const negatives = [];
  positiveRows.forEach((positive, index) => {
    const known = knownByUser.get(positive.userId || 'unknown-user') || new Set();
    const eligible = candidateRows.filter(
      (candidate) => candidate.domain === positive.domain && !known.has(candidate.itemId)
    );

    shuffled(eligible, `${seed}:${positive.userId}:${positive.itemId}:${index}`)
      .slice(0, count)
      .forEach((candidate) => {
        negatives.push({
          userId: positive.userId,
          itemId: candidate.itemId,
          domain: candidate.domain,
          label: 0,
          positiveItemId: positive.itemId,
        });
      });
  });

  return negatives;
}

module.exports = {
  normalizeDomain,
  normalizeItemId,
  normalizeInteraction,
  normalizeInteractions,
  temporalSplit,
  sampleNegatives,
};
