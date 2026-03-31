import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import { fetchActivities } from '../services/api/activityApi'
import { normalizeApiError } from '../services/api/client'
import { fetchMealHistory, fetchTodayMeals } from '../services/api/mealApi'

function formatDate(iso) {
  if (!iso) {
    return ''
  }

  return new Date(iso).toLocaleString()
}

export default function HistoryPage() {
  const [activities, setActivities] = useState([])
  const [mealHistory, setMealHistory] = useState([])
  const [todayMeals, setTodayMeals] = useState([])
  const [todayTotals, setTodayTotals] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [activityData, mealData, todayData] = await Promise.all([
          fetchActivities(100),
          fetchMealHistory(200),
          fetchTodayMeals(),
        ])

        setActivities(activityData.activities || [])
        setMealHistory(mealData.meals || [])
        setTodayMeals(todayData.meals || [])
        setTodayTotals(todayData.totals || null)
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      if (!query) {
        return true
      }

      const text = `${item.foodName} ${item.restaurantName}`.toLowerCase()
      return text.includes(query.toLowerCase())
    })
  }, [activities, query])

  const filteredMeals = useMemo(() => {
    return mealHistory.filter((item) => {
      if (!query) {
        return true
      }

      return String(item.foodName || '').toLowerCase().includes(query.toLowerCase())
    })
  }, [mealHistory, query])

  return (
    <section className="page-grid single">
      <article className="panel">
        <h1>BFIT History + Daily Intake</h1>
        <p className="muted">
          Unified timeline of meal logs and route activities to monitor nutrition and fitness decisions.
        </p>

        <ErrorAlert message={error} />

        <FieldInput
          label="Search by Meal/Food/Restaurant"
          type="text"
          placeholder="chicken bowl, brownie, green pulse"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {loading ? <p className="muted">Loading history...</p> : null}

        {!loading ? (
          <div className="split-two">
            <article className="sub-panel">
              <h2>Today Meal Intake</h2>
              {todayTotals ? (
                <ul className="summary-list">
                  <li>Calories: {todayTotals.calories} kcal</li>
                  <li>Protein: {todayTotals.protein} g</li>
                  <li>Carbs: {todayTotals.carbs} g</li>
                  <li>Fats: {todayTotals.fats} g</li>
                  <li>Fiber: {todayTotals.fiber} g</li>
                </ul>
              ) : null}

              {todayMeals.length ? (
                <ul className="activity-list">
                  {todayMeals.map((meal) => (
                    <li key={meal.id} className="activity-item">
                      <p>
                        <strong>{meal.foodName}</strong> ({meal.source})
                      </p>
                      <p className="muted">
                        {meal.calories} kcal | P {meal.protein}g | C {meal.carbs}g | F {meal.fats}g | Fiber {meal.fiber}g
                      </p>
                      <p className="muted">{formatDate(meal.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No meals logged today"
                  description="Use Add to Meal in search results to build your daily intake."
                  actionLabel="Go to Search"
                  actionTo="/search"
                />
              )}
            </article>

            <article className="sub-panel">
              <h2>Route Activity Logs</h2>
              {filteredActivities.length ? (
                <ul className="activity-list">
                  {filteredActivities.map((item) => (
                    <li key={item.id} className="activity-item">
                      <p>
                        <strong>{item.foodName}</strong> at {item.restaurantName}
                      </p>
                      <p className="muted">
                        {item.travelMode} | {item.distanceMiles} mi | Burned {item.caloriesBurned} kcal
                      </p>
                      <p className="muted">{formatDate(item.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No route activities"
                  description="Calculate route from a selected result to populate this section."
                  actionLabel="View Results"
                  actionTo="/results"
                />
              )}
            </article>
          </div>
        ) : null}

        {!loading ? (
          <article className="sub-panel">
            <h2>Meal History</h2>
            {filteredMeals.length ? (
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Food</th>
                      <th>Source</th>
                      <th>Calories</th>
                      <th>Protein</th>
                      <th>Carbs</th>
                      <th>Fats</th>
                      <th>Fiber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMeals.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDate(item.createdAt)}</td>
                        <td>{item.foodName}</td>
                        <td className="text-capitalize">{item.source}</td>
                        <td>{item.calories}</td>
                        <td>{item.protein}g</td>
                        <td>{item.carbs}g</td>
                        <td>{item.fats}g</td>
                        <td>{item.fiber}g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No meal history found"
                description="Start logging meals from food results or custom entries."
                actionLabel="Search Food"
                actionTo="/search"
              />
            )}
          </article>
        ) : null}
      </article>
    </section>
  )
}
