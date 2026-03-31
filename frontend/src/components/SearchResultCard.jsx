import ImageWithFallback from './ImageWithFallback'

function fallbackImage(title, subtitle, tone = 'restaurant') {
  const colorA = tone === 'food' ? '#f59e0b' : '#0ea5e9'
  const colorB = tone === 'food' ? '#facc15' : '#22d3ee'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><circle cx="80" cy="80" r="90" fill="rgba(255,255,255,0.2)"/><circle cx="720" cy="420" r="120" fill="rgba(255,255,255,0.15)"/><rect x="56" y="184" width="688" height="146" rx="20" fill="rgba(14,24,38,0.32)"/><text x="400" y="246" text-anchor="middle" font-size="48" font-family="Outfit, Arial, sans-serif" fill="white" font-weight="700">${String(title || '').slice(0, 24)}</text><text x="400" y="286" text-anchor="middle" font-size="24" font-family="Outfit, Arial, sans-serif" fill="#ecfeff">${String(subtitle || '').slice(0, 34)}</text></svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function nutritionBlocks(nutrition) {
  return [
    { label: 'Calories', value: nutrition.calories },
    { label: 'Protein', value: `${nutrition.protein}g` },
    { label: 'Carbs', value: `${nutrition.carbs}g` },
    { label: 'Fats', value: `${nutrition.fats}g` },
  ]
}

export default function SearchResultCard({ result, onSelect }) {
  const restaurantFallback = fallbackImage(result.name || 'Restaurant', result.cuisineType || 'Cuisine')
  const foodFallback = fallbackImage(result.foodName || 'Food Item', 'Nutrition Ready', 'food')

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
          <p>{result.address}</p>
        </div>

        <div className="result-meta">
          <p className="rating-value">{result.rating ? `${result.rating.toFixed(1)} / 5` : 'No rating yet'}</p>
          <p>{(result.userRatingsTotal || 0).toLocaleString()} reviews</p>
        </div>
      </header>

      {result.reviewSnippet ? <p className="review-snippet">"{result.reviewSnippet}"</p> : null}

      <div className="nutrition-grid">
        {nutritionBlocks(result.nutrition).map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="recommendation-box">
        <p className="recommendation-title">Recommendation</p>
        <p>{result.recommendation?.message || 'Balanced option for your current settings.'}</p>
      </div>

      <p className="ingredients">Ingredients: {result.nutrition.ingredients.join(', ')}</p>

      <button className="button" onClick={() => onSelect(result)}>
        Select and Plan Route
      </button>
    </article>
  )
}
