const DOMAIN_REGISTRY = {
  food: {
    id: 'food',
    label: 'Food',
    description: 'Nutrition-aware recommendations across meals, recipes, and restaurants.',
    itemTypes: ['meal', 'recipe', 'restaurant'],
    feedbackActions: ['selected', 'helpful', 'save', 'not_interested', 'ignored'],
  },
  fitness: {
    id: 'fitness',
    label: 'Fitness',
    description: 'Activity and recovery recommendations connected to cross-domain behavior.',
    itemTypes: ['activity', 'recovery'],
    feedbackActions: ['selected', 'helpful', 'save', 'not_interested', 'ignored'],
  },
  media: {
    id: 'media',
    label: 'Media',
    description: 'Movie and music recommendations contextualized by activity and meal decisions.',
    itemTypes: ['movie', 'song', 'playlist', 'show'],
    feedbackActions: ['selected', 'helpful', 'save', 'not_interested', 'ignored'],
  },
};

function normalizeDomainId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z-]/g, '');
}

function aliasToDomainId(value) {
  const normalized = normalizeDomainId(value);
  if (normalized === 'content') {
    return 'media';
  }
  if (normalized === 'movie' || normalized === 'music' || normalized === 'song') {
    return 'media';
  }
  if (normalized === 'meal' || normalized === 'restaurant' || normalized === 'recipe') {
    return 'food';
  }
  if (normalized === 'exercise' || normalized === 'workout') {
    return 'fitness';
  }
  return normalized;
}

function getDomain(domainId) {
  const key = aliasToDomainId(domainId);
  return DOMAIN_REGISTRY[key] || null;
}

function ensureDomain(domainId) {
  const domain = getDomain(domainId);
  if (!domain) {
    throw new Error(`Unsupported recommendation domain: ${String(domainId || 'unknown')}`);
  }
  return domain;
}

function listDomains() {
  return Object.values(DOMAIN_REGISTRY);
}

function listDomainIds() {
  return Object.keys(DOMAIN_REGISTRY);
}

function isSupportedDomain(domainId) {
  return Boolean(getDomain(domainId));
}

module.exports = {
  DOMAIN_REGISTRY,
  normalizeDomainId,
  aliasToDomainId,
  getDomain,
  ensureDomain,
  listDomains,
  listDomainIds,
  isSupportedDomain,
};
