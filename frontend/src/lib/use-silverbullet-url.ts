import { useEffect, useState } from 'react'

/** Fetches the configured SilverBullet base URL once, so it isn't hardcoded in the frontend. */
export function useSilverBulletUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('config unavailable'))))
      .then((config: { silverBulletUrl?: string }) => {
        if (!cancelled && config.silverBulletUrl) setUrl(config.silverBulletUrl)
      })
      .catch(() => {
        /* silently hide the "open in SilverBullet" action if config isn't reachable */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return url
}
