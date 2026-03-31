import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import useAuth from '../hooks/useAuth'
import { normalizeApiError } from '../services/api/client'
import { searchFood } from '../services/api/searchApi'

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
    lat: '40.7484',
    lng: '-73.9857',
    radius: '5',
    minCalories: '',
    maxCalories: '',
    macroFocus: getDefaultMacro(user),
    preferredDiet: getDefaultDiet(user),
  })
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isLocating, setIsLocating] = useState(false)

  const helperText = useMemo(() => {
    const macro = user?.preferences?.macroPreference || 'balanced'
    const cuisine = user?.preferences?.preferredCuisine || 'any cuisine'
    return `Ranking will prioritize your ${macro} macro preference and ${cuisine}.`
  }, [user])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

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
      navigate('/results', { state: navigationState })
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSearching(false)
    }
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.')
      return
    }

    setError('')
    setIsLocating(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        }))
        setIsLocating(false)
      },
      () => {
        setError('Unable to access your location. Enter coordinates manually.')
        setIsLocating(false)
      }
    )
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <h1>Smart Food Search</h1>
        <p className="muted">
          Discover nearby restaurants, compare nutrition quality, and select the best fit for your goals.
        </p>
        <p className="helper-note">{helperText}</p>

        <ErrorAlert message={error} />

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
              onClick={handleUseMyLocation}
              disabled={isLocating}
            >
              {isLocating ? 'Locating...' : 'Use My Location'}
            </button>
          </div>

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
