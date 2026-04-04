import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import MovieRecommendationCard from '../components/MovieRecommendationCard'
import SongRecommendationCard from '../components/SongRecommendationCard'
import SearchResultCard from '../components/SearchResultCard'
import { sendContentFeedback } from '../services/api/contentApi'
import { normalizeApiError } from '../services/api/client'

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
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

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
  const whileEatingContent = search.contentSuggestions?.whileEating?.recommendations || []
  const walkingMusicContent = search.contentSuggestions?.walkingMusic?.recommendations || []

  const handleContentFeedback = async (item, action, contextType) => {
    try {
      await sendContentFeedback({
        itemId: item.id,
        title: item.title,
        contentType: item.type,
        contextType,
        action,
        score: item.score,
        confidence: item.confidence,
        reason: item.reason,
        features: item.features,
      })
      setError('')
      setStatus(
        action === 'not_interested'
          ? 'Preference updated. BFIT will avoid similar suggestions.'
          : 'Feedback saved. Recommendations will improve over time.'
      )
    } catch (apiError) {
      setStatus('')
      setError(normalizeApiError(apiError))
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel">
        <h1>BFIT Results for {search.keyword}</h1>
        <p className="muted">
          {search.count} restaurants within {search.radius} miles, ordered by recommendation quality.
        </p>
        {search.searchLocation?.label ? (
          <p className="helper-note">
            {search.searchLocation.label} ({Number(search.searchLocation.lat).toFixed(4)},{' '}
            {Number(search.searchLocation.lng).toFixed(4)})
          </p>
        ) : null}
        <p className="helper-note">{contextSummary}</p>
        {error ? <p className="alert alert-error">{error}</p> : null}
        {status ? <p className="status-message">{status}</p> : null}

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

        {whileEatingContent.length ? (
          <section className="sub-panel">
            <h2>Suggested While Eating</h2>
            <div className="content-reco-grid">
              {whileEatingContent.slice(0, 3).map((item) => (
                <MovieRecommendationCard
                  key={`results-eating-${item.id}`}
                  item={item}
                  onFeedback={(contentItem, action) =>
                    handleContentFeedback(contentItem, action, 'eat_out')
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {walkingMusicContent.length ? (
          <section className="sub-panel">
            <h2>Suggested Music for Your Walk</h2>
            <div className="content-reco-grid">
              {walkingMusicContent.slice(0, 3).map((item) => (
                <SongRecommendationCard
                  key={`results-walk-${item.id}`}
                  item={item}
                  titlePrefix="Walking Audio Pick"
                  onFeedback={(contentItem, action) =>
                    handleContentFeedback(contentItem, action, 'walking')
                  }
                />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </section>
  )
}
