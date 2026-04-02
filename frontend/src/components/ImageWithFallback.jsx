import { useEffect, useState } from 'react'

export default function ImageWithFallback({ src, fallback, alt, className = '' }) {
  const [activeSrc, setActiveSrc] = useState(src || fallback)

  useEffect(() => {
    const nextSrc = src || fallback
    setActiveSrc((prev) => (prev === nextSrc ? prev : nextSrc))
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
