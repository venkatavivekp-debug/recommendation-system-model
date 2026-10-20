const { randomUUID, createHash } = require('node:crypto');
const userModel = require('../models/userModel');
const interactionModel = require('../models/recommendationInteractionModel');
const { normalizeFeedbackAction, banditRewardForAction } = require('../utils/feedbackSignals');
const AppError = require('../utils/appError');

const POLICY_VERSION = 'contextfit-bandit-v1';
const FEATURE_SCHEMA_VERSION = 'contextfit-features-v1';
const LAMBDA = 1;
const ALPHA = 0.08;
const POLICY_WEIGHT = 0.25;
const FEATURE_KEYS = Object.freeze([
  'bias', 'baseRelevance', 'preferenceMatch', 'feedbackAffinity',
  'sessionIntentFit', 'attributeFit', 'contextFit', 'crossDomainFit',
]);
const clamp01 = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const targetDomain = domain => domain === 'content' ? 'media' : domain;

function initialState() {
  return {
    policyVersion: POLICY_VERSION, featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    A: FEATURE_KEYS.map((_, i) => FEATURE_KEYS.map((__, j) => i === j ? LAMBDA : 0)),
    b: FEATURE_KEYS.map(() => 0), updateCount: 0, appliedEvents: {},
  };
}

// Cholesky solves avoid persisting an inverse. Ridge + outer-product updates stay SPD.
function factor(A) {
  const n = FEATURE_KEYS.length;
  if (!Array.isArray(A) || A.length !== n || !A.every(row => Array.isArray(row) && row.length === n && row.every(Number.isFinite))) throw Error('Invalid policy matrix');
  const L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      if (!Number.isFinite(A[i]?.[j]) || Math.abs(A[i][j] - A[j]?.[i]) > 1e-8) throw Error('Invalid policy symmetry');
      let value = A[i][j];
      for (let k = 0; k < j; k += 1) value -= L[i][k] * L[j][k];
      if (i === j && value <= 0) throw Error('Invalid policy regularization');
      L[i][j] = i === j ? Math.sqrt(value) : value / L[j][j];
    }
  }
  return L;
}

function solve(L, vector) {
  const n = vector.length;
  const y = Array(n).fill(0);
  const x = Array(n).fill(0);
  for (let i = 0; i < n; i += 1) y[i] = (vector[i] - dot(L[i].slice(0, i), y.slice(0, i))) / L[i][i];
  for (let i = n - 1; i >= 0; i -= 1) {
    let value = y[i];
    for (let j = i + 1; j < n; j += 1) value -= L[j][i] * x[j];
    x[i] = value / L[i][i];
  }
  return x;
}

function validateState(state) {
  if (!state) return initialState();
  // Fail closed: never silently discard learned preferences or deduplication receipts.
  if (state.policyVersion !== POLICY_VERSION || state.featureSchemaVersion !== FEATURE_SCHEMA_VERSION ||
      !Array.isArray(state.b) || state.b.length !== FEATURE_KEYS.length || !state.b.every(Number.isFinite) ||
      !Number.isSafeInteger(state.updateCount) || state.updateCount < 0 || !state.appliedEvents ||
      typeof state.appliedEvents !== 'object' || Array.isArray(state.appliedEvents)) {
    throw new AppError('Adaptive preference state needs repair.', 503, 'INVALID_POLICY_STATE');
  }
  try { factor(state.A); } catch (_) {
    throw new AppError('Adaptive preference state needs repair.', 503, 'INVALID_POLICY_STATE');
  }
  return state;
}

async function getPolicy(userId, domain) {
  const user = userId ? await userModel.findUserById(userId) : null;
  return validateState(user?.adaptivePolicies?.[targetDomain(domain)]);
}

function candidateFeatures(candidate, options = {}) {
  const r = candidate.recommendation || {};
  const f = { ...candidate.features, ...r.features, ...r.factors };
  const baseScore = clamp01(r.scoreTrace?.baseScore ?? r.confidence ?? (r.score == null ? candidate.confidence : r.score / 100));
  const values = {
    bias: 1, baseRelevance: baseScore,
    preferenceMatch: clamp01(f.preferenceFit ?? f.preferenceMatch ?? f.genreMatch),
    feedbackAffinity: clamp01(f.affinityFit ?? f.interactionAffinity ?? f.learnedPreferenceFit ?? f.historySimilarity),
    sessionIntentFit: clamp01(f.sessionIntentFit),
    attributeFit: clamp01(f.macroFit ?? f.proteinMatch ?? f.durationFit),
    contextFit: clamp01(f.contextFit ?? f.mealContextFit ?? f.calorieFit),
    crossDomainFit: options.crossDomainSignals?.length ? clamp01(f.crossDomainFit ?? f.activityFit) : 0,
  };
  return { values, vector: FEATURE_KEYS.map(key => values[key] / Math.sqrt(FEATURE_KEYS.length)), baseScore };
}

function rankCandidatesWithBandit(candidates = [], options = {}) {
  const domain = targetDomain(options.domain || 'food');
  const state = validateState(options.policyState);
  const L = factor(state.A);
  const theta = solve(L, state.b);
  if (!theta.every(Number.isFinite)) throw new AppError('Adaptive preference state needs repair.', 503, 'INVALID_POLICY_STATE');
  const ranked = candidates.filter(candidate => domain !== 'food' ||
    !require('./feedbackLearningService').itemFeedback(candidate, options.feedbackSignals || {}).suppressed)
    .map(candidate => {
      const { values, vector, baseScore } = candidateFeatures(candidate, options);
      const exploitation = dot(theta, vector);
      const uncertainty = Math.sqrt(Math.max(0, dot(vector, solve(L, vector))));
      const exploration = Math.min(ALPHA, ALPHA * uncertainty);
      const adaptive = POLICY_WEIGHT * exploitation;
      const score = baseScore + adaptive + exploration;
      if (![exploitation, uncertainty, score].every(Number.isFinite)) throw new AppError('Adaptive preference state needs repair.', 503, 'INVALID_POLICY_STATE');
      const r = candidate.recommendation || {};
      const scoreTrace = {
        ...(r.scoreTrace || {}), baseScore,
        baseRelevance: r.scoreTrace?.baseRelevance ?? baseScore,
        preferenceContribution: r.scoreTrace?.preferenceContribution ?? 0,
        contextContribution: r.scoreTrace?.contextContribution ?? 0,
        feedbackContribution: r.scoreTrace?.feedbackContribution ?? 0,
        crossDomainContextContribution: r.scoreTrace?.crossDomainContextContribution ?? 0,
        banditExploitation: exploitation, adaptivePolicyContribution: adaptive,
        banditExploration: exploration, explorationBonus: exploration,
        banditScore: exploitation + exploration, finalScore: score,
        diversityAdjustment: 0, policyVersion: POLICY_VERSION,
        featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        featureContributions: Object.fromEntries(FEATURE_KEYS.map((key, i) => [key, POLICY_WEIGHT * theta[i] * vector[i]])),
      };
      return { ...candidate, score: score * 100,
        recommendation: { ...r, score: score * 100, confidence: clamp01(score),
          confidencePct: clamp01(score) * 100, scoreTrace,
          policyVersion: POLICY_VERSION, featureSchemaVersion: FEATURE_SCHEMA_VERSION,
          bandit: { exploitation, exploration, uncertainty, updateCount: state.updateCount },
          policyFeatures: { values, vector }, crossDomainSignals: options.crossDomainSignals || [],
        } };
    });
  const tie = (a, b) => String(a.id || a.placeId || a.title).localeCompare(String(b.id || b.placeId || b.title));
  const exploit = [...ranked].sort((a, b) =>
    (b.recommendation.scoreTrace.baseScore + b.recommendation.scoreTrace.adaptivePolicyContribution) -
    (a.recommendation.scoreTrace.baseScore + a.recommendation.scoreTrace.adaptivePolicyContribution) || tie(a, b));
  const exploitRanks = new Map(exploit.map((item, i) => [item, i]));
  return ranked.sort((a, b) => b.score - a.score || tie(a, b)).map((item, i) => ({
    ...item, recommendation: { ...item.recommendation, rank: i + 1,
      winnerTakeAllSelected: i === 0, explorationSelected: i < exploitRanks.get(item),
      exploitationRank: exploitRanks.get(item) + 1 },
  }));
}

async function logImpressions(userId, domain, candidates, context = {}) {
  const timestamp = new Date().toISOString();
  const records = candidates.map((candidate, i) => {
    const r = candidate.recommendation;
    if (!r?.policyFeatures) throw new Error('Impression must follow adaptive ranking');
    const id = randomUUID();
    r.recommendationEventId = id;
    r.rank = i + 1;
    return { id, userId, domain: targetDomain(domain), action: 'shown', eventType: 'shown',
      candidateId: String(candidate.id || candidate.placeId), itemName: candidate.title || candidate.name || candidate.foodName || '',
      candidateRank: i + 1, createdAt: timestamp,
      context: { ...context, candidate: {
        contentType: candidate.type, title: candidate.title, features: candidate.features,
        genre: candidate.genre, artist: candidate.artist, mood: candidate.mood,
        energy: candidate.energy, tempo: candidate.tempo, durationSeconds: candidate.durationSeconds,
        tags: candidate.tags,
      }, adaptive: {
        policyVersion: POLICY_VERSION, featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        features: r.policyFeatures, scoreTrace: r.scoreTrace, crossDomainSignals: r.crossDomainSignals,
        explorationAffectedSelection: r.explorationSelected,
      } },
    };
  });
  if (userId && records.length) await interactionModel.createInteractions(records);
  return candidates;
}

async function applyFeedback(userId, payload) {
  const recommendationEventId = payload.recommendationEventId;
  if (!recommendationEventId) return null; // Legacy feedback has no trustworthy feature snapshot.
  const domain = targetDomain(payload.domain);
  const action = normalizeFeedbackAction(payload.action);
  const reward = banditRewardForAction(action);
  if (reward === null) return null;
  const impression = await interactionModel.findInteraction(userId, recommendationEventId);
  const adaptive = impression?.context?.adaptive;
  if (!impression || impression.action !== 'shown' || impression.domain !== domain ||
      impression.candidateId !== String(payload.itemId) || adaptive?.policyVersion !== POLICY_VERSION ||
      adaptive.featureSchemaVersion !== FEATURE_SCHEMA_VERSION) {
    throw new AppError('Recommendation event does not match this feedback.', 400, 'INVALID_RECOMMENDATION_EVENT');
  }
  const x = adaptive.features?.vector;
  if (!Array.isArray(x) || x.length !== FEATURE_KEYS.length || !x.every(Number.isFinite) || dot(x, x) > 1.000001) {
    throw new AppError('Recommendation features are invalid.', 400, 'INVALID_RECOMMENDATION_EVENT');
  }
  // One update per explicit action on an impression, including retried/double-clicked requests.
  const feedbackEventId = createHash('sha256').update(`${userId}:${domain}:${recommendationEventId}:${action}`).digest('hex');
  let duplicate = false;
  await userModel.mutateAdaptivePolicy(userId, domain, previous => {
    const state = validateState(previous);
    duplicate = Boolean(state.appliedEvents[feedbackEventId]);
    if (duplicate) return state;
    const A = state.A.map((row, i) => row.map((value, j) => value + x[i] * x[j]));
    const b = state.b.map((value, i) => value + reward * x[i]);
    return { ...state, A, b, updateCount: state.updateCount + 1,
      appliedEvents: { ...state.appliedEvents, [feedbackEventId]: recommendationEventId } };
  });
  return { recommendationEventId, feedbackEventId, userId, domain,
    candidateId: impression.candidateId, action, reward, features: adaptive.features,
    policyVersion: POLICY_VERSION, featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    timestamp: new Date().toISOString(), duplicate, delayedOutcome: null };
}

async function getUserFeedbackSignals(userId, options = {}) {
  return require('./feedbackLearningService').buildFeedbackProfile(userId, { ...options, domain: targetDomain(options.domain || 'food') });
}

module.exports = {
  POLICY_VERSION, FEATURE_SCHEMA_VERSION, FEATURE_KEYS, LAMBDA, ALPHA, POLICY_WEIGHT,
  initialState, validateState, candidateFeatures, getPolicy, rankCandidatesWithBandit,
  logImpressions, applyFeedback, getUserFeedbackSignals,
};
