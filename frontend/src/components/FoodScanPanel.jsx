import { useEffect, useMemo, useRef, useState } from 'react'
import ErrorAlert from './ErrorAlert'
import ImageWithFallback from './ImageWithFallback'
import { normalizeApiError } from '../services/api/client'
import { detectFoodFromMedia } from '../services/api/foodApi'
import { addMeal } from '../services/api/mealApi'

function fallbackImage(title, subtitle, tone = 'restaurant') {
  const colorA = tone === 'food' ? '#f59e0b' : '#0ea5e9'
  const colorB = tone === 'food' ? '#facc15' : '#22d3ee'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><circle cx="80" cy="80" r="90" fill="rgba(255,255,255,0.2)"/><circle cx="720" cy="420" r="120" fill="rgba(255,255,255,0.15)"/><rect x="56" y="184" width="688" height="146" rx="20" fill="rgba(14,24,38,0.32)"/><text x="400" y="246" text-anchor="middle" font-size="48" font-family="Outfit, Arial, sans-serif" fill="white" font-weight="700">${String(title || '').slice(0, 24)}</text><text x="400" y="286" text-anchor="middle" font-size="24" font-family="Outfit, Arial, sans-serif" fill="#ecfeff">${String(subtitle || '').slice(0, 34)}</text></svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildRestaurantLinks(option) {
  const searchPhrase = `${option.name || ''} ${option.foodName || ''}`.trim()
  return {
    uberEats:
      option.links?.uberEats || `https://www.ubereats.com/search?q=${encodeURIComponent(searchPhrase)}`,
    doorDash:
      option.links?.doorDash ||
      `https://www.doordash.com/search/store/${encodeURIComponent(searchPhrase)}`,
    website:
      option.links?.website ||
      option.websiteUrl ||
      `https://www.google.com/search?q=${encodeURIComponent(`${option.name} restaurant`)}`,
    directions:
      option.links?.mapsDirections ||
      `https://www.google.com/maps/dir/?api=1&destination=${option.lat},${option.lng}`,
  }
}

export default function FoodScanPanel({ lat, lng, radius }) {
  const fileInputRef = useRef(null)
  const [scanFile, setScanFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [isDetecting, setIsDetecting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!scanFile || !scanFile.type?.startsWith('image/')) {
      setPreviewUrl('')
      return undefined
    }

    const url = URL.createObjectURL(scanFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [scanFile])

  const detection = result?.detection
  const resolution = result?.resolution

  const confidenceLabel = useMemo(() => {
    if (!detection?.confidence && detection?.confidence !== 0) {
      return ''
    }
    return `${Math.round(Number(detection.confidence || 0) * 100)}%`
  }, [detection])

  const handleResetScan = () => {
    setScanFile(null)
    setPreviewUrl('')
    setResult(null)
    setError('')
    setStatus('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDetectFood = async () => {
    setError('')
    setStatus('')
    if (!scanFile) {
      setError('Select an image or video before scanning.')
      return
    }

    try {
      setIsDetecting(true)
      const data = await detectFoodFromMedia({
        file: scanFile,
        lat,
        lng,
        radius,
      })
      setResult(data)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsDetecting(false)
    }
  }

  const handleLogRestaurantMeal = async (option) => {
    setError('')
    setStatus('')
    try {
      await addMeal({
        foodName: option.foodName || detection?.foodName || option.name || 'Restaurant meal',
        calories: option.nutrition?.calories || 0,
        protein: option.nutrition?.protein || 0,
        carbs: option.nutrition?.carbs || 0,
        fats: option.nutrition?.fats || 0,
        fiber: option.nutrition?.fiber || 0,
        sourceType: 'restaurant',
        source: 'restaurant',
        mealType: 'lunch',
        ingredients: option.nutrition?.ingredients || [],
        allergyWarnings: option.allergyWarnings || [],
      })
      setStatus(`${option.foodName || option.name} added to today's intake.`)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleLogRecipeMeal = async (recipe) => {
    setError('')
    setStatus('')
    try {
      await addMeal({
        foodName: recipe.recipeName || detection?.foodName || 'Recipe meal',
        calories: recipe.estimatedMacros?.calories || 0,
        protein: recipe.estimatedMacros?.protein || 0,
        carbs: recipe.estimatedMacros?.carbs || 0,
        fats: recipe.estimatedMacros?.fats || 0,
        fiber: recipe.estimatedMacros?.fiber || 0,
        sourceType: 'recipe',
        source: 'recipe',
        mealType: 'dinner',
        ingredients: (recipe.ingredients || []).map((item) => (typeof item === 'string' ? item : item.name)),
        allergyWarnings: recipe.allergyWarnings || [],
      })
      setStatus(`${recipe.recipeName || 'Recipe'} added to today's intake.`)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  return (
    <article className="sub-panel">
      <h2>Scan Food (AI)</h2>
      <p className="muted">
        Upload a food image or short video clip. BFIT detects the meal and recommends restaurant ordering or a recipe fallback.
      </p>

      <ErrorAlert message={error} />
      {status ? <p className="status-message">{status}</p> : null}

      <div className="form">
        <input
          ref={fileInputRef}
          className="field-control"
          type="file"
          accept="image/*,video/*"
          onChange={(event) => {
            setScanFile(event.target.files?.[0] || null)
            setResult(null)
            setError('')
            setStatus('')
          }}
        />

        {previewUrl ? <img className="scan-preview" src={previewUrl} alt="Selected food preview" /> : null}

        {scanFile && !previewUrl ? (
          <p className="helper-note">
            Selected file: {scanFile.name} ({scanFile.type || 'unknown type'})
          </p>
        ) : null}

        <div className="inline-actions">
          <button className="button button-secondary" type="button" onClick={handleDetectFood} disabled={isDetecting}>
            {isDetecting ? 'Scanning food...' : 'Detect Food from Media'}
          </button>
          <button className="button button-ghost" type="button" onClick={handleResetScan}>
            Start New Scan
          </button>
        </div>
      </div>

      {detection ? (
        <div className="recommendation-box">
          <p className="recommendation-title">Detection Result</p>
          <p>
            Detected: <strong>{detection.foodName}</strong> ({confidenceLabel} confidence)
          </p>
          <p className="muted">
            Source: {detection.sourceType} | Media: {detection.mediaType}
          </p>
          {Array.isArray(detection.candidates) && detection.candidates.length ? (
            <ul className="summary-list">
              {detection.candidates.slice(0, 3).map((candidate, index) => (
                <li key={`${candidate.foodName}-${index}`}>
                  {index + 1}. {candidate.foodName} ({Math.round(Number(candidate.confidence || 0) * 100)}%)
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {resolution?.type === 'restaurant' && Array.isArray(resolution.options) ? (
        <div className="results-list">
          {resolution.options.slice(0, 6).map((option) => {
            const links = buildRestaurantLinks(option)
            const restaurantFallback = fallbackImage(option.name || 'Restaurant', option.cuisineType || 'Cuisine')
            const foodFallback = fallbackImage(option.foodName || detection?.foodName || 'Food', 'AI detected', 'food')
            return (
              <article key={`${option.placeId || option.name}-scan`} className="result-card">
                <div className="result-media">
                  <ImageWithFallback
                    src={option.restaurantImage}
                    fallback={restaurantFallback}
                    alt={`${option.name} restaurant`}
                    className="result-image"
                  />
                  <ImageWithFallback
                    src={option.foodImage}
                    fallback={foodFallback}
                    alt={option.foodName || detection?.foodName || 'Food'}
                    className="result-image result-image-food"
                  />
                </div>
                <h3>{option.name}</h3>
                <p>{option.foodName || detection?.foodName}</p>
                <p className="muted">
                  {option.distance?.toFixed ? option.distance.toFixed(2) : option.distance} mi | {option.cuisineType} | {option.rating || 'N/A'} ★
                </p>
                {option.route?.distanceMiles ? (
                  <p className="muted">
                    Walk {option.route.walking?.minutes || 0} min | {option.route.walking?.steps || 0} steps | ~
                    {option.route.walking?.caloriesBurned || 0} kcal burn
                  </p>
                ) : null}
                <p className="muted">
                  {option.nutrition?.calories || 0} kcal | P {option.nutrition?.protein || 0}g | C {option.nutrition?.carbs || 0}g | F {option.nutrition?.fats || 0}g
                </p>
                {option.recommendation?.reason || option.recommendation?.message ? (
                  <p className="muted">
                    Best Choice for You: {option.recommendation?.reason || option.recommendation?.message} (
                    {Math.round(Number(option.recommendation?.confidencePct || option.recommendation?.score || 0))}%)
                  </p>
                ) : null}
                {option.allergyWarnings?.length ? (
                  <p className="allergy-warning">⚠️ {option.allergyWarnings.join(' | ')}</p>
                ) : null}
                <div className="actions-grid">
                  <a className="button button-ghost" href={links.uberEats} target="_blank" rel="noreferrer">
                    Order on Uber Eats
                  </a>
                  <a className="button button-ghost" href={links.doorDash} target="_blank" rel="noreferrer">
                    Order on DoorDash
                  </a>
                  <a className="button button-ghost" href={links.website} target="_blank" rel="noreferrer">
                    View Restaurant
                  </a>
                  <a className="button button-ghost" href={links.directions} target="_blank" rel="noreferrer">
                    Open Directions
                  </a>
                  <button className="button button-ghost" type="button" onClick={() => handleLogRestaurantMeal(option)}>
                    Add to Today's Intake
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      {resolution?.type === 'recipe' && Array.isArray(resolution.options) ? (
        <ul className="activity-list">
          {resolution.options.map((recipe, index) => (
            <li key={`${recipe.recipeName || detection?.foodName}-recipe-${index}`} className="activity-item">
              <p>
                <strong>{recipe.recipeName}</strong> ({recipe.prepTimeMinutes || 20} min)
              </p>
              <p className="muted">
                {recipe.estimatedMacros?.calories || 0} kcal | P {recipe.estimatedMacros?.protein || 0}g | C {recipe.estimatedMacros?.carbs || 0}g | F {recipe.estimatedMacros?.fats || 0}g | Fiber {recipe.estimatedMacros?.fiber || 0}g
              </p>
              <p className="muted">
                Ingredients:{' '}
                {(recipe.ingredients || [])
                  .map((item) => (typeof item === 'string' ? item : `${item.amount || ''} ${item.name || ''}`.trim()))
                  .join(', ')}
              </p>
              {(recipe.steps || []).length ? (
                <p className="muted">
                  Steps: {(recipe.steps || []).slice(0, 3).join(' ')}
                </p>
              ) : null}
              {recipe.allergyWarnings?.length ? (
                <p className="allergy-warning">⚠️ {recipe.allergyWarnings.join(' | ')}</p>
              ) : null}
              <div className="inline-actions">
                <a className="button button-ghost" href={recipe.youtubeLink} target="_blank" rel="noreferrer">
                  Watch on YouTube
                </a>
                <button className="button button-ghost" type="button" onClick={() => handleLogRecipeMeal(recipe)}>
                  Add to Today's Intake
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
