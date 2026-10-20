export function contributionPercent(feature) {
  const pct = Number(feature?.contributionPct)
  if (Number.isFinite(pct)) {
    return Math.max(0, Math.min(100, Math.round(pct)))
  }

  const raw = Number(feature?.contribution || 0)
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(raw > 1 ? raw : raw * 100)))
}

export function matchPercent(...values) {
  const value = values.map(Number).find((item) => Number.isFinite(item)) || 0
  return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)))
}

export function adaptationMessage(item, action, before = [], after = []) {
  const id = item.id || item.itemId || item.placeId || item.name || item.title
  const rank = (items) => {
    const index = items.findIndex((entry) => (entry.id || entry.itemId || entry.placeId || entry.name || entry.title) === id)
    return index < 0 ? null : index + 1
  }
  const beforeRank = rank(before)
  const afterRank = rank(after)
  const title = item.foodName || item.title || item.name || 'Your recommendation'

  if (action === 'not_interested' && beforeRank && afterRank === null) return `${title} was removed after Not Interested.`
  const actionLabel = { selected: 'selection', save: 'save', helpful: 'feedback', not_interested: 'feedback' }[action] || 'feedback'
  if (beforeRank && afterRank && beforeRank !== afterRank) return `${title} moved #${beforeRank} → #${afterRank} after your ${actionLabel}.`
  if (beforeRank && afterRank === null) return `${title} is no longer in the current list.`
  if (!beforeRank && afterRank) return `${title} entered the list at #${afterRank}.`
  return 'Preference saved for future recommendations.'
}

export function fallbackArtwork(kind = 'food') {
  const variants = {
    food: { background: '#203b38', foreground: '#a7f3d0', symbol: 'FOOD', label: 'Illustrative meal placeholder' },
    restaurant: { background: '#26374a', foreground: '#bae6fd', symbol: 'PLACE', label: 'Restaurant photo unavailable' },
    music: { background: '#26354a', foreground: '#99f6e4', symbol: '♪', label: 'Provider artwork unavailable' },
    movie: { background: '#37344a', foreground: '#ddd6fe', symbol: 'FILM', label: 'Provider poster unavailable' },
  }
  const artwork = variants[kind] || variants.food
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="${artwork.background}"/><circle cx="320" cy="185" r="96" fill="#ffffff" fill-opacity=".07"/><text x="320" y="205" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${kind === 'music' ? 78 : 26}" font-weight="700" fill="${artwork.foreground}">${artwork.symbol}</text><text x="320" y="340" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" fill="#cbd5e1">${artwork.label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function foodInsight(item = {}, nutrition = item.nutrition || item.nutritionEstimate || {}, activityLabel = 'Based on recent activity') {
  if (Number(nutrition.protein) >= 25) return 'High protein match'
  if (Number(nutrition.calories) > 0 && Number(nutrition.calories) <= 550) return 'Low calorie option'
  if (item.route?.walking?.caloriesBurned) return activityLabel
  return 'Balanced option'
}

export function foodTags(item = {}, nutrition = item.nutrition || item.nutritionEstimate || {}) {
  return [
    Number(nutrition.protein) >= 25 ? 'Protein' : '',
    Number(nutrition.calories) > 0 && Number(nutrition.calories) <= 550 ? 'Low Calorie' : '',
    item.route?.walking?.caloriesBurned ? 'Activity Fit' : '',
    item.cuisine || item.cuisineType || '',
  ].filter(Boolean).slice(0, 3)
}

export function foodAdaptiveLabel(item = {}, isTopRecommendation = false, options = {}) {
  const factors = item.recommendation?.factors || {}
  const topFeatures = item.recommendation?.topFeatures || []
  const featureText = topFeatures.map((feature) => String(feature?.name || feature)).join(' ').toLowerCase()

  if ((options.usePreferenceFactor && Number(factors.preferenceMatch) > 0) || /preference|history|feedback|recent/.test(featureText)) {
    return 'Preference and history fit'
  }

  if (item.route?.walking?.caloriesBurned) {
    return 'Includes estimated walking activity'
  }

  return isTopRecommendation ? 'Top contextual pick' : ''
}

export function contentFactorLabel(name) {
  const labels = {
    genreMatch: 'Genre match',
    moodMatch: 'Mood fit',
    durationFit: 'Duration fit',
    contextFit: 'Context fit',
    timeOfDayFit: 'Time fit',
    historySimilarity: 'History fit',
    activityFit: 'Activity fit',
  }
  return labels[name] || name
}

export function contentInsight(item = {}, variant = 'movie') {
  const topFactor = item.topFactors?.[0]?.name
  if (topFactor) return contentFactorLabel(topFactor)
  if (variant === 'song') return 'Activity fit'
  return 'Mood and genre fit'
}

export function contentTags(item = {}, variant = 'movie') {
  return [
    item.genre,
    item.mood,
    variant === 'song' ? item.contextType || 'Music' : item.type || 'Movie',
  ].filter(Boolean).slice(0, 3)
}

export function contentAdaptiveLabel(item = {}, isTopRecommendation = false) {
  const factorNames = (item.topFactors || []).map((factor) => factor.name)
  if (factorNames.includes('historySimilarity')) return 'History contributes to this match'
  if (factorNames.includes('activityFit')) return 'Activity contributes to this match'
  return isTopRecommendation ? 'Top contextual pick' : ''
}

export function policyScoreSummary(trace) {
  if (!trace || ![trace.baseScore, trace.adaptivePolicyContribution, trace.explorationBonus].every(Number.isFinite)) return ''
  const signed = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}`
  return `Base ${(trace.baseScore * 100).toFixed(1)}; learned preference ${signed(trace.adaptivePolicyContribution)}; exploration ${signed(trace.explorationBonus)}`
}
