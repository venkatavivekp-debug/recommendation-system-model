import ContentRecommendationCard from './ContentRecommendationCard'

export default function SongRecommendationCard({
  item,
  onFeedback,
  titlePrefix = 'Suggested Music',
  isTopRecommendation = false,
}) {
  return (
    <ContentRecommendationCard
      item={item}
      variant="song"
      titlePrefix={titlePrefix}
      onFeedback={onFeedback}
      isTopRecommendation={isTopRecommendation}
    />
  )
}
