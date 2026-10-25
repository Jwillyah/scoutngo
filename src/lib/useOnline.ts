import { useEffect, useState } from 'react'
import { isOnline, onConnectivity } from './offlineCache.ts'

/**
 * Whether there is a connection, as the venue bar's quiet mark shows it.
 *
 * NOT navigator.onLine ALONE, which is true on a mountain with the radio on
 * and no bars. It is also what the network has done lately: see isOnline in
 * src/lib/offlineCache.ts. A tile or a forecast that could not be reached
 * marks it, and the next one that arrives clears it.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline)
  useEffect(() => onConnectivity(setOnline), [])
  return online
}
