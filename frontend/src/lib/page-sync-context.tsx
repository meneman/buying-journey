import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type SyncStatus = 'loading' | 'saving' | 'synced' | 'error'

interface PageSyncContextValue {
  status: SyncStatus
  reload: () => void
  /** Called by whichever page is active to report its own sync state and reload function. */
  publish: (status: SyncStatus, reload: () => void) => void
}

const PageSyncContext = createContext<PageSyncContextValue | null>(null)

export function PageSyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>('synced')
  const reloadRef = useRef<() => void>(() => {})

  const publish = useCallback((nextStatus: SyncStatus, reloadFn: () => void) => {
    setStatus(nextStatus)
    reloadRef.current = reloadFn
  }, [])

  const reload = useCallback(() => reloadRef.current(), [])

  return <PageSyncContext.Provider value={{ status, reload, publish }}>{children}</PageSyncContext.Provider>
}

export function usePageSync() {
  const ctx = useContext(PageSyncContext)
  if (!ctx) throw new Error('usePageSync must be used within a PageSyncProvider')
  return ctx
}
