function maxValue(trend = []) {
  if (!Array.isArray(trend) || trend.length === 0) {
    return 1
  }

  return trend.reduce((acc, item) => {
    const localMax = Math.max(item.consumed || 0, item.burned || 0)
    return Math.max(acc, localMax)
  }, 1)
}

export default function TrendChart({ trend = [] }) {
  if (!trend.length) {
    return <p className="muted">No trend data yet. Complete a route to start your weekly chart.</p>
  }

  const peak = maxValue(trend)

  return (
    <div className="trend-chart" role="img" aria-label="Seven day calories consumed and burned chart">
      {trend.map((day) => {
        const consumedHeight = Math.max(8, Math.round(((day.consumed || 0) / peak) * 100))
        const burnedHeight = Math.max(8, Math.round(((day.burned || 0) / peak) * 100))

        return (
          <div className="trend-group" key={day.date}>
            <div className="trend-bars">
              <span className="trend-bar trend-bar-consumed" style={{ height: `${consumedHeight}%` }} />
              <span className="trend-bar trend-bar-burned" style={{ height: `${burnedHeight}%` }} />
            </div>
            <p className="trend-label">{day.date.slice(5)}</p>
          </div>
        )
      })}
    </div>
  )
}
