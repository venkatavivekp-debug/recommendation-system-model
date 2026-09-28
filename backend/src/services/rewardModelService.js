const { immediateRewardForAction } = require('../utils/feedbackSignals');

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

function immediateRewardFromAction(action) {
  return immediateRewardForAction(action);
}

function delayedRewardProxy(signals = {}) {
  const acceptanceRate = clamp01(toNumber(signals.acceptanceRate, 0.5));
  const saveRate = clamp01(toNumber(signals.saveRate, 0.2));
  const repeatSelectionRate = clamp01(toNumber(signals.repeatSelectionRate, 0.15));
  const ignoreRate = clamp01(toNumber(signals.ignoreRate, 0.2));
  const followThroughRate = clamp01(toNumber(signals.followThroughRate, 0.45));

  return clamp01(
    acceptanceRate * 0.42 +
      saveRate * 0.22 +
      repeatSelectionRate * 0.18 +
      followThroughRate * 0.18 -
      ignoreRate * 0.2
  );
}

function blendBanditReward({
  immediateReward = 0,
  delayedReward = 0,
  immediateWeight = 0.72,
  delayedWeight = 0.28,
} = {}) {
  return clamp01(
    clamp01(immediateReward) * clamp01(immediateWeight) +
      clamp01(delayedReward) * clamp01(delayedWeight)
  );
}

function rewardFromFeedback(action, feedbackSignals = {}, options = {}) {
  const immediate = immediateRewardFromAction(action);
  const delayed = delayedRewardProxy(feedbackSignals);
  const score = blendBanditReward({
    immediateReward: immediate,
    delayedReward: delayed,
    immediateWeight: options.immediateWeight,
    delayedWeight: options.delayedWeight,
  });

  return {
    immediateReward: Number(immediate.toFixed(4)),
    delayedReward: Number(delayed.toFixed(4)),
    score: Number(score.toFixed(4)),
  };
}

module.exports = {
  immediateRewardFromAction,
  delayedRewardProxy,
  blendBanditReward,
  rewardFromFeedback,
};
