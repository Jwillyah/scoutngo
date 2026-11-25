import { useMemo } from 'react'
import type { LatLon } from '../core/geo.ts'
import { skyCalls, type SkyCalls } from '../core/skyCall.ts'
import { formatClock } from '../core/timezone.ts'
import { hourlyAt } from './tideSheetData.ts'
import type { Briefing } from './useBriefing.ts'
import { useOnline } from './useOnline.ts'
import { useStationNow } from './useStationNow.ts'
import { useFogRain } from './useFogRain.ts'

/*
 * THE ONE SKY CALL, FOR A SCREEN (Batch SIMPLE-3, Section 0.2). The home tile,
 * its moment card, the Go alert, Sky Tonight and the Sky color page all read
 * this: the shared briefing's days (src/lib/useBriefing.ts, one set of inputs
 * per spot), the nearest station's report (src/lib/useStationNow.ts, one per
 * place) and the models' deck motion, at the minute, through
 * src/core/skyCall.ts skyCalls. Same spot, same minute: the same object.
 *
 * THE FOG IS IN IT (Batch SIMPLE-3, Section 1.3): the spot's fog at each
 * event (src/lib/useFogRain.ts, the one fog source) goes into skyCalls, so a
 * beach call dropped for sea fog is dropped on every screen that reads this,
 * the home tile and the Go alert as much as the Sky page.
 */
export function useSkyCalls(brief: Briefing, venue: LatLon | null, now: Date, timeZone: string): SkyCalls {
  const minute = Math.floor(now.getTime() / 60_000)
  const online = useOnline()
  const station = useStationNow(venue, now, online)
  const stationAt = station === null || station.at === '' ? null : new Date(station.at).getTime()
  const fogAt = useFogRain(venue, now, timeZone, { facing: brief.facing }).fogAt
  return useMemo(() => {
    if (venue === null) return { now: null, sunrise: null, sunset: null }
    const at = new Date(minute * 60_000)
    const wx = brief.wx
    const cover = (layer: 'low' | 'mid', t: Date) => (wx === null ? null : hourlyAt(wx, layer === 'low' ? 'cloud_cover_low' : 'cloud_cover_mid', t))
    const aloft = wx === null ? null : hourlyAt(wx, 'wind_speed_500hPa', at)
    const aloftFrom = wx === null ? null : hourlyAt(wx, 'wind_direction_500hPa', at)
    const motion = aloft === null || aloftFrom === null ? null : { fromDeg: aloftFrom, mps: aloft }
    return skyCalls(brief.days, at, venue, station === null || stationAt === null ? null : { sky: station.sky, at: new Date(stationAt) }, cover, motion, (d) => formatClock(d, timeZone), fogAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, venue?.lat, venue?.lon, minute, station, stationAt, timeZone, fogAt])
}
