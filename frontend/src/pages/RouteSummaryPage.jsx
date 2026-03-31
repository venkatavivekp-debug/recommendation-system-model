import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ErrorAlert from '../components/ErrorAlert'
import { normalizeApiError } from '../services/api/client'
import { fetchRouteSummary } from '../services/api/routeApi'

function getStoredSelection() {
  const raw = sessionStorage.getItem('foodfit_selected_result')

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function RouteSummaryPage() {
  const location = useLocation()
  const state = useMemo(() => location.state || getStoredSelection(), [location.state])

  const [mode, setMode] = useState('walking')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  if (!state?.selectedResult || !state?.origin) {
    return (
      <section className="panel">
        <h1>Route Setup Missing</h1>
        <p className="muted">Choose a restaurant from the results page first.</p>
        <Link to="/results">Go to Results</Link>
      </section>
    )
  }

  const { selectedResult } = state

  const handleCalculate = async () => {
    setError('')

    try {
      const data = await fetchRouteSummary({
        originLat: state.origin.lat,
        originLng: state.origin.lng,
        destinationLat: selectedResult.lat,
        destinationLng: selectedResult.lng,
        mode,
        consumedCalories: selectedResult.nutrition.calories,
      })

      setSummary(data)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  return (
    <section className="page-grid route-grid">
      <article className="panel">
        <h1>{selectedResult.name}</h1>
        <p className="muted">{selectedResult.address}</p>

        <h3>Nutrition Breakdown</h3>
        <ul className="summary-list">
          <li>Calories: {selectedResult.nutrition.calories}</li>
          <li>Protein: {selectedResult.nutrition.protein}g</li>
          <li>Carbs: {selectedResult.nutrition.carbs}g</li>
          <li>Fats: {selectedResult.nutrition.fats}g</li>
        </ul>

        <h3>Travel Mode</h3>
        <div className="mode-row">
          {['walking', 'running', 'driving'].map((option) => (
            <label key={option} className="chip">
              <input
                type="radio"
                name="mode"
                value={option}
                checked={mode === option}
                onChange={(event) => setMode(event.target.value)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>

        <button className="button" type="button" onClick={handleCalculate}>
          Calculate Route + Burn
        </button>

        <ErrorAlert message={error} />
      </article>

      <article className="panel">
        <h2>Calories Balance</h2>
        {!summary ? <p className="muted">Calculate route to see distance, duration, and burn summary.</p> : null}

        {summary ? (
          <>
            <ul className="summary-list">
              <li>Source: {summary.source}</li>
              <li>Mode: {summary.mode}</li>
              <li>Distance: {summary.distance.text}</li>
              <li>Duration: {summary.duration.text}</li>
              <li>Calories Burned: {summary.caloriesBurned}</li>
              <li>Calories Consumed: {summary.consumedCalories}</li>
              <li>Balance (consumed - burned): {summary.calorieBalance}</li>
            </ul>

            <p className="status-message">
              {summary.calorieBalance > 0
                ? `Net intake is ${summary.calorieBalance} kcal. Add activity to balance it.`
                : 'Great balance. Calories burned matched or exceeded intake.'}
            </p>
          </>
        ) : null}
      </article>
    </section>
  )
}
