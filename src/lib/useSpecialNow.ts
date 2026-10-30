import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import type { Special } from '../core/specialLight.ts'
import { fetchSpecialWeek, specialsFrom } from './specialLightData.ts'
import { useWeatherEpoch } from './useWeatherStatus.ts'

/*
 * SPECIAL LIGHT ON NOW, for the one status line over the map: fog, a
 * rainbow or god rays whose window holds `at`. Asked once per venue (the
 * same request Sky › Special makes), never while offline.
 */
export function useSpecialNow(venue: LatLon | null, at: Date | null): Special | null {
  const key = venue === null ? null : `${venue.lat},${venue.lon}`
  const [answer, setAnswer] = useState<{ key: string; list: Special[] } | null>(null)
  const epoch = useWeatherEpoch()
  useEffect(() => {
    if (venue === null || key === null) return
    let live = true
    void fetchSpecialWeek(venue).then((w) => {
      if (live && w !== null) setAnswer({ key, list: specialsFrom(w.week, venue, w.seaCAt) })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, epoch])
  if (answer === null || answer.key !== key || at === null) return null
  return answer.list.find((s) => s.from <= at && at < s.to) ?? null
}
