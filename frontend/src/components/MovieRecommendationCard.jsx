import ContentRecommendationCard from './ContentRecommendationCard'

export default function MovieRecommendationCard({ item, onFeedback, isTopRecommendation = false }) {
  return (
    <ContentRecommendationCard
      item={item}
      variant="movie"
      titlePrefix="Suggested While Eating"
      onFeedback={onFeedback}
      isTopRecommendation={isTopRecommendation}
    />
  )
}
