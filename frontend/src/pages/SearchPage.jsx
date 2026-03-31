import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import { normalizeApiError } from '../services/api/client'
import { searchFood } from '../services/api/searchApi'

const initialForm = {
  keyword: '',
  lat: '40.7484',
  lng: '-73.9857',
  radius: '5',
  minCalories: '',
  maxCalories: '',
  macroFocus: '',
}

export default function SearchPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)

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

  return (
    <section className="page-grid single">
      <article className="panel">
        <h1>Food Search</h1>
        <p className="muted">Find nearby restaurants and apply nutrition filters before choosing your route.</p>

        <ErrorAlert message={error} />

        <form className="form" onSubmit={handleSubmit}>
          <FieldInput
            label="Food Keyword"
            required
            type="text"
            placeholder="brownie"
            value={form.keyword}
            onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
          />

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

          <button className="button" type="submit" disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Search Nearby'}
          </button>
        </form>
      </article>
    </section>
  )
}
