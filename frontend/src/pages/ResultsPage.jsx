import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import SearchResultCard from '../components/SearchResultCard'

function getStoredSearchState() {
  const raw = sessionStorage.getItem('bfit_last_search') || sessionStorage.getItem('foodfit_last_search')

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
  const location = useLocation()
  const state = useMemo(() => location.state || getStoredSearchState(), [location.state])

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

  return (
    <section className="page-grid single">
      <article className="panel">
        <h1>BFIT Results for {search.keyword}</h1>
        <p className="muted">
          {search.count} restaurants within {search.radius} miles, ordered by recommendation quality.
        </p>
        <p className="helper-note">{contextSummary}</p>

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
              <SearchResultCard key={result.placeId} result={result} />
            ))}
          </div>
        )}
      </article>
    </section>
  )
}
