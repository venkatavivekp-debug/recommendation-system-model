import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorAlert from '../components/ErrorAlert'
import FieldInput from '../components/FieldInput'
import { normalizeApiError } from '../services/api/client'
import { fetchActivities } from '../services/api/activityApi'

function formatDate(iso) {
  if (!iso) {
    return ''
  }

  return new Date(iso).toLocaleString()
}

export default function HistoryPage() {
  const [activities, setActivities] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modeFilter, setModeFilter] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true)
        const data = await fetchActivities(80)
        setActivities(data.activities || [])
      } catch (apiError) {
        setError(normalizeApiError(apiError))
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [])

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      if (modeFilter && item.travelMode !== modeFilter) {
        return false
      }

      if (query) {
        const text = `${item.foodName} ${item.restaurantName}`.toLowerCase()
        return text.includes(query.toLowerCase())
      }

      return true
    })
  }, [activities, modeFilter, query])

  return (
    <section className="page-grid single">
      <article className="panel">
        <h1>Activity History</h1>
        <p className="muted">
          Detailed trail of selected food, chosen restaurant, distance traveled, and calories burned.
        </p>

        <ErrorAlert message={error} />

        <div className="split-two">
          <FieldInput
            label="Search by Food or Restaurant"
            type="text"
            placeholder="brownie or fit fuel"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <FieldInput
            label="Travel Mode Filter"
            as="select"
            value={modeFilter}
            onChange={(event) => setModeFilter(event.target.value)}
          >
            <option value="">All modes</option>
            <option value="walking">Walking</option>
            <option value="running">Running</option>
            <option value="driving">Driving</option>
          </FieldInput>
        </div>

        {loading ? <p className="muted">Loading activity history...</p> : null}

        {!loading && filteredActivities.length ? (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Food</th>
                  <th>Restaurant</th>
                  <th>Mode</th>
                  <th>Distance</th>
                  <th>Consumed</th>
                  <th>Burned</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>{item.foodName}</td>
                    <td>{item.restaurantName}</td>
                    <td className="text-capitalize">{item.travelMode}</td>
                    <td>{item.distanceMiles} mi</td>
                    <td>{item.caloriesConsumed} kcal</td>
                    <td>{item.caloriesBurned} kcal</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && filteredActivities.length === 0 ? (
          <EmptyState
            title="No history found"
            description="No records match your filters yet. Complete a route and it will appear here."
            actionLabel="Start Search"
            actionTo="/search"
          />
        ) : null}
      </article>
    </section>
  )
}
