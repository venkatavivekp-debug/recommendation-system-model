import { useEffect, useState } from 'react'

export default function ImageWithFallback({ src, fallback, alt, className = '' }) {
  const [activeSrc, setActiveSrc] = useState(src || fallback)

  useEffect(() => {
    setActiveSrc(src || fallback)
  }, [src, fallback])

  return (
    <img
      src={activeSrc || fallback}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        if (activeSrc !== fallback) {
          setActiveSrc(fallback)
        }
      }}
    />
  )
}
