import ContentRecommendationCard from './ContentRecommendationCard'

export default function MovieRecommendationCard({ item, onFeedback }) {
  return (
    <ContentRecommendationCard
      item={item}
      variant="movie"
      titlePrefix="Suggested While Eating"
      onFeedback={onFeedback}
    />
  )
}
