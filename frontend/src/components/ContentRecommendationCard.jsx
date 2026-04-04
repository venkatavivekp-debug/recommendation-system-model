function factorLabel(name) {
  const labels = {
    genreMatch: 'Genre match',
    moodMatch: 'Mood fit',
    durationFit: 'Duration fit',
    contextFit: 'Context fit',
    timeOfDayFit: 'Time fit',
    historySimilarity: 'History fit',
    activityFit: 'Activity fit',
  }
  return labels[name] || name
}

export default function ContentRecommendationCard({
  item,
  variant = 'movie',
  titlePrefix = '',
  onFeedback,
}) {
  if (!item) {
    return null
  }

  const confidence = Number(item.confidencePct || item.confidence || 0)

  const triggerFeedback = (action) => {
    if (!onFeedback) {
      return
    }

    onFeedback(item, action)
  }

  return (
    <article className={`content-card ${variant === 'song' ? 'content-card-song' : 'content-card-movie'}`}>
      <div className="badge-row">
        <span className="pill">Best Choice for You</span>
        <span className="pill">{Math.round(confidence)}% confidence</span>
      </div>
      <h3>{titlePrefix ? `${titlePrefix}: ${item.title}` : item.title}</h3>
      <p className="muted">
        {variant === 'song' ? `${item.artist || 'Unknown artist'} | ${item.genre || 'genre'} | ${item.mood || 'mood'}` : `${item.type || 'show'} | ${item.genre || 'genre'} | ${item.mood || 'mood'}`}
      </p>
      <p>{item.reason || 'Strong context fit for your current BFIT flow.'}</p>
      {Array.isArray(item.topFactors) && item.topFactors.length ? (
        <p className="helper-note">
          Top factors:{' '}
          {item.topFactors
            .slice(0, 3)
            .map((factor) => `${factorLabel(factor.name)} (${Math.round(Number(factor.contribution || 0) * 100)}%)`)
            .join(' • ')}
        </p>
      ) : null}
      <div className="actions-grid">
        <button className="button button-ghost" type="button" onClick={() => triggerFeedback('helpful')}>
          Mark Helpful
        </button>
        <button className="button button-ghost" type="button" onClick={() => triggerFeedback('not_interested')}>
          Not Interested
        </button>
        <button className="button button-ghost" type="button" onClick={() => triggerFeedback('save')}>
          Save for Later
        </button>
        <a className="button button-ghost" href={item.sourceUrl} target="_blank" rel="noreferrer">
          Open Source
        </a>
      </div>
    </article>
  )
}
