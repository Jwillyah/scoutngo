import { useEffect, useState, useSyncExternalStore } from 'react'
import { busyWords, onWeatherChange, weatherBusy, weatherEpoch } from './weatherStore.ts'

/*
 * THE WEATHER STORE, FOR SCREENS (src/lib/weatherStore.ts).
 *
 * useWeatherEpoch: a number that goes up when a back-off ends, for an
 * effect's dependencies, so a screen showing a stale answer asks again then.
 *
 * useWeatherBusy: the one line over the map while the service is refusing,
 * "Weather service busy, retrying in 2 min", counted down each minute. Null
 * when it is not.
 */
export function useWeatherEpoch(): number {
  return useSyncExternalStore(onWeatherChange, weatherEpoch, weatherEpoch)
}

export function useWeatherBusy(): string | null {
  const [, tick] = useState(0)
  const busy = useSyncExternalStore(onWeatherChange, () => weatherBusy()?.until ?? null, () => null)
  useEffect(() => {
    if (busy === null) return
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [busy])
  const b = weatherBusy()
  return b === null ? null : busyWords(b)
}
