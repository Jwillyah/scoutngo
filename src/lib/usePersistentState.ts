import { useCallback, useState } from 'react'

/**
 * State backed by localStorage on this device only. There is no account and no
 * server, so this is the whole persistence story.
 *
 * `revive` takes whatever was parsed out of storage, which may be stale or from
 * an older shape, and returns something valid. It must never throw.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  revive: (raw: unknown) => T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return initial
      return revive(JSON.parse(raw) as unknown)
    } catch {
      // Storage blocked, quota full, or unparseable. Fall back, never crash.
      return initial
    }
  })

  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Private browsing or a full quota. The session still works in memory.
      }
    },
    [key],
  )

  return [value, update]
}
