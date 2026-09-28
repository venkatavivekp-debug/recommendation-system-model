import {
  contentAdaptiveLabel,
  contentFactorLabel,
  contentInsight,
  contentTags,
  contributionPercent,
  matchPercent,
} from '../utils/recommendationDisplay'

export default function ContentRecommendationCard({
  item,
  variant = 'movie',
  titlePrefix = '',
  onFeedback,
  isTopRecommendation = false,
}) {
  if (!item) {
    return null
  }

  const confidence = matchPercent(item.confidencePct, item.confidence, item.score)
  const tags = contentTags(item, variant)
  const adaptiveNote = contentAdaptiveLabel(item, isTopRecommendation)

  const triggerFeedback = (action) => {
    if (!onFeedback) {
      return
    }

    onFeedback(item, action)
  }

  return (
    <article className={`content-card ${variant === 'song' ? 'content-card-song' : 'content-card-movie'}`}>
      {isTopRecommendation ? <div className="badge-row">
        <span className="pill">Best Choice for You</span>
      </div> : null}
      <h3>{titlePrefix ? `${titlePrefix}: ${item.title}` : item.title}</h3>
      <p className="muted">
        {variant === 'song' ? `${item.artist || 'Unknown artist'} | ${item.genre || 'genre'} | ${item.mood || 'mood'}` : `${item.type || 'show'} | ${item.genre || 'genre'} | ${item.mood || 'mood'}`}
      </p>
      <p className="insight-line">{contentInsight(item, variant)}</p>
      {adaptiveNote ? <p className="adaptive-note">{adaptiveNote}</p> : null}
      {tags.length ? (
        <div className="badge-row insight-tags">
          {tags.map((tag) => <span className="pill" key={tag}>{tag}</span>)}
        </div>
      ) : null}
      <div className="confidence-meter" aria-label={`${confidence}% match`}>
        <span>{confidence}% match</span>
        <span className="confidence-track">
          <span className="confidence-fill" style={{ width: `${confidence}%` }} />
        </span>
      </div>
      <p>{item.reason || 'Strong context fit for your current recommendation-system-model flow.'}</p>
      {Array.isArray(item.topFactors) && item.topFactors.length ? (
        <p className="helper-note">
          Top factors:{' '}
          {item.topFactors
            .slice(0, 3)
            .map((factor) => `${contentFactorLabel(factor.name)} (${contributionPercent(factor)}%)`)
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
