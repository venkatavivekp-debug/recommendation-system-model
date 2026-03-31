import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import MetricCard from '../components/MetricCard'
import TrendChart from '../components/TrendChart'
import { saveCalendarPlan, fetchCalendarDay } from '../services/api/calendarApi'
import { fetchDashboardSummary } from '../services/api/dashboardApi'
import { addMeal } from '../services/api/mealApi'
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

function formatGoalProgress(consumed, goal) {
  if (!goal || goal <= 0) {
    return '0%'
  }

  return `${Math.max(0, Math.min(220, ((consumed / goal) * 100).toFixed(1)))}%`
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [selectedDate, setSelectedDate] = useState(todayDateKey())
  const [selectedDay, setSelectedDay] = useState(null)
  const [isDayLoading, setIsDayLoading] = useState(false)

  const [mealPlanMode, setMealPlanMode] = useState('eat-out')
  const [eatOutMode, setEatOutMode] = useState('delivery')
  const [eatInMode, setEatInMode] = useState('ingredients')

  const [plannedCalories, setPlannedCalories] = useState('')
  const [isSavingPlan, setIsSavingPlan] = useState(false)

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const data = await fetchDashboardSummary()
      setDashboard(data)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    const loadDay = async () => {
      try {
        setIsDayLoading(true)
        const data = await fetchCalendarDay(selectedDate)
        setSelectedDay(data)
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
      })

      setStatus(data.recommendation?.message || 'Plan saved.')
      await loadDashboard()
      const dayData = await fetchCalendarDay(selectedDate)
      setSelectedDay(dayData)
    } catch (apiError) {
      setError(normalizeApiError(apiError))
    } finally {
      setIsSavingPlan(false)
    }
  }

  const topRestaurantOptions = useMemo(
    () => (recommendation?.restaurantOptions || []).slice(0, 5),
    [recommendation]
  )

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
            <p className="muted">Plan meals, track macros, and choose your next action for today.</p>
          </div>
          <div className="inline-actions">
            <Link className="button button-ghost" to="/search">
              Search Nearby Meals
            </Link>
            <Link className="button button-secondary" to="/history">
              Open History
            </Link>
          </div>
        </div>

        <ErrorAlert message={error} />
        {status ? <p className="status-message">{status}</p> : null}

        <article className="sub-panel">
          <h2>Calendar Planner</h2>
          <div className="split-three">
            <label className="field">
              <span className="field-label">Select Date</span>
              <input
                className="field-control"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>

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

            <button className="button button-align-end" onClick={handleSavePlan} disabled={isSavingPlan}>
              {isSavingPlan ? 'Saving Plan...' : 'Save Plan'}
            </button>
          </div>

          {isDayLoading ? <p className="muted">Loading selected date details...</p> : null}
          {selectedDay?.summary ? (
            <p className="helper-note">
              {selectedDay.date}: {selectedDay.summary.caloriesConsumed} kcal consumed,{' '}
              {selectedDay.summary.protein}g protein, {selectedDay.summary.carbs}g carbs,{' '}
              {selectedDay.summary.fats}g fats.
            </p>
          ) : null}
        </article>

        <div className="metrics-grid">
          <MetricCard
            label="Calories Consumed"
            value={`${today.caloriesConsumed} kcal`}
            hint={`Goal ${today.dailyCalorieGoal} | ${formatGoalProgress(
              today.caloriesConsumed,
              today.dailyCalorieGoal
            )}`}
          />
          <MetricCard
            label="Calories Remaining"
            value={`${today.remainingCalories} kcal`}
            tone={today.remainingCalories < 0 ? 'warning' : 'default'}
            hint={today.remainingCalories < 0 ? 'Over target today' : 'Within target'}
          />
          <MetricCard
            label="Calories Burned"
            value={`${today.caloriesBurned} kcal`}
            tone="success"
            hint="From saved routes"
          />
          <MetricCard
            label="Net Intake"
            value={`${today.netIntake} kcal`}
            tone={today.netIntake > 0 ? 'warning' : 'success'}
            hint="Consumed - burned"
          />
        </div>

        <div className="metrics-grid">
          <MetricCard
            label="Protein Remaining"
            value={`${today.remainingProtein} g`}
            hint="Keep protein stable while balancing calories"
          />
          <MetricCard label="Carbs Remaining" value={`${today.remainingCarbs} g`} />
          <MetricCard label="Fats Remaining" value={`${today.remainingFats} g`} />
          <MetricCard label="Fiber Remaining" value={`${today.remainingFiber} g`} />
        </div>

        <article className="sub-panel">
          <h2>What Are You Planning For This Meal?</h2>
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
          </div>

          {mealPlanMode === 'eat-out' ? (
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
                      <p>
                        <strong>{item.name}</strong> {item.distance ? `| ${item.distance.toFixed(2)} mi` : ''}
                      </p>
                      <p className="muted">
                        {item.suggestedMeal} | {item.cuisine || 'Cuisine not listed'} | {item.explanation}
                      </p>
                      <div className="actions-grid">
                        {eatOutMode === 'delivery' ? (
                          <>
                            <a className="button button-ghost" href={item.orderLinks?.uberEats} target="_blank" rel="noreferrer">
                              Order on Uber Eats
                            </a>
                            <a className="button button-ghost" href={item.orderLinks?.doorDash} target="_blank" rel="noreferrer">
                              Order on DoorDash
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
                          </>
                        )}
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
                  className={`button button-secondary ${eatInMode === 'ingredients' ? '' : 'button-ghost'}`}
                  onClick={() => setEatInMode('ingredients')}
                >
                  Build Meal From Ingredients
                </button>
                <button
                  className={`button button-secondary ${eatInMode === 'recipes' ? '' : 'button-ghost'}`}
                  onClick={() => setEatInMode('recipes')}
                >
                  Recipe Suggestions
                </button>
              </div>

              {eatInMode === 'ingredients' ? (
                mealBuilderSuggestions.length ? (
                  <ul className="activity-list">
                    {mealBuilderSuggestions.map((suggestion) => (
                      <li key={suggestion.id} className="activity-item">
                        <p>
                          <strong>{suggestion.ingredients.map((item) => item.name).join(' + ')}</strong>
                        </p>
                        <p className="muted">
                          {suggestion.macroTotals.calories} kcal | P {suggestion.macroTotals.protein}g | C {suggestion.macroTotals.carbs}g | F {suggestion.macroTotals.fats}g | Fiber {suggestion.macroTotals.fiber}g
                        </p>
                        <p className="muted">{suggestion.rationale}</p>
                        {suggestion.allergyWarnings?.length ? (
                          <p className="alert alert-error">⚠️ {suggestion.allergyWarnings.join(' | ')}</p>
                        ) : null}
                        <div className="inline-actions">
                          <button className="button button-ghost" onClick={() => handleAddSuggestionAsMeal(suggestion)}>
                            Add to Today Intake
                          </button>
                          {suggestion.grocerySuggestions?.[0] ? (
                            <a className="button button-ghost" href={suggestion.grocerySuggestions[0].buyLink} target="_blank" rel="noreferrer">
                              Buy Ingredients
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No ingredient suggestions available right now.</p>
                )
              ) : recipeSuggestions.length ? (
                <ul className="activity-list">
                  {recipeSuggestions.map((recipe) => (
                    <li key={recipe.id} className="activity-item">
                      <p>
                        <strong>{recipe.recipeName}</strong>
                      </p>
                      <p className="muted">{recipe.recommendationLabel}</p>
                      <p className="muted">
                        {recipe.estimatedMacros.calories} kcal | P {recipe.estimatedMacros.protein}g | C {recipe.estimatedMacros.carbs}g | F {recipe.estimatedMacros.fats}g
                      </p>
                      {recipe.allergyNotes?.length ? (
                        <p className="alert alert-error">⚠️ {recipe.allergyNotes.join(' | ')}</p>
                      ) : null}
                      <div className="inline-actions">
                        {recipe.youtubeLink ? (
                          <a className="button button-ghost" href={recipe.youtubeLink} target="_blank" rel="noreferrer">
                            Watch Recipe on YouTube
                          </a>
                        ) : null}
                        <Link className="button button-ghost" to="/community">
                          Open Community Recipes
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

        <div className="split-two">
          <article className="sub-panel">
            <h2>Weekly Trend</h2>
            <TrendChart trend={dashboard.trend || []} />
          </article>

          <article className="sub-panel">
            <h2>Recommendation Summary</h2>
            <p className="summary-emphasis">{dashboard.recommendationSummary}</p>
            <ul className="summary-list">
              <li>Favorite restaurants: {(dashboard.favoriteRestaurants || []).length}</li>
              <li>Favorite foods: {(dashboard.favoriteFoods || []).length}</li>
              <li>Upcoming plans: {(dashboard.calendarSnapshot?.upcoming || []).length}</li>
            </ul>
          </article>
        </div>

        <div className="split-two">
          <article className="sub-panel">
            <h2>Upcoming Plan Snapshot</h2>
            {dashboard.calendarSnapshot?.upcoming?.length ? (
              <ul className="activity-list">
                {dashboard.calendarSnapshot.upcoming.slice(0, 5).map((plan) => (
                  <li key={plan.id} className="activity-item">
                    <p>
                      <strong>{plan.date}</strong>: Planned {plan.plannedCalories} kcal
                    </p>
                    <p className="muted">
                      Extra {plan.expectedExtraCalories} kcal | Reduce {plan.reductionPerDay} kcal/day
                    </p>
                    <p className="muted">{(plan.suggestions || [])[0]}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No upcoming plans yet. Add one in the calendar planner above.</p>
            )}
          </article>

          <article className="sub-panel">
            <h2>Recent Meal Logs</h2>
            {dashboard.recentFoodSelections?.length ? (
              <ul className="activity-list">
                {dashboard.recentFoodSelections.map((item) => (
                  <li key={item.id} className="activity-item">
                    <p>
                      <strong>{item.foodName}</strong>
                    </p>
                    <p className="muted">
                      {item.caloriesConsumed} kcal | {item.source}
                    </p>
                    <p className="muted">{formatDate(item.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No meals logged today" description="Use Add to Meal from search or recipe suggestions." actionLabel="Go to Search" actionTo="/search" />
            )}
          </article>
        </div>
      </article>
    </section>
  )
}
