import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import SearchResultCard from '../components/SearchResultCard'
import { addMeal } from '../services/api/mealApi'
import { normalizeApiError } from '../services/api/client'

function getStoredSearchState() {
  const raw = sessionStorage.getItem('foodfit_last_search')

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function buildPreferenceSummary(context) {
  if (!context) {
    return 'Ranking uses distance and nutrition quality.'
  }

  const parts = [
    `Diet: ${context.preferredDiet || 'balanced'}`,
    `Macro: ${context.macroPreference || 'balanced'}`,
    `Cuisine: ${context.preferredCuisine || 'not specified'}`,
    `Fitness goal: ${context.fitnessGoal || 'maintain'}`,
  ]

  return parts.join(' | ')
}

export default function ResultsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = useMemo(() => location.state || getStoredSearchState(), [location.state])
  const [mealError, setMealError] = useState('')
  const [mealSuccess, setMealSuccess] = useState('')
  const [addingMealId, setAddingMealId] = useState('')

  if (!state?.search) {
    return (
      <section className="page-grid single">
        <EmptyState
          title="No Search Results Yet"
          description="Run a search first to view nearby restaurants with nutrition and recommendation signals."
          actionLabel="Go to Search"
          actionTo="/search"
        />
      </section>
    )
  }

  const search = state.search
  const contextSummary = buildPreferenceSummary(search.userPreferenceContext)

  const handleSelect = (result) => {
    const routeState = {
      selectedResult: result,
      origin: state.origin,
    }

    sessionStorage.setItem('foodfit_selected_result', JSON.stringify(routeState))
    navigate('/route-summary', { state: routeState })
  }

  const handleAddMeal = async (result) => {
    setMealError('')
    setMealSuccess('')
    setAddingMealId(result.placeId)

    try {
      await addMeal({
        foodName: result.foodName || search.keyword,
        calories: result.nutrition.calories,
        protein: result.nutrition.protein,
        carbs: result.nutrition.carbs,
        fats: result.nutrition.fats,
        fiber: result.nutrition.ingredients?.length ? Math.min(18, result.nutrition.ingredients.length * 1.4) : 4,
        source: 'restaurant',
        timestamp: new Date().toISOString(),
      })
      setMealSuccess(`${result.foodName || search.keyword} added to today's meal intake.`)
    } catch (apiError) {
      setMealError(normalizeApiError(apiError))
    } finally {
      setAddingMealId('')
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel">
        <h1>Results for {search.keyword}</h1>
        <p className="muted">
          {search.count} restaurants within {search.radius} miles, ordered by recommendation quality.
        </p>
        <p className="helper-note">{contextSummary}</p>
        <ErrorAlert message={mealError} />
        {mealSuccess ? <p className="status-message">{mealSuccess}</p> : null}

        {search.results.length === 0 ? (
          <EmptyState
            title="No Matches Found"
            description="Try increasing radius, relaxing filters, or using a broader keyword."
            actionLabel="Back to Search"
            actionTo="/search"
          />
        ) : (
          <div className="results-list">
            {search.results.map((result) => (
              <SearchResultCard
                key={result.placeId}
                result={result}
                onSelect={handleSelect}
                onAddMeal={handleAddMeal}
                isAddingMeal={addingMealId === result.placeId}
              />
            ))}
          </div>
        )}
      </article>
    </section>
  )
}
