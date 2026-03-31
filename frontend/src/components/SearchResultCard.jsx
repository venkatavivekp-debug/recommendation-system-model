export default function SearchResultCard({ result, onSelect }) {
  return (
    <article className="result-card">
      <header className="result-header">
        <div>
          <h3>{result.name}</h3>
          <p>{result.address}</p>
        </div>
        <div className="result-meta">
          <span>{result.distance.toFixed(2)} mi</span>
          <span>Rating: {result.rating ?? 'N/A'}</span>
        </div>
      </header>

      <div className="nutrition-grid">
        <div>
          <strong>{result.nutrition.calories}</strong>
          <span>Calories</span>
        </div>
        <div>
          <strong>{result.nutrition.protein}g</strong>
          <span>Protein</span>
        </div>
        <div>
          <strong>{result.nutrition.carbs}g</strong>
          <span>Carbs</span>
        </div>
        <div>
          <strong>{result.nutrition.fats}g</strong>
          <span>Fats</span>
        </div>
      </div>

      <p className="ingredients">Ingredients: {result.nutrition.ingredients.join(', ')}</p>

      <button className="button" onClick={() => onSelect(result)}>
        Select Restaurant
      </button>
    </article>
  )
}
