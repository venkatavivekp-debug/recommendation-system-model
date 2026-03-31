import { Link } from 'react-router-dom'

export default function EmptyState({ title, description, actionLabel, actionTo }) {
  return (
    <article className="empty-state">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {actionLabel && actionTo ? (
        <Link className="button button-ghost" to={actionTo}>
          {actionLabel}
        </Link>
      ) : null}
    </article>
  )
}
