function createSvgPlaceholder(title, subtitle, variant = 'restaurant') {
  const safeTitle = String(title || '').slice(0, 28);
  const safeSubtitle = String(subtitle || '').slice(0, 40);
  const colorA = variant === 'food' ? '#ff9f1c' : '#2d8fdd';
  const colorB = variant === 'food' ? '#ffbf69' : '#a8dadc';

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${colorA}" />
        <stop offset="100%" stop-color="${colorB}" />
      </linearGradient>
    </defs>
    <rect width="800" height="520" fill="url(#g)" />
    <circle cx="660" cy="90" r="120" fill="rgba(255,255,255,0.18)" />
    <circle cx="130" cy="430" r="140" fill="rgba(255,255,255,0.15)" />
    <rect x="72" y="150" width="656" height="220" rx="22" fill="rgba(16,32,47,0.34)" />
    <text x="400" y="240" text-anchor="middle" font-size="50" font-family="Arial, sans-serif" fill="#ffffff" font-weight="700">
      ${safeTitle || 'BFIT'}
    </text>
    <text x="400" y="292" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" fill="#f8fbff">
      ${safeSubtitle || 'Preview'}
    </text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildRestaurantImage(name, cuisine) {
  return createSvgPlaceholder(name || 'Restaurant', cuisine || 'Local dining', 'restaurant');
}

function buildFoodImage(foodName) {
  return createSvgPlaceholder(foodName || 'Food Item', 'Nutrition ready', 'food');
}

function compactReviewSnippet(reviewText) {
  const text = String(reviewText || '').trim();
  if (!text) {
    return '';
  }

  if (text.length <= 130) {
    return text;
  }

  return `${text.slice(0, 127)}...`;
}

module.exports = {
  buildRestaurantImage,
  buildFoodImage,
  compactReviewSnippet,
};
