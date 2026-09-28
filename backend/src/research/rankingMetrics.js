function itemKey(item) {
  return String(typeof item === 'string' ? item : item?.itemId || item?.id || '').trim();
}

function topK(items = [], k = 10) {
  return (Array.isArray(items) ? items : []).slice(0, Math.max(0, Number(k) || 0));
}

function relevantSet(items = []) {
  return new Set((Array.isArray(items) ? items : []).map(itemKey).filter(Boolean));
}

function hitsAtK(rankedItems = [], relevantItems = [], k = 10) {
  const relevant = relevantSet(relevantItems);
  return topK(rankedItems, k).filter((item) => relevant.has(itemKey(item))).length;
}

function precisionAtK(rankedItems = [], relevantItems = [], k = 10) {
  const limit = Math.max(1, Number(k) || 1);
  return hitsAtK(rankedItems, relevantItems, limit) / limit;
}

function recallAtK(rankedItems = [], relevantItems = [], k = 10) {
  const relevant = relevantSet(relevantItems);
  if (!relevant.size) {
    return 0;
  }
  return hitsAtK(rankedItems, relevantItems, k) / relevant.size;
}

function dcgAtK(rankedItems = [], relevantItems = [], k = 10) {
  const relevant = relevantSet(relevantItems);
  return topK(rankedItems, k).reduce((total, item, index) => {
    if (!relevant.has(itemKey(item))) {
      return total;
    }
    return total + 1 / Math.log2(index + 2);
  }, 0);
}

function ndcgAtK(rankedItems = [], relevantItems = [], k = 10) {
  const relevant = relevantSet(relevantItems);
  if (!relevant.size) {
    return 0;
  }

  const idealLength = Math.min(Math.max(0, Number(k) || 0), relevant.size);
  const ideal = Array.from({ length: idealLength }, (_, index) => 1 / Math.log2(index + 2))
    .reduce((sum, value) => sum + value, 0);

  return ideal > 0 ? dcgAtK(rankedItems, relevantItems, k) / ideal : 0;
}

function rankingMetricsAtK({ rankedItems = [], relevantItems = [], k = 10 } = {}) {
  return {
    precision: precisionAtK(rankedItems, relevantItems, k),
    recall: recallAtK(rankedItems, relevantItems, k),
    ndcg: ndcgAtK(rankedItems, relevantItems, k),
  };
}

module.exports = {
  precisionAtK,
  recallAtK,
  ndcgAtK,
  rankingMetricsAtK,
};
