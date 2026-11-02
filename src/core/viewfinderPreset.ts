/*
 * THE VIEWFINDER OPENS READY (Batch I, Section 2): with the next event set
 * and the right lens on.
 *
 *   the event   the next sunrise, sunset or moonrise in the coming day; a
 *               moonrise only when the moon is half lit or more (a thin
 *               moon is not the shot), suncalc's times
 *   the lens    for a sunrise or sunset, SKY_MM (28 mm) on a lens that
 *               covers it: wide enough for the canvas, and inside the
 *               phone camera's own field, so the frame can be drawn (an
 *               ultra-wide is wider than the phone and the viewfinder says
 *               so); with none, the widest lens at its widest. For a
 *               moonrise, the longest at its longest: the moon is small.
 *               None in the bag: none.
 */
import { getMoonIllumination, getTimes } from 'suncalc'
import { moonTimesOnLocalDay } from './moonTimes.ts'
import type { LatLon } from './geo.ts'

export type PresetEvent = 'sunrise' | 'sunset' | 'moonrise'
export interface ViewfinderPreset {
  event: PresetEvent
  at: Date
  lensId: string | null
  focal: number | null
}

export const MOON_LIT_ENOUGH = 0.5
export const SKY_MM = 28

interface LensLike {
  id: string
  minFocalLength: number
  maxFocalLength: number
}

export function nextEventFor(now: Date, at: LatLon): { event: PresetEvent; at: Date } | null {
  const ok = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())
  const found: { event: PresetEvent; at: Date }[] = []
  for (const shift of [0, 1]) {
    const day = new Date(now.getTime() + shift * 86_400_000)
    const t = getTimes(day, at.lat, at.lon)
    if (ok(t.sunrise)) found.push({ event: 'sunrise', at: t.sunrise })
    if (ok(t.sunset)) found.push({ event: 'sunset', at: t.sunset })
    /* The venue's own day, not suncalc's UTC one (src/core/moonTimes.ts). */
    const m = moonTimesOnLocalDay(day, at.lat, at.lon)
    if (ok(m.rise) && getMoonIllumination(m.rise).fraction >= MOON_LIT_ENOUGH) found.push({ event: 'moonrise', at: m.rise })
  }
  return found.filter((e) => e.at.getTime() > now.getTime() - 15 * 60_000 && e.at.getTime() < now.getTime() + 86_400_000).sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null
}

export function lensFor(event: PresetEvent, lenses: readonly LensLike[]): { lensId: string | null; focal: number | null } {
  if (lenses.length === 0) return { lensId: null, focal: null }
  if (event === 'moonrise') {
    const l = [...lenses].sort((a, b) => b.maxFocalLength - a.maxFocalLength)[0]
    return { lensId: l.id, focal: l.maxFocalLength }
  }
  const covers = lenses.find((l) => l.minFocalLength <= SKY_MM && l.maxFocalLength >= SKY_MM)
  if (covers !== undefined) return { lensId: covers.id, focal: SKY_MM }
  const l = [...lenses].sort((a, b) => a.minFocalLength - b.minFocalLength)[0]
  return { lensId: l.id, focal: l.minFocalLength }
}

export function viewfinderPreset(now: Date, at: LatLon, lenses: readonly LensLike[]): ViewfinderPreset | null {
  const next = nextEventFor(now, at)
  if (next === null) return null
  return { ...next, ...lensFor(next.event, lenses) }
}
