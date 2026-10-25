/*
 * TONIGHT'S SKY, AS THINGS TO POINT AT.
 *
 *   moon            where it is and how lit, from suncalc
 *   galactic core   the Milky Way's bright centre (celestial.ts GALACTIC_CORE)
 *   celestial pole  the point the stars turn around: due north at an altitude
 *                   equal to the latitude (due south, south of the equator).
 *                   Polaris sits within a degree of it in the north.
 *   radiants        meteor showers within RADIANT_DAYS of their peak, at the
 *                   point their meteors appear to come from
 *
 * All arithmetic, the same sidereal conversion the Milky Way planner uses. The
 * moment is the middle of tonight's full dark when there is one, else civil
 * dusk, else the instant asked for: the picture is of a night sky.
 */
import { getMoonIllumination, getMoonPosition, getTimes } from 'suncalc'
import { equatorialToHorizontal, GALACTIC_CORE, SHOWERS } from './celestial.ts'
import { normalizeBearing } from './sun.ts'

/** A shower is drawn within this many days of its peak. */
export const RADIANT_DAYS = 3

export type SkyThingKind = 'moon' | 'core' | 'pole' | 'radiant'

export interface SkyThing {
  kind: SkyThingKind
  name: string
  azimuth: number
  altitude: number
  /** Moon only: 0 new to 1 full. */
  illumination?: number
}

const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

/** When "tonight" is drawn: the middle of full dark, else dusk, else the instant given. */
export function tonightMoment(at: Date, lat: number, lon: number): Date {
  const noonish = new Date(at.getTime())
  const t = getTimes(noonish, lat, lon)
  if (usable(t.night) && usable(t.nightEnd)) {
    const end = t.nightEnd.getTime() < t.night.getTime() ? t.nightEnd.getTime() + 86_400_000 : t.nightEnd.getTime()
    return new Date((t.night.getTime() + end) / 2)
  }
  if (usable(t.dusk)) return t.dusk
  return at
}

/** Day of year distance between two month/day pairs, wrapping the year. */
function daysFromPeak(at: Date, month: number, day: number): number {
  const year = at.getUTCFullYear()
  let best = Infinity
  for (const y of [year - 1, year, year + 1]) {
    const peak = Date.UTC(y, month - 1, day)
    best = Math.min(best, Math.abs(at.getTime() - peak) / 86_400_000)
  }
  return best
}

export function nightSky(at: Date, lat: number, lon: number): SkyThing[] {
  const moon = getMoonPosition(at, lat, lon)
  const things: SkyThing[] = [
    {
      kind: 'moon',
      name: 'Moon',
      azimuth: normalizeBearing(moon.azimuth),
      altitude: moon.altitude,
      illumination: getMoonIllumination(at).fraction,
    },
    { kind: 'core', name: 'Milky Way core', ...equatorialToHorizontal(GALACTIC_CORE.ra, GALACTIC_CORE.dec, lat, lon, at) },
    lat >= 0
      ? { kind: 'pole', name: 'North celestial pole', azimuth: 0, altitude: lat }
      : { kind: 'pole', name: 'South celestial pole', azimuth: 180, altitude: -lat },
  ]
  for (const shower of SHOWERS) {
    if (daysFromPeak(at, shower.peakMonth, shower.peakDay) > RADIANT_DAYS) continue
    things.push({
      kind: 'radiant',
      name: `${shower.name} radiant`,
      ...equatorialToHorizontal(shower.radiantRa, shower.radiantDec, lat, lon, at),
    })
  }
  return things
}
