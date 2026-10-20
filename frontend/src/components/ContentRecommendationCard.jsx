import { useState } from 'react'
import {
  contentFactorLabel,
  contentTags,
  contributionPercent,
  matchPercent,
  policyScoreSummary,
} from '../utils/recommendationDisplay'
import FeedbackActions from './FeedbackActions'

export default function ContentRecommendationCard({
  item,
  variant = 'movie',
  titlePrefix = '',
  onFeedback,
  isTopRecommendation = false,
}) {
  const [failedImage, setFailedImage] = useState(null)
  if (!item) {
    return null
  }

  const confidence = matchPercent(item.confidencePct, item.confidence, item.score)
  const tags = contentTags(item, variant)
  const hasArtwork = item.imageUrl && failedImage !== item.imageUrl

  return (
    <article className={`content-card ${variant === 'song' ? 'content-card-song' : 'content-card-movie'}`}>
      <div className="content-card-heading">
        {hasArtwork ? (
          <img src={item.imageUrl} alt={`${item.title} artwork`} className="content-artwork" loading="lazy" onError={() => setFailedImage(item.imageUrl)} />
        ) : (
          <div className="content-artwork-fallback" role="img" aria-label="Artwork unavailable">
            <span aria-hidden="true">{variant === 'song' ? '♪' : '▶'}</span>
            <small>Artwork unavailable</small>
          </div>
        )}
        <div>
          <h3>{variant !== 'song' && titlePrefix ? `${titlePrefix}: ${item.title}` : item.title}</h3>
          <p className="muted">{variant === 'song' ? item.artist || 'Unknown artist' : item.type || 'Movie'}</p>
        </div>
      </div>
      {isTopRecommendation ? <div className="badge-row">
        <span className="pill">Top pick</span>
      </div> : null}
      {tags.length ? (
        <div className="badge-row insight-tags">
          {tags.map((tag) => <span className="pill" key={tag}>{tag}</span>)}
        </div>
      ) : null}
      <div className="confidence-meter" aria-label={`Recommendation fit score ${confidence} out of 100`}>
        <span>Fit score {confidence}/100</span>
      </div>
      {item.reason ? <p>{item.reason}</p> : null}
      {item.recommendation?.scoreTrace || (Array.isArray(item.topFactors) && item.topFactors.length) ? (
        <details className="score-details">
          <summary>Scoring details</summary>
          {item.recommendation?.scoreTrace ? <p className="helper-note">{policyScoreSummary(item.recommendation.scoreTrace)}</p> : <p className="helper-note">{item.topFactors.slice(0, 3).map((factor) => `${contentFactorLabel(factor.name)} (${contributionPercent(factor)}%)`).join(' · ')}</p>}
        </details>
      ) : null}
      {onFeedback ? <FeedbackActions
        actions={['selected', 'helpful', 'save', 'not_interested']}
        contextType={item.contextType || item.context?.contextType || 'daily'}
        item={item}
        onFeedback={onFeedback}
      /> : null}
      <div className="actions-grid">
        <a className="button button-ghost" href={item.sourceUrl} target="_blank" rel="noreferrer">
          Open Source
        </a>
      </div>
    </article>
  )
}
