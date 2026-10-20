import ImageWithFallback from './ImageWithFallback'
import FeedbackActions from './FeedbackActions'
import {
  foodAdaptiveLabel,
  foodInsight,
  foodTags,
  fallbackArtwork,
  matchPercent,
  policyScoreSummary,
} from '../utils/recommendationDisplay'

function nutritionBlocks(nutrition) {
  return [
    { label: 'Calories', value: nutrition.calories },
    { label: 'Protein', value: `${nutrition.protein}g` },
    { label: 'Carbs', value: `${nutrition.carbs}g` },
    { label: 'Fats', value: `${nutrition.fats}g` },
  ]
}

function buildLinks(result) {
  const searchPhrase = `${result.name} ${result.foodName || 'food'}`

  return {
    uberEats:
      result.links?.uberEats || `https://www.ubereats.com/search?q=${encodeURIComponent(searchPhrase)}`,
    doorDash:
      result.links?.doorDash ||
      `https://www.doordash.com/search/store/${encodeURIComponent(searchPhrase)}`,
    directions:
      result.links?.mapsDirections ||
      `https://www.google.com/maps/dir/?api=1&destination=${result.lat},${result.lng}`,
    website:
      result.links?.website ||
      result.websiteUrl ||
      result.mapsUrl ||
      result.websiteSearchUrl ||
      `https://www.google.com/search?q=${encodeURIComponent(`${result.name} restaurant`)}`,
  }
}

export default function SearchResultCard({ result, onFeedback, isTopRecommendation = false }) {
  const restaurantFallback = fallbackArtwork('restaurant')
  const foodFallback = fallbackArtwork('food')
  const links = buildLinks(result)
  const confidence = matchPercent(
    result.recommendation?.confidencePct,
    result.recommendation?.confidence,
    result.recommendation?.score
  )
  const tags = foodTags(result, result.nutrition)
  const adaptiveNote = foodAdaptiveLabel(result, isTopRecommendation, { usePreferenceFactor: true })

  return (
    <article className="result-card">
      <div className="result-media">
        <ImageWithFallback
          src={result.restaurantImage}
          fallback={restaurantFallback}
          alt={`${result.name} restaurant`}
          className="result-image"
        />
        <ImageWithFallback
          src={result.foodImage}
          fallback={foodFallback}
          alt={result.foodName || 'Food item'}
          className="result-image result-image-food"
        />
      </div>

      <header className="result-header">
        <div>
          <div className="badge-row">
            <span className="pill">{result.cuisineType || 'Cuisine not listed'}</span>
            <span className="pill">{result.distance.toFixed(2)} mi away</span>
          </div>
          <h3>{result.name}</h3>
          <p>{result.foodName || 'Suggested meal'}</p>
          <p>{result.address}</p>
          {result.route?.distanceMiles ? (
            <p className="muted">
              Walk: {result.route.walking?.minutes || 0} min | {result.route.walking?.steps || 0} steps | ~
              {result.route.walking?.caloriesBurned || 0} kcal burn
            </p>
          ) : null}
        </div>

        <div className="result-meta">
          <p className="rating-value">{result.rating ? `${result.rating.toFixed(1)} / 5` : 'No rating yet'}</p>
          <p>{(result.userRatingsTotal || 0).toLocaleString()} reviews</p>
        </div>
      </header>

      {result.reviewSnippet ? <p className="review-snippet">"{result.reviewSnippet}"</p> : null}

      <p className="helper-note">Nutrition and ingredients are estimates, not verified menu data.</p>
      {result.recommendation?.bandit?.updateCount > 0 && result.recommendation?.scoreTrace?.adaptivePolicyContribution !== 0 ? <p className="adaptive-note">Updated from your recent choices</p> : null}
      <div className="nutrition-grid">
        {nutritionBlocks(result.nutrition).map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="recommendation-box">
        <div className="badge-row">
          {isTopRecommendation ? <span className="pill">Best Choice</span> : null}
        </div>
        <p className="recommendation-title">Why this option</p>
        <p className="insight-line">{foodInsight(result, result.nutrition, 'Based on nearby activity')}</p>
        {adaptiveNote ? <p className="adaptive-note">{adaptiveNote}</p> : null}
        {tags.length ? (
          <div className="badge-row insight-tags">
            {tags.map((tag) => <span className="pill" key={tag}>{tag}</span>)}
          </div>
        ) : null}
        <p>{result.recommendation?.reason || result.recommendation?.message || 'Balanced option for your current settings.'}</p>
        <div className="confidence-meter" aria-label={`Recommendation fit score ${confidence} out of 100`}>
          <span>Fit score {confidence}/100</span>
          <span className="confidence-track">
            <span className="confidence-fill" style={{ width: `${confidence}%` }} />
          </span>
        </div>
        {result.recommendation?.scoreTrace || result.recommendation?.factors || result.recommendation?.topFeatures?.length ? (
          <details className="score-details">
            <summary>Scoring details</summary>
            {result.recommendation?.scoreTrace ? <p className="muted">{policyScoreSummary(result.recommendation.scoreTrace)}</p> : null}
            {result.recommendation?.factors ? <p className="muted">Protein {Math.round(Number(result.recommendation.factors.proteinMatch || 0) * 100)}% · Calorie {Math.round(Number(result.recommendation.factors.calorieFit || 0) * 100)}% · Preference {Math.round(Number(result.recommendation.factors.preferenceMatch || 0) * 100)}%</p> : null}
            {Array.isArray(result.recommendation?.topFeatures) ? <p className="muted">{result.recommendation.topFeatures.slice(0, 3).map((feature) => typeof feature === 'string' ? feature : feature.name).join(' · ')}</p> : null}
          </details>
        ) : null}
      </div>

      <p className="ingredients">Ingredients: {result.nutrition.ingredients.join(', ')}</p>
      {result.allergyWarnings?.length ? (
        <p className="allergy-warning">⚠️ {result.allergyWarnings.join(' | ')}</p>
      ) : null}

      <div className="actions-grid">
        <a className="button button-ghost" href={links.uberEats} target="_blank" rel="noreferrer">
          Order on Uber Eats
        </a>
        <a className="button button-ghost" href={links.doorDash} target="_blank" rel="noreferrer">
          Order on DoorDash
        </a>
        <a className="button button-ghost" href={links.website} target="_blank" rel="noreferrer">
          View Restaurant
        </a>
        <a className="button button-ghost" href={links.directions} target="_blank" rel="noreferrer">
          Open Directions
        </a>
      </div>
      {onFeedback ? <FeedbackActions actions={['selected', 'save', 'not_interested']} contextType="search" item={result} onFeedback={onFeedback} /> : null}
    </article>
  )
}
