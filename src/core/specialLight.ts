/*
 * SPECIAL LIGHT: fog, rainbows, god rays, from forecast numbers by rules
 * written down here. Each finding carries when, how many models agree, and
 * one line of why. Never a promise: "possible" or "likely", nothing more.
 *
 *   FOG / MARINE LAYER  the dew point within FOG_SPREAD_F of the air, wind
 *                       under FOG_WIND_KT, and the sea colder than the air
 *                       where there is a sea (advection fog). Inland the sea
 *                       term is left out and the line says radiation fog.
 *   RAINBOW             showers within ~30 km and the sun up but under
 *                       RAINBOW_DEG: the bow is a circle RAINBOW_DEG round the
 *                       point opposite the sun, so with the sun higher the
 *                       whole bow is below the horizon.
 *   GOD RAYS            broken low cloud, GOD_RAYS_LOW cover, with the sun
 *                       low (up to GOD_RAYS_SUN_MAX) behind it.
 */
import { normalizeBearing } from './sun.ts'

export const FOG_SPREAD_F = 2
export const FOG_WIND_KT = 6
export const RAINBOW_DEG = 42
export const SHOWERS_MM = 0.1
export const GOD_RAYS_LOW: readonly [number, number] = [30, 80]
export const GOD_RAYS_SUN_MAX = 25
/** Share of the models that must agree for "likely". */
export const LIKELY_SHARE = 0.6

const DEG = Math.PI / 180

/* ------------------------------------------------------------------ fog */

export interface FogInput {
  tempF: number | null
  dewF: number | null
  windKt: number | null
  /** The sea's surface temperature, °C, or null inland. */
  seaC: number | null
}

export const fToC = (f: number): number => ((f - 32) * 5) / 9

/** Null when a number the rule needs is missing: not "no fog", "could not say". */
export function fogRule(h: FogInput): boolean | null {
  if (h.tempF === null || h.dewF === null || h.windKt === null) return null
  const close = h.tempF - h.dewF <= FOG_SPREAD_F
  const calm = h.windKt < FOG_WIND_KT
  const sea = h.seaC === null ? true : h.seaC < fToC(h.tempF)
  return close && calm && sea
}

/* -------------------------------------------------------------- rainbow */

export interface SkyPoint {
  azimuth: number
  altitude: number
}

const toVec = (p: SkyPoint): [number, number, number] => {
  const a = p.azimuth * DEG
  const e = p.altitude * DEG
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]
}
const fromVec = (v: readonly number[]): SkyPoint => ({
  azimuth: normalizeBearing(Math.atan2(v[0], v[1]) / DEG),
  altitude: Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG,
})

/** The point opposite the sun: the bow's centre. */
export const antisolar = (sun: SkyPoint): SkyPoint => ({ azimuth: normalizeBearing(sun.azimuth + 180), altitude: -sun.altitude })

/** Angular distance between two sky points, degrees. */
export function angleBetween(a: SkyPoint, b: SkyPoint): number {
  const [x, y] = [toVec(a), toVec(b)]
  return Math.acos(Math.max(-1, Math.min(1, x[0] * y[0] + x[1] * y[1] + x[2] * y[2]))) / DEG
}

/**
 * The bow above the horizon: points RAINBOW_DEG from the antisolar point,
 * every `stepDeg` round it, kept where they are above the horizon. Empty when
 * the sun is RAINBOW_DEG or more up.
 */
export function rainbowArc(sun: SkyPoint, stepDeg = 2): SkyPoint[] {
  const c = toVec(antisolar(sun))
  /* Two unit vectors at right angles to the centre. */
  const up: [number, number, number] = Math.abs(c[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1]
  const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const norm = (v: [number, number, number]): [number, number, number] => {
    const n = Math.hypot(...v)
    return [v[0] / n, v[1] / n, v[2] / n]
  }
  const u = norm(cross(c, up))
  const v = cross(c, u)
  const r = RAINBOW_DEG * DEG
  const out: SkyPoint[] = []
  for (let t = 0; t < 360; t += stepDeg) {
    const th = t * DEG
    const p = [0, 1, 2].map((i) => Math.cos(r) * c[i] + Math.sin(r) * (Math.cos(th) * u[i] + Math.sin(th) * v[i]))
    const sp = fromVec(p)
    if (sp.altitude >= 0) out.push(sp)
  }
  /* In order along the bow, from one foot to the other. */
  return out.sort((a, b) => signedFrom(antisolar(sun).azimuth, a.azimuth) - signedFrom(antisolar(sun).azimuth, b.azimuth))
}

const signedFrom = (centre: number, az: number): number => ((az - centre + 540) % 360) - 180

/** How far either side of the antisolar bearing the bow's feet stand on the horizon: cos 42 = cos(sun) cos(half). Null when no bow. */
export function bowHalfWidthDeg(sunAltitude: number): number | null {
  if (sunAltitude <= 0 || sunAltitude >= RAINBOW_DEG) return null
  return Math.acos(Math.cos(RAINBOW_DEG * DEG) / Math.cos(sunAltitude * DEG)) / DEG
}

export const rainbowRule = (sunAltitude: number, showersNearMm: number | null): boolean | null =>
  showersNearMm === null ? null : sunAltitude > 0 && sunAltitude < RAINBOW_DEG && showersNearMm >= SHOWERS_MM

/* ------------------------------------------------------------- god rays */

export const godRaysRule = (sunAltitude: number, lowCover: number | null): boolean | null =>
  lowCover === null ? null : sunAltitude > 0 && sunAltitude <= GOD_RAYS_SUN_MAX && lowCover >= GOD_RAYS_LOW[0] && lowCover <= GOD_RAYS_LOW[1]

/* ------------------------------------------------------------- the list */

export type SpecialKind = 'fog' | 'rainbow' | 'rays' | 'glass' | 'fire'

export interface Special {
  kind: SpecialKind
  from: Date
  to: Date
  /** Models that said yes at the best hour, of those that said anything. */
  agree: number
  of: number
  word: 'possible' | 'likely'
  why: string
}

export const SPECIAL_NAME: Record<SpecialKind, string> = { fog: 'Fog', rainbow: 'Rainbow', rays: 'God rays', glass: 'Glassy water', fire: 'Sky fire' }

/**
 * Hours where at least one model says yes, joined into windows. `byModel[m][h]`
 * is model m's answer at hour h (null: it could not say).
 */
export function windows(kind: SpecialKind, hours: readonly Date[], byModel: readonly (readonly (boolean | null)[])[], why: (h: number) => string): Special[] {
  const out: Special[] = []
  let open: { from: number; to: number; agree: number; of: number; best: number } | null = null
  const close = () => {
    if (open === null) return
    const share = open.of === 0 ? 0 : open.agree / open.of
    out.push({ kind, from: hours[open.from], to: new Date(hours[open.to].getTime() + 3_600_000), agree: open.agree, of: open.of, word: share >= LIKELY_SHARE ? 'likely' : 'possible', why: why(open.best) })
    open = null
  }
  for (let h = 0; h < hours.length; h += 1) {
    const said = byModel.map((m) => m[h]).filter((v): v is boolean => v !== null && v !== undefined)
    const yes = said.filter(Boolean).length
    if (yes === 0) {
      close()
      continue
    }
    if (open === null) open = { from: h, to: h, agree: yes, of: said.length, best: h }
    else {
      open.to = h
      if (yes / said.length > open.agree / Math.max(1, open.of)) Object.assign(open, { agree: yes, of: said.length, best: h })
    }
  }
  close()
  return out
}

/** "Fog possible 6–8 AM" from a window, with the span written by the caller's clock. */
export function specialLine(s: Special, span: (from: Date, to: Date) => string): string {
  return `${SPECIAL_NAME[s.kind]} ${s.word} ${span(s.from, s.to)}`
}
