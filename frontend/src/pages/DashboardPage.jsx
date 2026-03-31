import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import MetricCard from '../components/MetricCard'
import TrendChart from '../components/TrendChart'
import { fetchDashboardSummary } from '../services/api/dashboardApi'
import { normalizeApiError } from '../services/api/client'

function formatDate(iso) {
  if (!iso) {
    return ''
  }

  return new Date(iso).toLocaleString()
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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

    loadDashboard()
  }, [])

  const today = dashboard?.today
  const totals = dashboard?.totals
  const recommendation = dashboard?.recommendedForRemainingDay

  const netTone = useMemo(() => {
    if (!today) {
      return 'default'
    }

    return today.netIntake > 0 ? 'warning' : 'success'
  }, [today])

  return (
    <section className="page-grid single">
      <article className="panel panel-hero">
        <div className="panel-hero-top">
          <div>
            <h1>Dashboard</h1>
            <p className="muted">
              Daily nutrition intelligence: consumed, remaining macros, recommendations, and route impact.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button button-ghost" to="/search">
              Search Food
            </Link>
            <Link className="button button-secondary" to="/history">
              Open History
            </Link>
          </div>
        </div>

        <ErrorAlert message={error} />
        {loading ? <p className="muted">Loading dashboard...</p> : null}

        {!loading && dashboard ? (
          <>
            <div className="metrics-grid">
              <MetricCard
                label="Calories Consumed Today"
                value={`${today.caloriesConsumed} kcal`}
                hint={`Goal: ${today.dailyCalorieGoal} kcal`}
              />
              <MetricCard
                label="Calories Remaining"
                value={`${today.remainingCalories} kcal`}
                hint={`${totals.mealLogsToday} meals logged`}
                tone={today.remainingCalories < 0 ? 'warning' : 'default'}
              />
              <MetricCard
                label="Calories Burned Today"
                value={`${today.caloriesBurned} kcal`}
                hint={`${totals.distanceMiles} miles in recent routes`}
                tone="success"
              />
              <MetricCard
                label="Daily Goal Progress"
                value={`${today.goalProgressPct}%`}
                hint={today.netIntake > 0 ? 'Current surplus' : 'Balanced/deficit'}
                tone={netTone}
              />
            </div>

            <div className="metrics-grid">
              <MetricCard label="Protein Remaining" value={`${today.remainingProtein} g`} />
              <MetricCard label="Carbs Remaining" value={`${today.remainingCarbs} g`} />
              <MetricCard label="Fats Remaining" value={`${today.remainingFats} g`} />
              <MetricCard label="Fiber Remaining" value={`${today.remainingFiber} g`} />
            </div>

            <div className="split-two">
              <article className="sub-panel">
                <h2>7-Day Trend</h2>
                <TrendChart trend={dashboard.trend || []} />
              </article>

              <article className="sub-panel">
                <h2>Recommended for Remaining Day</h2>
                <p className="summary-emphasis">{dashboard.recommendationSummary}</p>
                <ul className="summary-list">
                  <li>Favorite restaurants: {(dashboard.favoriteRestaurants || []).length}</li>
                  <li>Favorite foods: {(dashboard.favoriteFoods || []).length}</li>
                  <li>Total recent burned: {totals.caloriesBurned} kcal</li>
                </ul>
              </article>
            </div>

            <div className="split-two">
              <article className="sub-panel">
                <h2>Nearby Meal Suggestions</h2>
                {recommendation?.restaurantOptions?.length ? (
                  <ul className="activity-list">
                    {recommendation.restaurantOptions.slice(0, 4).map((item, index) => (
                      <li key={`${item.name}-${index}`} className="activity-item">
                        <p>
                          <strong>{item.name}</strong>
                        </p>
                        <p className="muted">{item.suggestedMeal}</p>
                        <p className="muted">{item.explanation}</p>
                        <div className="inline-actions">
                          <a className="button button-ghost" href={item.orderLinks?.uberEats} target="_blank" rel="noreferrer">
                            Uber Eats
                          </a>
                          <a className="button button-ghost" href={item.visitLink} target="_blank" rel="noreferrer">
                            Maps
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No suggestions yet"
                    description="Log meals and search nearby food to activate recommendation signals."
                    actionLabel="Start Search"
                    actionTo="/search"
                  />
                )}
              </article>

              <article className="sub-panel">
                <h2>Complete Your Diet (Grocery)</h2>
                {recommendation?.grocerySuggestions?.length ? (
                  <ul className="activity-list">
                    {recommendation.grocerySuggestions.map((item, index) => (
                      <li key={`${item.item}-${index}`} className="activity-item">
                        <p>
                          <strong>{item.item}</strong> | {item.store}
                        </p>
                        <p className="muted">
                          {item.priceEstimate} | Rating {item.rating}
                        </p>
                        <a className="button button-ghost" href={item.link} target="_blank" rel="noreferrer">
                          Open Store Search
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            </div>

            <div className="split-two">
              <article className="sub-panel">
                <h2>Raw Food Macro Suggestions</h2>
                {recommendation?.rawFoodSuggestions?.length ? (
                  <ul className="activity-list">
                    {recommendation.rawFoodSuggestions.map((item, index) => (
                      <li key={`${item.item}-${index}`} className="activity-item">
                        <p>
                          <strong>{item.quantity}</strong> {item.item}
                        </p>
                        <p className="muted">{item.rationale}</p>
                        <p className="muted">
                          {item.macros.calories} kcal | P {item.macros.protein}g | C {item.macros.carbs}g | F {item.macros.fats}g | Fiber {item.macros.fiber}g
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
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
                  <EmptyState
                    title="No meals logged today"
                    description="Use Add to Meal on results cards to track your intake."
                    actionLabel="Go to Search"
                    actionTo="/search"
                  />
                )}
              </article>
            </div>
          </>
        ) : null}
      </article>
    </section>
  )
}
