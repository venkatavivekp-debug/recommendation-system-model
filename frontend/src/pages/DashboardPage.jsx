import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CalendarMonthView from '../components/CalendarMonthView'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import ImageWithFallback from '../components/ImageWithFallback'
import MetricCard from '../components/MetricCard'
import {
  fetchCalendarDay,
  fetchCalendarHistory,
  fetchUpcomingPlans,
  saveCalendarPlan,
} from '../services/api/calendarApi'
import { fetchDashboardSummary } from '../services/api/dashboardApi'
import { buildMealPlan } from '../services/api/mealBuilderApi'
import { addMeal } from '../services/api/mealApi'
import { fetchProfile, updateProfile } from '../services/api/profileApi'
import { normalizeApiError } from '../services/api/client'

function todayDateKey() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso) {
  if (!iso) {
    return ''
  }

  return new Date(iso).toLocaleString()
}

function isFutureDate(dateKey) {
  return dateKey > todayDateKey()
}

function toMonthDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function macroProgress(consumed, target) {
  const safeConsumed = Number(consumed || 0)
  const safeTarget = Number(target || 0)
  return `${safeConsumed.toFixed(1)} / ${safeTarget.toFixed(1)} g`
}

function parseIngredientList(input) {
  return String(input || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function fallbackImage(title, subtitle, tone = 'restaurant') {
  const colorA = tone === 'food' ? '#f59e0b' : '#0ea5e9'
  const colorB = tone === 'food' ? '#facc15' : '#22d3ee'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><circle cx="80" cy="80" r="90" fill="rgba(255,255,255,0.2)"/><circle cx="720" cy="420" r="120" fill="rgba(255,255,255,0.15)"/><rect x="56" y="184" width="688" height="146" rx="20" fill="rgba(14,24,38,0.32)"/><text x="400" y="246" text-anchor="middle" font-size="48" font-family="Outfit, Arial, sans-serif" fill="white" font-weight="700">${String(title || '').slice(0, 24)}</text><text x="400" y="286" text-anchor="middle" font-size="24" font-family="Outfit, Arial, sans-serif" fill="#ecfeff">${String(subtitle || '').slice(0, 34)}</text></svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function ingredientLine(item) {
  if (!item) {
    return ''
  }

  if (typeof item === 'string') {
    return item
  }

  const amount = item.amount || item.quantity || ''
  return amount ? `${amount} ${item.name}` : item.name
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null)
  const [calendarHistory, setCalendarHistory] = useState([])
  const [upcomingPlans, setUpcomingPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [selectedDate, setSelectedDate] = useState(todayDateKey())
  const [selectedDay, setSelectedDay] = useState(null)
  const [isDayLoading, setIsDayLoading] = useState(false)
  const [activeMonth, setActiveMonth] = useState(toMonthDate(todayDateKey()))

  const [plannedCalories, setPlannedCalories] = useState('')
  const [planNote, setPlanNote] = useState('')
  const [isCheatDay, setIsCheatDay] = useState(false)
  const [isSavingPlan, setIsSavingPlan] = useState(false)

  const [mealPlanMode, setMealPlanMode] = useState('eat-out')
  const [eatOutMode, setEatOutMode] = useState('delivery')
  const [eatInMode, setEatInMode] = useState('have')
  const [homeIngredientsInput, setHomeIngredientsInput] = useState('')
  const [generatedMealPlans, setGeneratedMealPlans] = useState([])
  const [isGeneratingMealPlan, setIsGeneratingMealPlan] = useState(false)

  const loadDashboard = useCallback(async () => {
    const data = await fetchDashboardSummary()
    setDashboard(data)
  }, [])

  const loadCalendarMeta = useCallback(async () => {
    const [history, upcoming] = await Promise.all([
      fetchCalendarHistory(4),
      fetchUpcomingPlans(),
    ])

    setCalendarHistory(history.days || [])
    setUpcomingPlans(upcoming.plans || [])
  }, [])

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true)
      await Promise.all([loadDashboard(), loadCalendarMeta()])
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setLoading(false)
    }
  }, [loadCalendarMeta, loadDashboard])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  useEffect(() => {
    const loadDay = async () => {
      try {
        setIsDayLoading(true)
        const data = await fetchCalendarDay(selectedDate)
        setSelectedDay(data)
        setPlannedCalories(data?.plan?.plannedCalories ? String(data.plan.plannedCalories) : '')
        setPlanNote(data?.plan?.note || '')
        setIsCheatDay(Boolean(data?.plan?.isCheatDay))
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      } finally {
        setIsDayLoading(false)
      }
    }

    if (selectedDate) {
      loadDay()
    }
  }, [selectedDate])

  const today = dashboard?.today
  const recommendation = dashboard?.recommendedForRemainingDay
  const mealBuilderSuggestions = recommendation?.mealBuilder || []
  const recipeSuggestions = recommendation?.recipes || []
  const ingredientDrivenPlans = generatedMealPlans.length ? generatedMealPlans : mealBuilderSuggestions

  const marksByDate = useMemo(() => {
    const map = {}

    calendarHistory.forEach((day) => {
      map[day.date] = {
        ...(map[day.date] || {}),
        hasHistory: true,
        hasPlan: Boolean(day.plannedCalories),
        isCheatDay: Boolean(day.isCheatDay),
      }
    })

    upcomingPlans.forEach((plan) => {
      map[plan.date] = {
        ...(map[plan.date] || {}),
        hasPlan: true,
        isCheatDay: Boolean(plan.isCheatDay || Number(plan.expectedExtraCalories || 0) > 0),
      }
    })

    const todayKey = todayDateKey()
    map[todayKey] = {
      ...(map[todayKey] || {}),
      isToday: true,
    }

    return map
  }, [calendarHistory, upcomingPlans])

  const topRestaurantOptions = useMemo(
    () => (recommendation?.restaurantOptions || []).slice(0, 5),
    [recommendation]
  )

  const handleDateSelect = (dateKey) => {
    setSelectedDate(dateKey)
    setActiveMonth(toMonthDate(dateKey))
  }

  const handleMonthChange = (delta) => {
    setActiveMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const handleSavePlan = async () => {
    setError('')
    setStatus('')

    if (!selectedDate || !plannedCalories) {
      setError('Choose a date and planned calories first.')
      return
    }

    try {
      setIsSavingPlan(true)
      const data = await saveCalendarPlan({
        date: selectedDate,
        plannedCalories: Number(plannedCalories),
        isCheatDay,
        note: planNote,
      })

      setStatus(data.recommendation?.message || 'Plan saved.')
      await Promise.all([loadDashboard(), loadCalendarMeta()])
      const dayData = await fetchCalendarDay(selectedDate)
      setSelectedDay(dayData)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSavingPlan(false)
    }
  }

  const handleAddSuggestionAsMeal = async (suggestion) => {
    setError('')
    setStatus('')

    try {
      await addMeal({
        foodName: suggestion.recipe?.recipeName || suggestion.ingredients?.map((item) => item.name).join(' + '),
        calories: suggestion.macroTotals?.calories || 0,
        protein: suggestion.macroTotals?.protein || 0,
        carbs: suggestion.macroTotals?.carbs || 0,
        fats: suggestion.macroTotals?.fats || 0,
        fiber: suggestion.macroTotals?.fiber || 0,
        sourceType: 'recipe',
        source: 'recipe',
        mealType: 'dinner',
        ingredients: (suggestion.ingredients || []).map((item) => item.name),
        allergyWarnings: suggestion.allergyWarnings || [],
      })

      setStatus('Meal suggestion added to today intake.')
      await loadDashboard()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleGenerateMealPlanFromIngredients = async () => {
    setError('')
    setStatus('')

    const ingredientFocus = parseIngredientList(homeIngredientsInput)
    if (!ingredientFocus.length) {
      setError('Add at least one ingredient (comma-separated) to build a meal.')
      return
    }

    try {
      setIsGeneratingMealPlan(true)
      const data = await buildMealPlan({
        ingredientFocus,
        maxSuggestions: 3,
      })
      setGeneratedMealPlans(data.suggestions || [])
      setStatus('Generated meal ideas from your available ingredients.')
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsGeneratingMealPlan(false)
    }
  }

  const handleAddEatOutToIntake = async (item) => {
    setError('')
    setStatus('')

    try {
      await addMeal({
        foodName: item.suggestedMeal || item.name,
        brand: item.name,
        calories: item.nutritionEstimate?.calories || 0,
        protein: item.nutritionEstimate?.protein || 0,
        carbs: item.nutritionEstimate?.carbs || 0,
        fats: item.nutritionEstimate?.fats || 0,
        fiber: item.nutritionEstimate?.fiber || 0,
        sourceType: 'restaurant',
        source: 'restaurant',
        mealType: 'lunch',
        ingredients: item.nutritionEstimate?.ingredients || [],
        allergyWarnings: item.allergyWarnings || [],
      })
      setStatus(`${item.suggestedMeal || item.name} added to today's intake.`)
      await loadDashboard()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleSaveFavorite = async (item) => {
    setError('')
    setStatus('')

    try {
      const profileResponse = await fetchProfile()
      const profile = profileResponse.profile

      const nextFavoriteRestaurants = Array.from(
        new Set([...(profile.favoriteRestaurants || []), item.name].filter(Boolean))
      )
      const nextFavoriteFoods = Array.from(
        new Set([...(profile.favoriteFoods || []), item.suggestedMeal].filter(Boolean))
      )

      await updateProfile({
        favoriteRestaurants: nextFavoriteRestaurants,
        favoriteFoods: nextFavoriteFoods,
      })
      setStatus(`${item.name} saved to favorites.`)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const handleUseInDailyPlan = (item) => {
    setStatus(`${item.suggestedMeal || item.name} marked as a daily plan candidate.`)
  }

  const handleAddRecipeCardAsMeal = async (recipe) => {
    setError('')
    setStatus('')

    try {
      await addMeal({
        foodName: recipe.recipeName || 'Recipe Meal',
        calories: recipe.estimatedMacros?.calories || 0,
        protein: recipe.estimatedMacros?.protein || 0,
        carbs: recipe.estimatedMacros?.carbs || 0,
        fats: recipe.estimatedMacros?.fats || 0,
        fiber: recipe.estimatedMacros?.fiber || 0,
        sourceType: 'recipe',
        source: 'recipe',
        mealType: 'dinner',
        ingredients: (recipe.ingredients || []).map((item) =>
          typeof item === 'string' ? item : item.name
        ),
        allergyWarnings: recipe.allergyNotes || [],
      })
      setStatus(`${recipe.recipeName || 'Recipe'} added to today's intake.`)
      await loadDashboard()
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    }
  }

  const renderPlanTitle = (suggestion) =>
    suggestion.recipe?.recipeName || (suggestion.ingredients || []).map((item) => item.name).join(' + ') || 'Meal Plan'

  if (loading) {
    return <section className="panel">Loading BFIT command center...</section>
  }

  if (!dashboard || !today) {
    return (
      <section className="page-grid single">
        <EmptyState title="Dashboard unavailable" description="Please refresh to load your BFIT dashboard." />
      </section>
    )
  }

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <div className="panel-hero-top">
          <div>
            <h1>BFIT Daily Command Center</h1>
            <p className="muted">Your Intelligent Nutrition, Cooking &amp; Fitness Companion</p>
          </div>
          <div className="inline-actions">
            <Link className="button button-ghost" to="/search">
              Search Nearby Meals
            </Link>
            <Link className="button button-ghost" to="/exercise">
              Exercise Tracker
            </Link>
            <Link className="button button-secondary" to="/history">
              History
            </Link>
          </div>
        </div>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        <CalendarMonthView
          activeMonth={activeMonth}
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          onMonthChange={handleMonthChange}
          marksByDate={marksByDate}
        />

        <article className="sub-panel">
          <h2>{isFutureDate(selectedDate) ? 'Future Plan Details' : 'Selected Day Details'}</h2>
          {isDayLoading ? <p className="muted">Loading selected date details...</p> : null}

          {!isDayLoading && selectedDay ? (
            isFutureDate(selectedDate) ? (
              <div className="form">
                <p className="helper-note">{selectedDate}: Plan your calories for this future date.</p>
                <div className="split-three">
                  <label className="field">
                    <span className="field-label">Planned Intake (kcal)</span>
                    <input
                      className="field-control"
                      type="number"
                      min="800"
                      max="8000"
                      value={plannedCalories}
                      onChange={(event) => setPlannedCalories(event.target.value)}
                      placeholder="e.g. 3000"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Plan Note / Event</span>
                    <input
                      className="field-control"
                      type="text"
                      maxLength="180"
                      value={planNote}
                      onChange={(event) => setPlanNote(event.target.value)}
                      placeholder="Party, travel, celebration..."
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={isCheatDay}
                      onChange={(event) => setIsCheatDay(event.target.checked)}
                    />
                    <span>Mark as cheat day</span>
                  </label>
                </div>
                <div className="inline-actions">
                  <button className="button button-align-end" onClick={handleSavePlan} disabled={isSavingPlan}>
                    {isSavingPlan ? 'Saving Plan...' : 'Change Plan'}
                  </button>
                  {!selectedDay.plan ? <span className="muted">No plan yet for this date. Create one now.</span> : null}
                </div>

                {selectedDay.plan?.expectedExtraCalories > 0 ? (
                  <div className="recommendation-box">
                    <p className="recommendation-title">Weekly Balance Suggestion</p>
                    <p>
                      You planned +{selectedDay.plan.expectedExtraCalories} kcal on {selectedDate}. Reduce about {selectedDay.plan.reductionPerDay} kcal/day for {selectedDay.plan.planningWindowDays} day(s) to balance.
                    </p>
                    <ul className="summary-list">
                      {(selectedDay.plan.suggestions || []).map((text, index) => (
                        <li key={`${selectedDay.plan.id || selectedDate}-${index}`}>{text}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {selectedDay.plan?.note ? (
                  <p className="helper-note">Event note: {selectedDay.plan.note}</p>
                ) : null}
              </div>
            ) : (
              <div className="split-two">
                <div>
                  <ul className="summary-list">
                    <li>Calories Consumed: {selectedDay.summary.caloriesConsumed} kcal</li>
                    <li>Calories Burned: {selectedDay.summary.caloriesBurned} kcal</li>
                    <li>Net Calories: {selectedDay.summary.netIntake} kcal</li>
                    <li>Protein: {selectedDay.summary.protein} g</li>
                    <li>Carbs: {selectedDay.summary.carbs} g</li>
                    <li>Fats: {selectedDay.summary.fats} g</li>
                    <li>Fiber: {selectedDay.summary.fiber} g</li>
                    <li>Exercises Logged: {selectedDay.summary.exerciseCount || 0}</li>
                    <li>Steps: {selectedDay.summary.steps || 0}</li>
                  </ul>
                </div>
                <div>
                  <p className="muted"><strong>Meals Logged</strong>: {selectedDay.meals?.length || 0}</p>
                  <ul className="activity-list">
                    {(selectedDay.meals || []).slice(0, 4).map((meal) => (
                      <li key={meal.id} className="activity-item">
                        <p><strong>{meal.foodName}</strong> ({meal.calories} kcal)</p>
                      </li>
                    ))}
                  </ul>
                  <p className="muted"><strong>Exercises Logged</strong>: {selectedDay.exercises?.length || 0}</p>
                  <ul className="activity-list">
                    {(selectedDay.exercises || []).slice(0, 4).map((session) => (
                      <li key={session.id} className="activity-item">
                        <p><strong>{session.workoutType}</strong> ({session.caloriesBurned} kcal)</p>
                        <p className="muted">{session.steps || 0} steps | {formatDate(session.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          ) : null}
        </article>

        <article className="sub-panel">
          <h2>Today's Nutrition &amp; Activity Summary</h2>
          <p className="helper-note">
            Remaining today: {today.remainingCalories} kcal | Protein {today.remainingProtein}g | Carbs {today.remainingCarbs}g | Fats {today.remainingFats}g | Fiber {today.remainingFiber}g
          </p>
          <div className="metrics-grid">
            <MetricCard label="Calories Consumed" value={`${today.caloriesConsumed} kcal`} />
            <MetricCard label="Calories Burned" value={`${today.caloriesBurned} kcal`} tone="success" />
            <MetricCard label="Net Calories" value={`${today.netIntake} kcal`} tone={today.netIntake > 0 ? 'warning' : 'success'} />
            <MetricCard label="Workouts Today" value={`${today.workoutsToday || 0}`} />
            <MetricCard label="Steps Today" value={`${today.stepsToday || 0}`} />
            <MetricCard label="Protein" value={macroProgress(today.proteinConsumed, today.proteinTarget)} />
            <MetricCard label="Carbs" value={macroProgress(today.carbsConsumed, today.carbsTarget)} />
            <MetricCard label="Fats" value={macroProgress(today.fatsConsumed, today.fatsTarget)} />
            <MetricCard label="Fiber" value={macroProgress(today.fiberConsumed, today.fiberTarget)} />
          </div>
        </article>

        <article className="sub-panel">
          <h2>What are you planning for this meal?</h2>
          <div className="inline-actions">
            <button
              className={`button ${mealPlanMode === 'eat-out' ? '' : 'button-ghost'}`}
              onClick={() => setMealPlanMode('eat-out')}
            >
              Eat Out
            </button>
            <button
              className={`button ${mealPlanMode === 'eat-in' ? '' : 'button-ghost'}`}
              onClick={() => setMealPlanMode('eat-in')}
            >
              Eat In
            </button>
            <button
              className={`button ${mealPlanMode === 'exercise' ? '' : 'button-ghost'}`}
              onClick={() => setMealPlanMode('exercise')}
            >
              Log Exercise
            </button>
          </div>

          {mealPlanMode === 'exercise' ? (
            <div className="sub-panel">
              <h3>Log Exercise</h3>
              <p className="muted">
                Track strength, cardio, and steps. Wearable import is optional and will be used if you grant permission.
              </p>
              <div className="inline-actions">
                <Link className="button" to="/exercise">
                  Open Exercise Tracker
                </Link>
                <Link className="button button-ghost" to="/history">
                  View Exercise History
                </Link>
              </div>
              <p className="helper-note">
                Calories burned are estimates unless imported directly from a wearable source.
              </p>
            </div>
          ) : mealPlanMode === 'eat-out' ? (
            <div className="sub-panel">
              <div className="inline-actions">
                <button
                  className={`button button-secondary ${eatOutMode === 'delivery' ? '' : 'button-ghost'}`}
                  onClick={() => setEatOutMode('delivery')}
                >
                  Delivery
                </button>
                <button
                  className={`button button-secondary ${eatOutMode === 'pickup' ? '' : 'button-ghost'}`}
                  onClick={() => setEatOutMode('pickup')}
                >
                  Pickup / Go There
                </button>
              </div>

              {topRestaurantOptions.length ? (
                <ul className="activity-list">
                  {topRestaurantOptions.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="activity-item">
                      <div className="result-media">
                        <ImageWithFallback
                          src={item.restaurantImage}
                          fallback={fallbackImage(item.name || 'Restaurant', item.cuisine || 'Cuisine')}
                          alt={item.name || 'Restaurant'}
                          className="result-image"
                        />
                        <ImageWithFallback
                          src={item.foodImage}
                          fallback={fallbackImage(item.suggestedMeal || 'Food', 'Nutrition Ready', 'food')}
                          alt={item.suggestedMeal || 'Food item'}
                          className="result-image result-image-food"
                        />
                      </div>
                      <p>
                        <strong>{item.name}</strong> {item.distance ? `| ${item.distance.toFixed(2)} mi` : ''}
                      </p>
                      <p className="muted">{item.suggestedMeal} | {item.cuisine || 'Cuisine not listed'}</p>
                      <p className="muted">
                        Rating: {Number.isFinite(Number(item.rating)) ? Number(item.rating).toFixed(1) : 'N/A'} | Reviews:{' '}
                        {(item.userRatingsTotal || 0).toLocaleString()}
                      </p>
                      {item.reviewSnippet ? <p className="muted">"{item.reviewSnippet}"</p> : null}
                      {item.nutritionEstimate ? (
                        <p className="muted">
                          {item.nutritionEstimate.calories} kcal | P {item.nutritionEstimate.protein}g | C {item.nutritionEstimate.carbs}g | F {item.nutritionEstimate.fats}g
                        </p>
                      ) : null}
                      {item.allergyWarnings?.length ? (
                        <p className="allergy-warning">⚠️ {item.allergyWarnings.join(' | ')}</p>
                      ) : null}
                      <div className="actions-grid">
                        {eatOutMode === 'delivery' ? (
                          <>
                            <a className="button button-ghost" href={item.orderLinks?.uberEats} target="_blank" rel="noreferrer">
                              Order on Uber Eats
                            </a>
                            <a className="button button-ghost" href={item.orderLinks?.doorDash} target="_blank" rel="noreferrer">
                              Order on DoorDash
                            </a>
                            <a className="button button-ghost" href={item.viewLink} target="_blank" rel="noreferrer">
                              View on Google
                            </a>
                          </>
                        ) : (
                          <>
                            <a className="button button-ghost" href={item.viewLink} target="_blank" rel="noreferrer">
                              View on Google
                            </a>
                            <a className="button button-ghost" href={item.visitLink} target="_blank" rel="noreferrer">
                              Open Directions
                            </a>
                            <a className="button button-ghost" href={item.visitLink} target="_blank" rel="noreferrer">
                              Pickup Plan
                            </a>
                          </>
                        )}
                      </div>
                      <div className="inline-actions">
                        <button className="button button-ghost" onClick={() => handleAddEatOutToIntake(item)}>
                          Add to Today's Intake
                        </button>
                        <button className="button button-ghost" onClick={() => handleSaveFavorite(item)}>
                          Save as Favorite
                        </button>
                        <button className="button button-ghost" onClick={() => handleUseInDailyPlan(item)}>
                          Use in Daily Plan
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No restaurant suggestions" description="Use Search to generate nearby options." actionLabel="Open Search" actionTo="/search" />
              )}
            </div>
          ) : (
            <div className="sub-panel">
              <div className="inline-actions">
                <button
                  className={`button button-secondary ${eatInMode === 'have' ? '' : 'button-ghost'}`}
                  onClick={() => setEatInMode('have')}
                >
                  Use Ingredients I Have
                </button>
                <button
                  className={`button button-secondary ${eatInMode === 'order' ? '' : 'button-ghost'}`}
                  onClick={() => setEatInMode('order')}
                >
                  Order Ingredients
                </button>
                <button
                  className={`button button-secondary ${eatInMode === 'recipes' ? '' : 'button-ghost'}`}
                  onClick={() => setEatInMode('recipes')}
                >
                  Quick Recipe Suggestions
                </button>
              </div>

              {eatInMode === 'have' ? (
                <>
                  <div className="split-two">
                    <label className="field">
                      <span className="field-label">Ingredients You Already Have</span>
                      <input
                        className="field-control"
                        type="text"
                        placeholder="chicken, rice, eggs, oats, vegetables"
                        value={homeIngredientsInput}
                        onChange={(event) => setHomeIngredientsInput(event.target.value)}
                      />
                    </label>
                    <button
                      className="button button-align-end"
                      onClick={handleGenerateMealPlanFromIngredients}
                      disabled={isGeneratingMealPlan}
                    >
                      {isGeneratingMealPlan ? 'Generating...' : 'Build from My Ingredients'}
                    </button>
                  </div>
                  {(generatedMealPlans.length ? generatedMealPlans : ingredientDrivenPlans).length ? (
                    <ul className="activity-list">
                      {(generatedMealPlans.length ? generatedMealPlans : ingredientDrivenPlans).map((suggestion) => (
                        <li key={suggestion.id} className="activity-item">
                          <p><strong>{renderPlanTitle(suggestion)}</strong></p>
                          <p className="muted">
                            {suggestion.macroTotals.calories} kcal | P {suggestion.macroTotals.protein}g | C {suggestion.macroTotals.carbs}g | F {suggestion.macroTotals.fats}g | Fiber {suggestion.macroTotals.fiber}g
                          </p>
                          <p className="muted">Ingredients: {(suggestion.recipe?.ingredients || []).map(ingredientLine).join(', ')}</p>
                          {suggestion.recipe?.cookingSteps?.length ? (
                            <ul className="summary-list">
                              {suggestion.recipe.cookingSteps.slice(0, 4).map((step, stepIndex) => (
                                <li key={`${suggestion.id}-step-${stepIndex}`}>{step}</li>
                              ))}
                            </ul>
                          ) : null}
                          {suggestion.recipe?.whyThisFitsYourPlan || suggestion.rationale ? (
                            <p className="muted">{suggestion.recipe?.whyThisFitsYourPlan || suggestion.rationale}</p>
                          ) : null}
                          {suggestion.recipe?.youtubeLink ? (
                            <a className="button button-ghost" href={suggestion.recipe.youtubeLink} target="_blank" rel="noreferrer">
                              Watch on YouTube
                            </a>
                          ) : null}
                          {suggestion.allergyWarnings?.length ? (
                            <p className="allergy-warning">⚠️ {suggestion.allergyWarnings.join(' | ')}</p>
                          ) : null}
                          <button className="button button-ghost" onClick={() => handleAddSuggestionAsMeal(suggestion)}>
                            Add to Today's Intake
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No ingredient-based suggestions yet.</p>
                  )}
                </>
              ) : eatInMode === 'order' ? (
                ingredientDrivenPlans.length ? (
                  <ul className="activity-list">
                    {ingredientDrivenPlans.map((suggestion) => (
                      <li key={suggestion.id} className="activity-item">
                        <p><strong>{renderPlanTitle(suggestion)}</strong></p>
                        <p className="muted">
                          {suggestion.macroTotals.calories} kcal | P {suggestion.macroTotals.protein}g | C {suggestion.macroTotals.carbs}g | F {suggestion.macroTotals.fats}g | Fiber {suggestion.macroTotals.fiber}g
                        </p>
                        <p className="muted">Ingredients: {(suggestion.recipe?.ingredients || []).map(ingredientLine).join(', ')}</p>
                        <p className="muted">{suggestion.rationale}</p>
                        {suggestion.allergyWarnings?.length ? (
                          <p className="allergy-warning">⚠️ {suggestion.allergyWarnings.join(' | ')}</p>
                        ) : null}
                        {suggestion.grocerySuggestions?.length ? (
                          <ul className="summary-list">
                            {suggestion.grocerySuggestions.map((grocery, groceryIndex) => (
                              <li key={`${suggestion.id}-grocery-${groceryIndex}`}>
                                {grocery.ingredient}: {grocery.estimatedPrice} ({grocery.store}, {grocery.rating}★)
                                {grocery.allergyWarnings?.length ? ` - ⚠️ ${grocery.allergyWarnings.join(' | ')}` : ''}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {suggestion.recipe?.youtubeLink ? (
                          <a className="button button-ghost" href={suggestion.recipe.youtubeLink} target="_blank" rel="noreferrer">
                            Watch on YouTube
                          </a>
                        ) : null}
                        <div className="actions-grid">
                          <button className="button button-ghost" onClick={() => handleAddSuggestionAsMeal(suggestion)}>
                            Add to Today's Intake
                          </button>
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].buyLink} target="_blank" rel="noreferrer">
                              Buy on Walmart
                            </a>
                          ) : null}
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].viewLink} target="_blank" rel="noreferrer">
                              View on Google
                            </a>
                          ) : null}
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].viewLink} target="_blank" rel="noreferrer">
                              Pickup Ingredients
                            </a>
                          ) : null}
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].buyLink} target="_blank" rel="noreferrer">
                              Delivery Ingredients
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No ingredient order suggestions available right now.</p>
                )
              ) : recipeSuggestions.length ? (
                <ul className="activity-list">
                  {recipeSuggestions.map((recipe) => (
                    <li key={recipe.id} className="activity-item">
                      <ImageWithFallback
                        src={recipe.imageUrl}
                        fallback={fallbackImage(recipe.recipeName || 'Recipe', 'Macro-fit Meal', 'food')}
                        alt={recipe.recipeName || 'Recipe'}
                        className="result-image"
                      />
                      <p><strong>{recipe.recipeName}</strong></p>
                      <p className="muted">{recipe.recommendationLabel}</p>
                      <p className="muted">
                        {recipe.estimatedMacros.calories} kcal | P {recipe.estimatedMacros.protein}g | C {recipe.estimatedMacros.carbs}g | F {recipe.estimatedMacros.fats}g
                      </p>
                      <p className="muted">Ingredients: {(recipe.ingredients || []).map(ingredientLine).join(', ')}</p>
                      {recipe.allergyNotes?.length ? (
                        <p className="allergy-warning">⚠️ {recipe.allergyNotes.join(' | ')}</p>
                      ) : null}
                      <div className="inline-actions">
                        <button className="button button-ghost" onClick={() => handleAddRecipeCardAsMeal(recipe)}>
                          Add to Today's Intake
                        </button>
                        {recipe.youtubeLink ? (
                          <a className="button button-ghost" href={recipe.youtubeLink} target="_blank" rel="noreferrer">
                            Watch Recipe on YouTube
                          </a>
                        ) : null}
                        <Link className="button button-ghost" to="/community">
                          Community Recipes
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No recipe suggestions available right now.</p>
              )}
            </div>
          )}
        </article>
      </article>
    </section>
  )
}
