import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SearchResultCard from '../components/SearchResultCard'

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

export default function ResultsPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const state = useMemo(() => location.state || getStoredSearchState(), [location.state])

  if (!state?.search) {
    return (
      <section className="panel">
        <h1>No Search Results</h1>
        <p className="muted">Start a search first to view restaurants and nutrition data.</p>
        <Link to="/search">Go to Search</Link>
      </section>
    )
  }

  const handleSelect = (result) => {
    const routeState = {
      selectedResult: result,
      origin: state.origin,
    }

    sessionStorage.setItem('foodfit_selected_result', JSON.stringify(routeState))
    navigate('/route-summary', { state: routeState })
  }

  return (
    <section className="page-grid single">
      <article className="panel">
        <h1>Results for {state.search.keyword}</h1>
        <p className="muted">
          Found {state.search.count} restaurants within {state.search.radius} miles.
        </p>

        <div className="results-list">
          {state.search.results.map((result) => (
            <SearchResultCard key={result.placeId} result={result} onSelect={handleSelect} />
          ))}
        </div>
      </article>
    </section>
  )
}
