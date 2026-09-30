import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import EmptyState from '../components/EmptyState'
import MovieRecommendationCard from '../components/MovieRecommendationCard'
import SongRecommendationCard from '../components/SongRecommendationCard'
import SearchResultCard from '../components/SearchResultCard'
import { saveContentForLater, sendContentFeedback } from '../services/api/contentApi'
import { sendFoodFeedback } from '../services/api/foodApi'
import { normalizeApiError } from '../services/api/client'
import { getSessionItem, setSessionItem } from '../utils/storage'
import { searchFood } from '../services/api/searchApi'

function getStoredSearchState() {
  const raw =
    getSessionItem('contextfit_last_search') ||
    getSessionItem('bfit_last_search') ||
    getSessionItem('foodfit_last_search')

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
  const navigate = useNavigate()
  const state = useMemo(() => location.state || getStoredSearchState(), [location.state])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [hiddenResultIds, setHiddenResultIds] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const requests = useRef({ page: 0, refresh: 0 })

  useEffect(() => () => {
    requests.current.page += 1
    requests.current.refresh += 1
  }, [location.pathname])

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
  const visibleResults = (search.results || []).filter(
    (result) => !hiddenResultIds.includes(result.placeId || result.id || result.name)
  )
  const contextSummary = buildPreferenceSummary(search.userPreferenceContext)
  const whileEatingContent = search.contentSuggestions?.whileEating?.recommendations || []
  const walkingMusicContent = search.contentSuggestions?.walkingMusic?.recommendations || []

  const refreshResults = async () => {
    const request = ++requests.current.refresh
    setRefreshing(true)
    setError('')
    try {
      const updated = { ...state, search: await searchFood(state.request) }
      if (request !== requests.current.refresh) return
      setSessionItem('contextfit_last_search', JSON.stringify(updated))
      navigate('/results', { state: updated, replace: true })
      setHiddenResultIds([])
      setStatus('Recommendations refreshed using your saved feedback.')
    } catch (apiError) {
      if (request !== requests.current.refresh) return
      setError(normalizeApiError(apiError))
    } finally {
      if (request === requests.current.refresh) setRefreshing(false)
    }
  }

  const handleFoodFeedback = async (result, action) => {
    const page = requests.current.page
    try {
      await sendFoodFeedback({
        itemId: result.placeId || result.id || result.name,
        itemName: result.foodName || result.name,
        restaurantName: result.name,
        foodName: result.foodName,
        cuisineType: result.cuisineType,
        sourceType: result.sourceType,
        action,
        contextType: 'search',
        mode: 'search',
        rank: result.recommendation?.rank,
        score: result.recommendation?.score,
        confidence: result.recommendation?.confidence,
        features: result.recommendation?.features || result.recommendation?.factors || {},
        reason: result.recommendation?.reason || result.recommendation?.message,
      })

      if (page !== requests.current.page) return

      if (action === 'not_interested') {
        setHiddenResultIds((prev) => [...prev, result.placeId || result.id || result.name])
      }

      setError('')
      setStatus(
        action === 'not_interested'
          ? 'Preference saved. This restaurant will be excluded from your next recommendations.'
          : 'Feedback saved. Food recommendations will adapt on future searches.'
      )
      if (action === 'not_interested' && state.request) await refreshResults()
    } catch (apiError) {
      if (page !== requests.current.page) return
      setStatus('')
      setError(normalizeApiError(apiError))
    }
  }

  const handleContentFeedback = async (item, action, contextType) => {
    try {
      if (action === 'save') {
        await saveContentForLater({
          itemId: item.id,
          title: item.title,
          contentType: item.type,
          artist: item.artist,
          genre: item.genre,
          mood: item.mood,
          reason: item.reason,
          confidence: item.confidence,
          confidencePct: item.confidencePct,
          sourceUrl: item.sourceUrl,
          contextType,
          features: item.features,
        })
        setError('')
        setStatus('Saved for later.')
        return
      }

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
          ? 'Preference updated. recommendation-system-model will avoid similar suggestions.'
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
        <BackButton to="/search" />
        <h1>recommendation-system-model Results for {search.keyword}</h1>
        <p className="muted">
          {visibleResults.length} restaurants within {search.radius} miles, ordered by recommendation quality.
        </p>
        {search.searchLocation?.label ? (
          <p className="helper-note">
            {search.searchLocation.label} ({Number(search.searchLocation.lat).toFixed(4)},{' '}
            {Number(search.searchLocation.lng).toFixed(4)})
          </p>
        ) : null}
        <p className="helper-note">{contextSummary}</p>
        {search.candidateSource ? (
          <p className="helper-note">
            {search.candidateSource.fallback ? 'Local demo restaurant catalog (external data unavailable or disabled).' : search.candidateSource.provider === 'osm' ? 'Place data: OpenStreetMap contributors. Menu availability is not verified.' : 'Place data: Google Places.'}
            {search.candidateSource.provider === 'osm' ? <> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap attribution</a></> : null}
          </p>
        ) : null}
        {state.request ? <button className="button button-secondary" type="button" onClick={refreshResults} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Refresh Recommendations'}</button> : null}
        {search.filterRelaxed ? (
          <p className="helper-note">
            No restaurants matched all nutrition filters exactly, so nearby realistic options are shown instead.
          </p>
        ) : null}
        {error ? <p className="alert alert-error">{error}</p> : null}
        {status ? <p className="status-message">{status}</p> : null}

        {visibleResults.length === 0 ? (
          <EmptyState
            title="No Matches Found"
            description="Try increasing radius, relaxing filters, or using a broader keyword."
            actionLabel="Back to Search"
            actionTo="/search"
          />
        ) : (
          <div className="results-list">
            {visibleResults.map((result, index) => (
              <SearchResultCard
                key={result.placeId}
                result={result}
                onFeedback={handleFoodFeedback}
                isTopRecommendation={index === 0}
              />
            ))}
          </div>
        )}

        {whileEatingContent.length ? (
          <section className="sub-panel">
            <h2>Suggested While Eating</h2>
            <div className="content-reco-grid">
              {whileEatingContent.slice(0, 3).map((item, index) => (
                <MovieRecommendationCard
                  key={`results-eating-${item.id}`}
                  item={item}
                  isTopRecommendation={index === 0}
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
              {walkingMusicContent.slice(0, 3).map((item, index) => (
                <SongRecommendationCard
                  key={`results-walk-${item.id}`}
                  item={item}
                  titlePrefix="Walking Audio Pick"
                  isTopRecommendation={index === 0}
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
