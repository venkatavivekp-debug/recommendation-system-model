import { Link } from 'react-router-dom'
import FeedbackActions from './FeedbackActions'
import ImageWithFallback from './ImageWithFallback'
import SongRecommendationCard from './SongRecommendationCard'
import { fallbackArtwork } from '../utils/recommendationDisplay'

export default function DashboardFocus({
  firstName,
  workout,
  meals,
  songs,
  foodContext,
  contentLearning,
  foodLoading,
  musicLoading,
  adaptation,
  onFoodFeedback,
  onContentFeedback,
}) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const preferences = [
    ...(foodContext?.feedbackProfile?.preferenceAffinities?.cuisines || []),
    ...(foodContext?.feedbackProfile?.preferenceAffinities?.tags || []),
    ...(foodContext?.feedbackProfile?.preferenceAffinities?.ingredients || []),
    ...(contentLearning?.preferences || []),
  ].filter((item) => Number(item.weight) > 0)
    .sort((left, right) => Number(right.weight) - Number(left.weight))
    .slice(0, 5)

  return (
    <section className="dashboard-focus">
      <header className="dashboard-focus-header">
        <div>
          <h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="dashboard-user-label">CURRENT SESSION</p>
          <h2>{workout
            ? `${workout.intensity} ${workout.activityType} · ${workout.durationMinutes} min`
            : 'Your daily recommendations'}</h2>
          <p className="muted">{workout?.sessionClass?.replaceAll('_', ' ') || 'Based on your profile and recent activity'}</p>
          {workout && (workout.foodPreference || workout.musicPreference) ? (
            <p className="session-intent-summary">
              For this session{workout.foodPreference ? ` · Food: ${workout.foodPreference}` : ''}{workout.musicPreference ? ` · Music: ${workout.musicPreference}` : ''}
            </p>
          ) : null}
        </div>
        <Link className="button button-ghost" to="/exercise">Log activity</Link>
      </header>

      {adaptation ? (
        <aside className="dashboard-adaptation" aria-live="polite">
          <strong>Recent adaptation</strong>
          <span>{adaptation}</span>
        </aside>
      ) : null}

      <div className="dashboard-focus-columns">
        <div>
          <h3>For your recovery</h3>
          {meals.map((item, index) => (
            <article className="dashboard-pick" key={item.id || `${item.name}-${index}`}>
              <div className="dashboard-pick-main">
                <ImageWithFallback
                  src={item.imageUrl}
                  fallback={fallbackArtwork('food')}
                  alt={item.imageUrl ? `${item.foodName || item.name} meal image` : 'Generic meal placeholder; no provider photo supplied'}
                  className="meal-pick-image"
                />
                <div className="dashboard-pick-copy">
                  <strong>{item.foodName || item.name}</strong>
                  <span>{item.cuisineType || 'Balanced option'}{item.nutrition?.calories ? ` · ${item.nutrition.calories} kcal` : ''}</span>
                  {item.nutrition ? <div className="macro-chips"><span>Protein {item.nutrition.protein}g</span><span>Carbs {item.nutrition.carbs}g</span></div> : null}
                  {item.recommendation?.confidencePct ? <span>Fit score {Math.round(item.recommendation.confidencePct)}/100</span> : null}
                  {item.recommendation?.reason ? <span>{item.recommendation.reason}</span> : null}
                </div>
              </div>
              <FeedbackActions
                actions={['selected', 'save', 'not_interested']}
                contextType="daily"
                item={item}
                onFeedback={onFoodFeedback}
              />
            </article>
          ))}
          {foodLoading ? <p className="muted">Finding meal options for your current context…</p> : null}
          {!foodLoading && !meals.length ? <p className="muted">No meal suggestions are available right now.</p> : null}
        </div>
        <div>
          <h3>{workout ? 'Music for this workout' : 'Music for your day'}</h3>
          {songs.slice(0, 3).map((item, index) => (
            <SongRecommendationCard
              key={`focus-song-${item.id}`}
              item={item}
              isTopRecommendation={index === 0}
              onFeedback={onContentFeedback}
            />
          ))}
          {!songs.length && !musicLoading ? <p className="muted">No music suggestions are available right now.</p> : null}
          {musicLoading ? <p className="muted">Updating workout music…</p> : null}
        </div>
      </div>

      {preferences.length ? (
        <p className="adaptive-note">Your learned taste: {preferences.map((item) => `${item.label || item.key} ↑`).join(' · ')}</p>
      ) : <p className="muted">Your picks will shape future recommendations.</p>}
    </section>
  )
}
