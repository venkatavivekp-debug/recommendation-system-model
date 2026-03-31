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

  const date = new Date(iso)
  return date.toLocaleString()
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
              Track calorie balance, route activity, and recommendation quality in one place.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button button-ghost" to="/search">
              Start New Search
            </Link>
            <Link className="button button-secondary" to="/history">
              Open Full History
            </Link>
          </div>
        </div>

        <ErrorAlert message={error} />

        {loading ? <p className="muted">Loading dashboard...</p> : null}

        {!loading && dashboard ? (
          <>
            <div className="metrics-grid">
              <MetricCard
                label="Today Consumed"
                value={`${today.caloriesConsumed} kcal`}
                hint={`Goal: ${today.dailyCalorieGoal} kcal`}
              />
              <MetricCard
                label="Today Burned"
                value={`${today.caloriesBurned} kcal`}
                hint={`${totals.distanceMiles} miles in recent sessions`}
                tone="success"
              />
              <MetricCard
                label="Net Intake"
                value={`${today.netIntake} kcal`}
                hint={today.netIntake > 0 ? 'Surplus today' : 'Deficit or balanced'}
                tone={netTone}
              />
              <MetricCard
                label="Goal Progress"
                value={`${today.goalProgressPct}%`}
                hint={`${totals.recentActivitiesCount} recent activities`}
              />
            </div>

            <div className="split-two">
              <article className="sub-panel">
                <h2>7-Day Trend</h2>
                <TrendChart trend={dashboard.trend || []} />
              </article>

              <article className="sub-panel">
                <h2>Recommendation Summary</h2>
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
                <h2>Recent Food Selections</h2>
                {dashboard.recentFoodSelections?.length ? (
                  <ul className="activity-list">
                    {dashboard.recentFoodSelections.map((item) => (
                      <li key={item.id} className="activity-item">
                        <p>
                          <strong>{item.foodName}</strong> at {item.restaurantName}
                        </p>
                        <p className="muted">
                          {item.caloriesConsumed} kcal • {formatDate(item.createdAt)}
                        </p>
                        {item.recommendationMessage ? (
                          <p className="muted">{item.recommendationMessage}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No food selections yet"
                    description="Select a restaurant from results and calculate a route to populate dashboard history."
                    actionLabel="Go to Search"
                    actionTo="/search"
                  />
                )}
              </article>

              <article className="sub-panel">
                <h2>Recent Routes</h2>
                {dashboard.recentRoutes?.length ? (
                  <ul className="activity-list">
                    {dashboard.recentRoutes.map((item) => (
                      <li key={item.id} className="activity-item">
                        <p>
                          <strong>{item.restaurantName}</strong> • {item.travelMode}
                        </p>
                        <p className="muted">
                          {item.distanceMiles} mi • {item.caloriesBurned} kcal burned
                        </p>
                        <p className="muted">{formatDate(item.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No route sessions yet"
                    description="Once you compute travel mode in Route Summary, route history appears here."
                    actionLabel="View Results"
                    actionTo="/results"
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
