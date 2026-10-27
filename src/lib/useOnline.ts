import { useEffect, useState } from 'react'
import { isOnline, onConnectivity } from './offlineCache.ts'

/**
 * Whether there is a connection, as the venue bar's quiet mark shows it.
 *
 * NOT navigator.onLine ALONE, and not the last request either: see
 * src/lib/connectivity.ts. Offline is the app's own origin failing a check
 * twice; one source refusing says nothing about the others, and the first
 * success anywhere clears it.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline)
  useEffect(() => onConnectivity(setOnline), [])
  return online
}
