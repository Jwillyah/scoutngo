import type { LatLon } from '../core/geo.ts'
import { cellCalls, cellLine, type CellCall } from '../core/stormCells.ts'
import { stormLine } from '../core/stormRisk.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import { useNowcast, type Nowcast } from './stormData.ts'
import { noteStorm, useStormRisk, type StormRisk } from './stormRiskData.ts'
import type { Units } from './units.ts'

/* Whether storms are in play today, for Today (StormToday.tsx) and the menu's Sky card (Batch K addendum, B). */
export interface StormPlay {
  inPlay: boolean
  calls: CellCall[]
  coming: CellCall | null
  storm: string | null
  risk: StormRisk | null
  now: Nowcast | null
  /** For the verdict's line and the menu's Sky card. */
  headline: string | null
}

export function useStormPlay(venue: LatLon, timeZone: string, units: Units, on: boolean): StormPlay {
  const now = useNowcast(venue, on)
  const risk = useStormRisk(venue, timeZone, on)
  const dist = units.distance === 'ft' ? 'mi' : 'km'
  const clock = (d: Date) => formatClock(d, timeZone)
  const calls = now?.radar == null ? [] : cellCalls(venue, now.radar.tracks, now.radar.scanAt)
  const coming = calls.find((c) => c.over || c.arrives !== null) ?? null
  const today = risk?.days.find((d) => d.word === 'today') ?? null
  const storm = today === null ? null : stormLine(today.storm, (d) => formatShortHour(d, timeZone), 'today')
  const inPlay = on && (coming !== null || storm !== null)
  const headline = coming !== null ? cellLine(coming, { dist, clock }) : storm
  if (on) noteStorm(inPlay ? (coming?.arrives != null ? `Storms · arrives ~${clock(coming.arrives)}` : coming?.over ? 'Storms · over you now' : `Storms · ${(storm ?? '').replace(/^Storms /, '')}`) : null)
  return { inPlay, calls, coming, storm, risk, now, headline }
}
