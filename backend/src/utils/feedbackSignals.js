const ACTION_SIGNALS = Object.freeze({
  shown: { label: 'exposure', utility: 0, immediateReward: 0.45, positive: false },
  selected: { label: 'positive', utility: 0.72, immediateReward: 1, positive: true },
  save: { label: 'positive', utility: 1, immediateReward: 0.92, positive: true },
  helpful: { label: 'positive', utility: 0.85, immediateReward: 0.85, positive: true },
  ignored: { label: 'weak_negative', utility: -0.25, immediateReward: 0.22, positive: false },
  not_interested: { label: 'negative', utility: -0.8, immediateReward: 0.05, positive: false },
});

function normalizeFeedbackAction(value, fallback = 'shown') {
  const action = String(value || '').trim().toLowerCase();
  if (action === 'chosen') return 'selected';
  if (action === 'dismissed') return 'not_interested';
  if (action === 'saved') return 'save';
  return action || fallback;
}

function feedbackSignalForAction(value) {
  const action = normalizeFeedbackAction(value);
  const signal = ACTION_SIGNALS[action] || {
    label: 'unknown',
    utility: 0,
    immediateReward: 0.4,
    positive: false,
  };

  return {
    action,
    ...signal,
  };
}

function feedbackUtility(value) {
  return feedbackSignalForAction(value).utility;
}

function immediateRewardForAction(value) {
  return feedbackSignalForAction(value).immediateReward;
}

module.exports = {
  ACTION_SIGNALS,
  normalizeFeedbackAction,
  feedbackSignalForAction,
  feedbackUtility,
  immediateRewardForAction,
};
