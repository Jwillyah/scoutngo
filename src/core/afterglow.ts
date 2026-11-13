/*
 * THE OPPOSITE SKY (Batch NOW, Section 0; 12 Nov sunset at the Virginia
 * Beach pier: a clear west horizon, scattered cumulus lit gold overhead and
 * pink on the clouds over the ocean to the east, while the app said
 * "Unlikely: no clouds to catch the light", looking only toward the sun).
 *
 * At sunset the low sun lights the clouds on the other side of the sky too:
 * low and mid cloud within about OPPOSITE_SPREAD_DEG of the anti-solar
 * bearing, broken (AFTERGLOW_FROM to AFTERGLOW_TO per cent), turns pink from
 * the sunset to about AFTERGLOW_MIN after it, when the light can get in from
 * the sun's side (the low cloud along the sun's line, or a station that
 * reports none). Over a clear opposite horizon the Belt of Venus, the pink
 * band over the Earth's shadow, is there instead: it counts, a little
 * (BELT_SCORE, under Possible alone: it is there most clear evenings).
 * Sunrise is the mirror: the west sky before the sun is up.
 *
 * Arithmetic only. Shared by Sky fire (src/core/fireOutlook.ts) and Where's
 * the color (src/core/bestSky.ts).
 */
import { compassPoint } from './field.ts'

export const AFTERGLOW_FROM = 15
export const AFTERGLOW_TO = 70
/** The opposite sky: this far either side of the anti-solar bearing. */
export const OPPOSITE_SPREAD_DEG = 60
/** Where Sky fire asks the opposite sky, beside the point over you: 30 km out, 30° either side of the anti-solar bearing. */
export const OPPOSITE_SAMPLES = [
  { dAz: -30, km: 30 },
  { dAz: 30, km: 30 },
] as const
/** From the sunset to this long after it (from this long before a sunrise to it). */
export const AFTERGLOW_MIN = 15
/** The pink on the opposite cloud at best counts this much of the cloud lit toward the sun. */
export const AFTERGLOW_WEIGHT = 0.6
/** The light gets in from the sun's side at least this open for the pink: Sky fire's partial gap (skyColour.ts GAP_PARTIAL; not imported, skyColour reads skyFire, which reads this). */
export const AFTERGLOW_GAP = 0.3
/** The Belt of Venus alone. */
export const BELT_SCORE = 0.2
/** The light gets in from the sun's side at least this open for the Belt. */
export const BELT_GAP = 0.6

export const antiSolar = (sunAzDeg: number): number => (((sunAzDeg + 180) % 360) + 360) % 360

export const apartDeg = (a: number, b: number): number => Math.abs(((((a - b) % 360) + 540) % 360) - 180)

/** How good the opposite sky's cover is to catch the pink, 0-1: broken cloud best, none or a lid nothing. */
export function afterglowCanvas(cover: number | null): number {
  if (cover === null || !Number.isFinite(cover) || cover < AFTERGLOW_FROM) return 0
  if (cover <= AFTERGLOW_TO) return 1
  return Math.max(0, (100 - cover) / (100 - AFTERGLOW_TO))
}

/** The minutes it shows. */
export function afterglowWindow(kind: 'sunrise' | 'sunset', event: Date): { from: Date; to: Date } {
  const span = AFTERGLOW_MIN * 60_000
  return kind === 'sunset' ? { from: event, to: new Date(event.getTime() + span) } : { from: new Date(event.getTime() - span), to: event }
}

export interface AfterglowIn {
  /** The low and mid cloud over the opposite sky, per cent, sample by sample (nulls where the forecast did not say). */
  opposite: readonly { low: number | null; mid: number | null }[]
  /** The low cloud along the sun's line, per cent: what stands between the sun and that cloud. */
  sunLow: readonly (number | null)[]
  /** A station reports nothing under 6,500 ft: the low gap is open. */
  lowClear?: boolean
}

export interface AfterglowRead {
  /** The opposite sky's mean cover, the larger of low and mid, per cent. */
  cover: number | null
  canvas: number
  /** Share of the light that gets in from the sun's side, 0-1. */
  gap: number
  /** Pink on the opposite cloud: a canvas, and the light gets in at least partly. */
  fires: boolean
  /** No cloud there, the light in: the Belt of Venus. */
  belt: boolean
  /** 0-AFTERGLOW_WEIGHT. */
  score: number
}

const meanOf = (xs: readonly (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length
}

export function readAfterglow(a: AfterglowIn): AfterglowRead {
  const cover = meanOf(a.opposite.map((s) => (s.low === null && s.mid === null ? null : Math.max(s.low ?? 0, s.mid ?? 0))))
  const canvas = afterglowCanvas(cover)
  const low = meanOf(a.sunLow)
  const gap = a.lowClear === true ? 1 : low === null ? 0 : Math.max(0, 1 - low / 100)
  const fires = canvas > 0 && gap >= AFTERGLOW_GAP
  const belt = !fires && cover !== null && cover < AFTERGLOW_FROM && gap >= BELT_GAP
  const score = fires ? AFTERGLOW_WEIGHT * canvas * gap : belt ? BELT_SCORE : 0
  return { cover, canvas, gap, fires, belt, score }
}

/**
 * "Pink on the clouds over the ocean, 4:57 PM–5:12 PM · look ENE", or "Belt
 * of Venus ENE, …". `overWater`: the opposite sky is over water from here.
 * `span` writes the window (the page's clock).
 */
export function afterglowLine(r: AfterglowRead, sunAzDeg: number, overWater: boolean, window: { from: Date; to: Date }, span: (from: Date, to: Date) => string): string | null {
  const look = compassPoint(antiSolar(sunAzDeg))
  if (r.fires) return `Pink on the clouds ${overWater ? 'over the ocean' : `to the ${look}`}, ${span(window.from, window.to)} · look ${look}`
  if (r.belt) return `Belt of Venus ${look}, ${span(window.from, window.to)}`
  return null
}

/** The opposite sky is over water from a beach that faces it. */
export const facesOpposite = (facing: number | null | undefined, sunAzDeg: number): boolean => facing != null && apartDeg(facing, antiSolar(sunAzDeg)) <= OPPOSITE_SPREAD_DEG
