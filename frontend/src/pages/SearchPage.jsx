import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import FoodScanPanel from '../components/FoodScanPanel'
import useAuth from '../hooks/useAuth'
import { addMeal } from '../services/api/mealApi'
import { normalizeApiError } from '../services/api/client'
import { searchAnyFood } from '../services/api/foodApi'
import { searchFood } from '../services/api/searchApi'

const ATHENS_FALLBACK = {
  lat: '33.9519',
  lng: '-83.3576',
}

function getDefaultMacro(user) {
  if (user?.preferences?.macroPreference === 'protein') {
    return 'protein'
  }

  if (user?.preferences?.macroPreference === 'carb') {
    return 'carb'
  }

  return ''
}

function getDefaultDiet(user) {
  const diet = user?.preferences?.preferredDiet
  if (!diet || diet === 'non-veg') {
    return ''
  }

  return diet
}

export default function SearchPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [form, setForm] = useState({
    keyword: '',
    lat: ATHENS_FALLBACK.lat,
    lng: ATHENS_FALLBACK.lng,
    radius: '5',
    minCalories: '',
    maxCalories: '',
    macroFocus: getDefaultMacro(user),
    preferredDiet: getDefaultDiet(user),
  })
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [isGlobalSearching, setIsGlobalSearching] = useState(false)
  const [globalResults, setGlobalResults] = useState([])

  const helperText = useMemo(() => {
    const macro = user?.preferences?.macroPreference || 'balanced'
    const cuisine = user?.preferences?.preferredCuisine || 'any cuisine'
    return `Ranking will prioritize your ${macro} macro preference and ${cuisine}.`
  }, [user])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    try {
      setIsSearching(true)

      const payload = {
        keyword: form.keyword,
        lat: Number(form.lat),
        lng: Number(form.lng),
        radius: form.radius ? Number(form.radius) : undefined,
        minCalories: form.minCalories ? Number(form.minCalories) : undefined,
        maxCalories: form.maxCalories ? Number(form.maxCalories) : undefined,
        macroFocus: form.macroFocus || undefined,
        preferredDiet: form.preferredDiet || undefined,
      }

      const data = await searchFood(payload)

      const navigationState = {
        search: data,
        origin: {
          lat: Number(form.lat),
          lng: Number(form.lng),
        },
      }

      sessionStorage.setItem('foodfit_last_search', JSON.stringify(navigationState))
      sessionStorage.setItem('bfit_last_search', JSON.stringify(navigationState))
      navigate('/results', { state: navigationState })
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSearching(false)
    }
  }

  const applyAthensFallback = useCallback((message) => {
    setForm((prev) => ({
      ...prev,
      lat: ATHENS_FALLBACK.lat,
      lng: ATHENS_FALLBACK.lng,
    }))
    if (message) {
      setStatus(message)
    }
  }, [])

  const handleUseMyLocation = useCallback(({ silent = false } = {}) => {
    if (!navigator.geolocation) {
      if (!silent) {
        setError('Geolocation is not available in this browser.')
      }
      applyAthensFallback('Geolocation unavailable. Using Athens, Georgia center coordinates.')
      return
    }

    if (!silent) {
      setError('')
    }
    setIsLocating(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        }))
        setStatus('Using your current location for restaurant ranking and route estimates.')
        setIsLocating(false)
      },
      () => {
        applyAthensFallback('Location permission denied. Using Athens, Georgia center coordinates.')
        if (!silent) {
          setError('Unable to access your location. You can still search using Athens fallback coordinates.')
        }
        setIsLocating(false)
      }
    )
  }, [applyAthensFallback])

  useEffect(() => {
    setStatus('Using Athens, Georgia as default search location. Allow location for more accurate nearby ranking.')

    if (!navigator.geolocation || !navigator.permissions?.query) {
      return
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (result.state === 'granted') {
          handleUseMyLocation({ silent: true })
        }
      })
      .catch(() => {})
  }, [handleUseMyLocation])

  const handleGlobalSearch = async () => {
    setError('')
    setStatus('')

    if (!form.keyword.trim()) {
      setError('Enter a keyword first to search global food data.')
      return
    }

    try {
      setIsGlobalSearching(true)
      const data = await searchAnyFood({ query: form.keyword })
      setGlobalResults(data.results || [])
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsGlobalSearching(false)
    }
  }

  const handleAddGlobalFood = async (item) => {
    setError('')
    setStatus('')

    try {
      await addMeal({
        foodName: item.foodName,
        brand: item.brand || null,
        calories: item.calories || 0,
        protein: item.protein || 0,
        carbs: item.carbs || 0,
        fats: item.fats || 0,
        fiber: item.fiber || 0,
        sourceType: 'grocery',
        source: 'grocery',
        mealType: 'snack',
        ingredients: item.ingredients || [],
        allergyWarnings: item.allergyWarnings || [],
      })
      setStatus(`${item.foodName} added to today's intake.`)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <h1>BFIT Food Intelligence Search</h1>
        <p className="muted">
          Discover nearby restaurants in and around Athens, Georgia, compare nutrition quality, and select the best fit for your goals.
        </p>
        <p className="summary-emphasis">Search any food, ingredient, brand, or meal</p>
        <p className="helper-note">{helperText}</p>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        <FoodScanPanel lat={form.lat} lng={form.lng} radius={form.radius} />

        <div className="sub-panel">
          <h2>Global Food Intelligence Search</h2>
          <p className="muted">
            Lookup branded foods, grocery items, and raw ingredients with allergy-aware nutrition estimates.
          </p>
          <div className="inline-actions">
            <button className="button button-secondary" type="button" onClick={handleGlobalSearch} disabled={isGlobalSearching}>
              {isGlobalSearching ? 'Searching food database...' : 'Search Any Food'}
            </button>
          </div>

          {globalResults.length ? (
            <ul className="activity-list">
              {globalResults.map((item, index) => (
                <li key={`${item.foodName}-${index}`} className="activity-item">
                  <p>
                    <strong>{item.foodName}</strong> {item.brand ? `| ${item.brand}` : ''}
                  </p>
                  <p className="muted">
                    {item.calories} kcal | P {item.protein}g | C {item.carbs}g | F {item.fats}g | Fiber {item.fiber}g
                  </p>
                  <p className="muted">
                    Serving: {item.servingSize} | Source: {item.sourceType}
                  </p>
                  {item.allergyWarnings?.length ? (
                    <p className="allergy-warning">⚠️ {item.allergyWarnings.join(' | ')}</p>
                  ) : null}
                  <button className="button button-ghost" type="button" onClick={() => handleAddGlobalFood(item)}>
                    Add to Today's Intake
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="split-two">
            <FieldInput
              label="Food Keyword"
              required
              type="text"
              placeholder="brownie, salad, pizza"
              value={form.keyword}
              onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
            />

            <FieldInput
              label="Radius (miles, max 20)"
              type="number"
              step="1"
              min="1"
              max="20"
              value={form.radius}
              onChange={(event) => setForm((prev) => ({ ...prev, radius: event.target.value }))}
            />
          </div>

          <div className="split-three">
            <FieldInput
              label="Latitude"
              required
              type="number"
              step="any"
              value={form.lat}
              onChange={(event) => setForm((prev) => ({ ...prev, lat: event.target.value }))}
            />

            <FieldInput
              label="Longitude"
              required
              type="number"
              step="any"
              value={form.lng}
              onChange={(event) => setForm((prev) => ({ ...prev, lng: event.target.value }))}
            />

            <button
              className="button button-ghost button-align-end"
              type="button"
              onClick={() => handleUseMyLocation()}
              disabled={isLocating}
            >
              {isLocating ? 'Locating...' : 'Use Current Location'}
            </button>
          </div>
          <p className="helper-note">
            If location permission is denied, BFIT automatically falls back to Athens, Georgia center coordinates.
          </p>

          <div className="split-three">
            <FieldInput
              label="Min Calories"
              type="number"
              min="0"
              value={form.minCalories}
              onChange={(event) => setForm((prev) => ({ ...prev, minCalories: event.target.value }))}
            />

            <FieldInput
              label="Max Calories"
              type="number"
              min="0"
              value={form.maxCalories}
              onChange={(event) => setForm((prev) => ({ ...prev, maxCalories: event.target.value }))}
            />

            <FieldInput
              label="Macro Focus"
              as="select"
              value={form.macroFocus}
              onChange={(event) => setForm((prev) => ({ ...prev, macroFocus: event.target.value }))}
            >
              <option value="">None</option>
              <option value="protein">Protein-focused</option>
              <option value="carb">Carb-focused</option>
            </FieldInput>
          </div>

          <FieldInput
            label="Diet Preference Filter"
            as="select"
            value={form.preferredDiet}
            onChange={(event) => setForm((prev) => ({ ...prev, preferredDiet: event.target.value }))}
          >
            <option value="">Use profile defaults / all</option>
            <option value="veg">Vegetarian</option>
            <option value="non-veg">Non-Vegetarian</option>
            <option value="vegan">Vegan</option>
          </FieldInput>

          <button className="button" type="submit" disabled={isSearching}>
            {isSearching ? 'Searching nearby options...' : 'Search Nearby Restaurants'}
          </button>
        </form>
      </article>
    </section>
  )
}
