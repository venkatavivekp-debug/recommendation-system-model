import { useEffect, useMemo, useState } from 'react'
import BackButton from '../components/BackButton'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import ImageWithFallback from '../components/ImageWithFallback'
import { shareViaEmail } from '../services/api/shareApi'
import {
  addCommunityRecipeReview,
  createCommunityRecipe,
  fetchCommunityRecipes,
  toggleSaveCommunityRecipe,
} from '../services/api/communityApi'
import { normalizeApiError } from '../services/api/client'

function fallbackImage(title) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#34d399"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><rect x="40" y="140" width="560" height="130" rx="20" fill="rgba(8,24,36,0.35)"/><text x="320" y="205" text-anchor="middle" font-size="40" font-family="Outfit, Arial, sans-serif" fill="#fff" font-weight="700">${String(title || 'Recipe').slice(0, 22)}</text><text x="320" y="240" text-anchor="middle" font-size="20" font-family="Outfit, Arial, sans-serif" fill="#ecfeff">Community Favorite</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const initialRecipeForm = {
  title: '',
  ingredients: '',
  steps: '',
  calories: '',
  protein: '',
  carbs: '',
  fats: '',
  fiber: '',
  prepTimeMinutes: '25',
  imageUrl: '',
  youtubeLink: '',
  visibility: 'public',
}

function parseIngredients(input) {
  return String(input || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, amount] = line.split(' - ')
      return {
        name: (name || '').trim(),
        amount: (amount || 'to taste').trim(),
      }
    })
}

function parseSteps(input) {
  return String(input || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatRating(value) {
  if (!value) {
    return 'No ratings yet'
  }

  return `${Number(value).toFixed(1)} / 5`
}

export default function CommunityRecipesPage() {
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [recipeForm, setRecipeForm] = useState(initialRecipeForm)
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [shareDrafts, setShareDrafts] = useState({})

  const loadRecipes = async () => {
    try {
      setLoading(true)
      const data = await fetchCommunityRecipes(50)
      setRecipes(data.recipes || [])
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecipes()
  }, [])

  const orderedRecipes = useMemo(
    () => [...recipes].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)),
    [recipes]
  )

  const handleCreateRecipe = async (event) => {
    event.preventDefault()
    setError('')
    setStatus('')

    try {
      await createCommunityRecipe({
        title: recipeForm.title,
        ingredients: parseIngredients(recipeForm.ingredients),
        steps: parseSteps(recipeForm.steps),
        macros: {
          calories: Number(recipeForm.calories || 0),
          protein: Number(recipeForm.protein || 0),
          carbs: Number(recipeForm.carbs || 0),
          fats: Number(recipeForm.fats || 0),
          fiber: Number(recipeForm.fiber || 0),
        },
        prepTimeMinutes: Number(recipeForm.prepTimeMinutes || 25),
        imageUrl: recipeForm.imageUrl,
        youtubeLink: recipeForm.youtubeLink,
        visibility: recipeForm.visibility,
        whyFitsPlan: 'Created by recommendation-system-model community',
      })

      setRecipeForm(initialRecipeForm)
      setShowCreate(false)
      setStatus('Recipe published to the recommendation-system-model community feed.')
      await loadRecipes()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleSaveRecipe = async (recipeId) => {
    setError('')
    setStatus('')

    try {
      const data = await toggleSaveCommunityRecipe(recipeId)
      setRecipes((prev) =>
        prev.map((item) => (item.id === recipeId ? { ...item, isSaved: data.saved } : item))
      )
      setStatus(data.saved ? 'Recipe saved to your favorites.' : 'Recipe removed from favorites.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleSubmitReview = async (recipeId) => {
    const draft = reviewDrafts[recipeId] || { rating: '5', comment: '' }
    setError('')
    setStatus('')

    try {
      await addCommunityRecipeReview(recipeId, {
        rating: Number(draft.rating || 5),
        comment: draft.comment,
      })
      setReviewDrafts((prev) => ({
        ...prev,
        [recipeId]: { rating: '5', comment: '' },
      }))
      setStatus('Review submitted successfully.')
      await loadRecipes()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleShareViaEmail = async (recipe) => {
    const draft = shareDrafts[recipe.id] || { toEmail: '', message: '' }
    if (!draft.toEmail.trim()) {
      setError('Enter an email to share this recipe.')
      return
    }

    setError('')
    setStatus('')
    try {
      await shareViaEmail({
        toEmail: draft.toEmail.trim(),
        type: 'recipe',
        message: draft.message || '',
        content: {
          title: recipe.title,
          ingredients: recipe.ingredients,
          macros: recipe.macros,
          prepTimeMinutes: recipe.prepTimeMinutes,
          youtubeLink: recipe.youtubeLink,
        },
      })
      setShareDrafts((prev) => ({
        ...prev,
        [recipe.id]: { toEmail: '', message: '' },
      }))
      setStatus('Recipe shared via email.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <BackButton />
        <div className="panel-hero-top">
          <div>
            <h1>recommendation-system-model Community Recipes</h1>
            <p className="muted">
              Discover community meal ideas, share your cooking, and review recipes with macro context.
            </p>
          </div>
          <button className="button button-secondary" onClick={() => setShowCreate((prev) => !prev)}>
            {showCreate ? 'Close Form' : 'Create Recipe'}
          </button>
        </div>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        {showCreate ? (
          <form className="sub-panel form" onSubmit={handleCreateRecipe}>
            <h2>Publish Recipe</h2>
            <FieldInput
              label="Recipe Title"
              required
              value={recipeForm.title}
              onChange={(event) => setRecipeForm((prev) => ({ ...prev, title: event.target.value }))}
            />

            <FieldInput
              label="Ingredients (one per line, format: item - amount)"
              required
              as="textarea"
              rows="4"
              value={recipeForm.ingredients}
              onChange={(event) => setRecipeForm((prev) => ({ ...prev, ingredients: event.target.value }))}
            />

            <FieldInput
              label="Steps (one step per line)"
              required
              as="textarea"
              rows="4"
              value={recipeForm.steps}
              onChange={(event) => setRecipeForm((prev) => ({ ...prev, steps: event.target.value }))}
            />

            <div className="split-three">
              <FieldInput
                label="Calories"
                type="number"
                min="0"
                value={recipeForm.calories}
                onChange={(event) => setRecipeForm((prev) => ({ ...prev, calories: event.target.value }))}
              />
              <FieldInput
                label="Protein"
                type="number"
                min="0"
                value={recipeForm.protein}
                onChange={(event) => setRecipeForm((prev) => ({ ...prev, protein: event.target.value }))}
              />
              <FieldInput
                label="Carbs"
                type="number"
                min="0"
                value={recipeForm.carbs}
                onChange={(event) => setRecipeForm((prev) => ({ ...prev, carbs: event.target.value }))}
              />
            </div>

            <div className="split-three">
              <FieldInput
                label="Fats"
                type="number"
                min="0"
                value={recipeForm.fats}
                onChange={(event) => setRecipeForm((prev) => ({ ...prev, fats: event.target.value }))}
              />
              <FieldInput
                label="Fiber"
                type="number"
                min="0"
                value={recipeForm.fiber}
                onChange={(event) => setRecipeForm((prev) => ({ ...prev, fiber: event.target.value }))}
              />
              <FieldInput
                label="Prep Time (min)"
                type="number"
                min="5"
                max="240"
                value={recipeForm.prepTimeMinutes}
                onChange={(event) =>
                  setRecipeForm((prev) => ({ ...prev, prepTimeMinutes: event.target.value }))
                }
              />
            </div>

            <div className="split-two">
              <FieldInput
                label="Image URL (optional)"
                value={recipeForm.imageUrl}
                onChange={(event) => setRecipeForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
              />
              <FieldInput
                label="YouTube Link (optional)"
                value={recipeForm.youtubeLink}
                onChange={(event) =>
                  setRecipeForm((prev) => ({ ...prev, youtubeLink: event.target.value }))
                }
              />
            </div>

            <FieldInput
              label="Visibility"
              as="select"
              value={recipeForm.visibility}
              onChange={(event) => setRecipeForm((prev) => ({ ...prev, visibility: event.target.value }))}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </FieldInput>

            <button className="button" type="submit">
              Publish Recipe
            </button>
          </form>
        ) : null}

        {loading ? <p className="muted">Loading community recipes...</p> : null}

        {!loading && !orderedRecipes.length ? (
          <EmptyState
            title="No community recipes yet"
            description="Be the first to publish a recommendation-system-model community recipe."
          />
        ) : null}

        <div className="results-list">
          {orderedRecipes.map((recipe) => {
            const draft = reviewDrafts[recipe.id] || { rating: '5', comment: '' }

            return (
              <article key={recipe.id} className="result-card">
                <div className="result-media">
                  <ImageWithFallback
                    src={recipe.imageUrl}
                    fallback={fallbackImage(recipe.title)}
                    alt={recipe.title}
                    className="result-image"
                  />
                  <div className="sub-panel">
                    <h3>{recipe.title}</h3>
                    <p className="muted">
                      By {recipe.createdByName} | {formatRating(recipe.rating)} ({recipe.reviewCount} reviews)
                    </p>
                    <p className="muted">Prep: {recipe.prepTimeMinutes} min</p>
                    <p className="muted">Visibility: {recipe.visibility || 'public'}</p>
                    <p className="muted">
                      {recipe.macros?.calories || 0} kcal | P {recipe.macros?.protein || 0}g | C{' '}
                      {recipe.macros?.carbs || 0}g | F {recipe.macros?.fats || 0}g | Fiber{' '}
                      {recipe.macros?.fiber || 0}g
                    </p>
                    {recipe.allergyWarnings?.length ? (
                      <p className="allergy-warning">⚠️ {recipe.allergyWarnings.join(' | ')}</p>
                    ) : null}
                    <div className="inline-actions">
                      <button
                        className="button button-ghost"
                        type="button"
                        onClick={() => handleSaveRecipe(recipe.id)}
                      >
                        {recipe.isSaved ? 'Saved' : 'Save Recipe'}
                      </button>
                      {recipe.youtubeLink ? (
                        <a className="button button-ghost" href={recipe.youtubeLink} target="_blank" rel="noreferrer">
                          Watch Recipe on YouTube
                        </a>
                      ) : null}
                    </div>
                    <div className="form">
                      <div className="split-two">
                        <FieldInput
                          label="Share Recipe via Email"
                          type="email"
                          placeholder="friend@example.com"
                          value={shareDrafts[recipe.id]?.toEmail || ''}
                          onChange={(event) =>
                            setShareDrafts((prev) => ({
                              ...prev,
                              [recipe.id]: {
                                ...(prev[recipe.id] || { toEmail: '', message: '' }),
                                toEmail: event.target.value,
                              },
                            }))
                          }
                        />
                        <FieldInput
                          label="Optional Message"
                          value={shareDrafts[recipe.id]?.message || ''}
                          onChange={(event) =>
                            setShareDrafts((prev) => ({
                              ...prev,
                              [recipe.id]: {
                                ...(prev[recipe.id] || { toEmail: '', message: '' }),
                                message: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <button className="button button-ghost" type="button" onClick={() => handleShareViaEmail(recipe)}>
                        Share via Email
                      </button>
                    </div>
                  </div>
                </div>

                <p className="ingredients">
                  Ingredients: {(recipe.ingredients || []).map((item) => `${item.amount} ${item.name}`).join(', ')}
                </p>

                {recipe.reviews?.length ? (
                  <div className="recommendation-box">
                    <p className="recommendation-title">Top Review</p>
                    <p>
                      {recipe.reviews[0].rating}/5 by {recipe.reviews[0].userName}: {recipe.reviews[0].comment || 'Great recipe!'}
                    </p>
                  </div>
                ) : null}

                <div className="split-two">
                  <FieldInput
                    label="Your Rating"
                    as="select"
                    value={draft.rating}
                    onChange={(event) =>
                      setReviewDrafts((prev) => ({
                        ...prev,
                        [recipe.id]: {
                          ...(prev[recipe.id] || { rating: '5', comment: '' }),
                          rating: event.target.value,
                        },
                      }))
                    }
                  >
                    <option value="5">5</option>
                    <option value="4">4</option>
                    <option value="3">3</option>
                    <option value="2">2</option>
                    <option value="1">1</option>
                  </FieldInput>

                  <FieldInput
                    label="Comment"
                    value={draft.comment}
                    onChange={(event) =>
                      setReviewDrafts((prev) => ({
                        ...prev,
                        [recipe.id]: {
                          ...(prev[recipe.id] || { rating: '5', comment: '' }),
                          comment: event.target.value,
                        },
                      }))
                    }
                  />
                </div>

                <button className="button" type="button" onClick={() => handleSubmitReview(recipe.id)}>
                  Submit Review
                </button>
              </article>
            )
          })}
        </div>
      </article>
    </section>
  )
}
