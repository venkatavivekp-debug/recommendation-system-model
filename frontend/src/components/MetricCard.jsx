export default function MetricCard({ label, value, hint, tone = 'default' }) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {hint ? <p className="metric-hint">{hint}</p> : null}
    </article>
  )
}
