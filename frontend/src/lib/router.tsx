import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface RouterState {
  pathname: string
  search: URLSearchParams
}

interface RouterContextValue extends RouterState {
  navigate: (to: string) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

function readState(): RouterState {
  return {
    pathname: window.location.pathname,
    search: new URLSearchParams(window.location.search),
  }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RouterState>(readState)

  useEffect(() => {
    const onPopState = () => setState(readState())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string) => {
    if (to === `${window.location.pathname}${window.location.search}`) return
    window.history.pushState({}, '', to)
    setState(readState())
    window.scrollTo(0, 0)
  }, [])

  return <RouterContext.Provider value={{ ...state, navigate }}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used within a RouterProvider')
  return ctx
}

/** The active journey id, read from the `?journey=` query param (defaults to "bike"). */
export function useJourney(): string {
  const { search } = useRouter()
  return search.get('journey') || 'bike'
}

/** Builds an href for a route, preserving the current journey query param. */
export function useJourneyHref() {
  const journey = useJourney()
  return (pathname: string) => `${pathname}?journey=${encodeURIComponent(journey)}`
}
