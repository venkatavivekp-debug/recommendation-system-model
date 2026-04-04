import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import { createActivity } from '../services/api/activityApi'
import { normalizeApiError } from '../services/api/client'
import { fetchRouteSummary } from '../services/api/routeApi'

function getStoredSelection() {
  const raw =
    sessionStorage.getItem('contextfit_selected_result') ||
    sessionStorage.getItem('bfit_selected_result') ||
    sessionStorage.getItem('foodfit_selected_result')

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function formatMode(mode) {
  return String(mode || '').charAt(0).toUpperCase() + String(mode || '').slice(1)
}

export default function RouteSummaryPage() {
  const location = useLocation()
  const state = useMemo(() => location.state || getStoredSelection(), [location.state])

  const [mode, setMode] = useState('walking')
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!state?.selectedResult || !state?.origin) {
    return (
      <section className="page-grid single">
        <EmptyState
          title="Route Setup Missing"
          description="Choose a restaurant from the results page first."
          actionLabel="Go to Results"
          actionTo="/results"
        />
      </section>
    )
  }

  const { selectedResult } = state
  const directionsLink = `https://www.google.com/maps/dir/?api=1&destination=${selectedResult.lat},${selectedResult.lng}`

  const handleCalculate = async () => {
    setError('')
    setSaveMessage('')
    setIsSubmitting(true)

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

      try {
        await createActivity({
          foodName: selectedResult.foodName || 'Selected food',
          restaurantName: selectedResult.name,
          restaurantAddress: selectedResult.address,
          caloriesConsumed: selectedResult.nutrition.calories,
          caloriesBurned: data.caloriesBurned,
          distanceMiles: data.distance.miles,
          travelMode: mode,
          recommendationMessage: selectedResult.recommendation?.message || '',
          nutrition: selectedResult.nutrition,
        })
        setSaveMessage('Activity saved to history and dashboard.')
      } catch (saveError) {
        setSaveMessage(`Route calculated, but activity save failed: ${normalizeApiError(saveError)}`)
      }
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page-grid route-grid">
      <article className="panel">
        <h1>ContextFit Route Summary: {selectedResult.name}</h1>
        <p className="muted">{selectedResult.address}</p>

        <div className="badge-row">
          <span className="pill">{selectedResult.distance.toFixed(2)} mi away</span>
          <span className="pill">{selectedResult.cuisineType || 'Cuisine'}</span>
          <span className="pill">{selectedResult.rating ? `${selectedResult.rating}/5 rating` : 'No rating'}</span>
        </div>

        <h3>Nutrition Breakdown</h3>
        <ul className="summary-list">
          <li>Food: {selectedResult.foodName || 'Selected food item'}</li>
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
              <span>{formatMode(option)}</span>
            </label>
          ))}
        </div>

        <button className="button" type="button" onClick={handleCalculate} disabled={isSubmitting}>
          {isSubmitting ? 'Calculating...' : 'Calculate Route + Save Activity'}
        </button>

        <a className="button button-ghost" href={directionsLink} target="_blank" rel="noreferrer">
          Open Directions
        </a>

        <ErrorAlert message={error} />
        {saveMessage ? <p className="status-message">{saveMessage}</p> : null}
      </article>

      <article className="panel">
        <h2>Calories Balance Summary</h2>

        {!summary ? <p className="muted">Calculate route to see duration, burn, and offset suggestions.</p> : null}

        {summary ? (
          <>
            <ul className="summary-list">
              <li>Route source: {summary.source}</li>
              <li>Mode: {formatMode(summary.mode)}</li>
              <li>Distance: {summary.distance.text}</li>
              <li>Duration: {summary.duration.text}</li>
              <li>Calories burned: {summary.caloriesBurned}</li>
              <li>Calories consumed: {summary.consumedCalories}</li>
              <li>Net (consumed - burned): {summary.calorieBalance}</li>
            </ul>

            {summary.offsetSuggestion ? (
              <div className="recommendation-box">
                <p className="recommendation-title">Offset Suggestion</p>
                <p>
                  To offset this meal, aim for about {summary.offsetSuggestion.walkingMiles} miles of
                  walking or {summary.offsetSuggestion.runningMiles} miles of running.
                </p>
              </div>
            ) : null}

            <p className="status-message">
              {summary.calorieBalance > 0
                ? `Net intake is ${summary.calorieBalance} kcal. Consider extra walking/running to close the gap.`
                : 'Great balance. Calories burned matched or exceeded intake for this selection.'}
            </p>
          </>
        ) : null}

        <div className="inline-actions">
          <Link className="button button-ghost" to="/history">
            View Full History
          </Link>
          <Link className="button button-secondary" to="/dashboard">
            Go to Dashboard
          </Link>
        </div>
      </article>
    </section>
  )
}
