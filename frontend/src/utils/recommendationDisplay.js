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
