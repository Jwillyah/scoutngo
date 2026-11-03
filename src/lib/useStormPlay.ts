import type { LatLon } from '../core/geo.ts'
import { cellCalls, cellLine, type CellCall } from '../core/stormCells.ts'
import { forming, formingLine, type Forming } from '../core/stormForming.ts'
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
  /** New cells forming nearby, backed by the HRRR or the air (Batch L, Section 3). */
  forming: Forming | null
  /** For the verdict's line and the menu's Sky card. */
  headline: string | null
}

/** Storms forming in place near the venue, from the radar's new cells, the HRRR's next hour and today's CAPE and CIN. */
export function nowForming(venue: LatLon, now: Nowcast | null, risk: StormRisk | null): Forming | null {
  if (now?.radar == null) return null
  const today = risk?.days.find((d) => d.word === 'today')?.storm ?? null
  return forming(venue, now.radar.tracks, now.hrrr, today === null ? null : { cape: today.maxCape, cin: today.minCin })
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
  const form = coming === null ? nowForming(venue, now, risk) : null
  const inPlay = on && (coming !== null || storm !== null || form !== null)
  const headline = coming !== null ? cellLine(coming, { dist, clock }) : form !== null ? formingLine(form, dist) : storm
  if (on) noteStorm(inPlay ? (coming?.arrives != null ? `Storms · arrives ~${clock(coming.arrives)}` : coming?.over ? 'Storms · over you now' : form !== null ? 'Storms · new cells forming nearby' : `Storms · ${(storm ?? '').replace(/^Storms /, '')}`) : null)
  return { inPlay, calls, coming, storm, risk, now, forming: form, headline }
}
