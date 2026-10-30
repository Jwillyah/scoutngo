/*
 * THE COLOUR OF THE LIGHT ON A CLOUD, MINUTE BY MINUTE, FROM PHYSICS.
 *
 * For a cloud base at height h and the sun at elevation e (geometric, as
 * suncalc gives it), the light that reaches the cloud has come through some
 * amount of air, and air takes the blue out first. How much air is the whole
 * question:
 *
 *   1. REFRACTION lifts the sun, by suncalc's own formula (refractionDeg):
 *      0.48 degrees at the horizon and held there below it.
 *   2. THE CLOUD'S HORIZON is below the observer's: a cloud h metres up still
 *      sees the sun when it is up to dip = sqrt(2h/R) below the horizon. Below
 *      that the ray to the cloud passes through the ground: unlit.
 *   3. THE PATH. The ray from the cloud toward the sun is walked in steps, and
 *      the air along it is summed for two kinds of extinction: molecules
 *      (Rayleigh, scale height 8 km) and aerosol (haze, 1.5 km). A grazing ray
 *      dips low, through the densest air, which is why it comes out red.
 *      Each sum is divided by the same air stood straight up from sea level,
 *      so it is a relative air mass: 1 for the sun overhead at sea level.
 *   4. EXTINCTION at each wavelength: Rayleigh's optical depth
 *      (Hansen & Travis 1974) and aerosol's, the forecast's optical depth at
 *      550 nm with an Angstrom exponent of 1.3. Transmission is exp(-tau * m).
 *   5. COLOUR. The sun's spectrum (a 5778 K black body) times the
 *      transmission, through the CIE 1931 observer (the Wyman, Sloan and
 *      Shirley 2013 fit) to sRGB, balanced so the sun with no air at all is
 *      white. The colour is said at full brightness; how bright is apart.
 *
 * Not modelled, and said in the "i": ozone (it deepens twilight blue, not the
 * sunlit cloud), the cloud's own colour and thickness, light scattered from
 * the rest of the sky.
 */

import { CANVAS_MIN, grazingKm, PATH_KM, type ModelPath } from './skyFire.ts'

export const EARTH_R_M = 6_371_000
export const RAYLEIGH_H_M = 8_000
export const AEROSOL_H_M = 1_500
export const ANGSTROM = 1.3

const DEG = Math.PI / 180

/** How far below the horizon the sun can be and still reach a cloud h metres up: sqrt(2h/R), degrees. */
export const dipDeg = (heightM: number): number => Math.sqrt((2 * heightM) / EARTH_R_M) / DEG

/**
 * Refraction for a geometric elevation, degrees: THE SAME CONVENTION AS
 * SUNCALC (Meeus 16.4, 1.02' / tan(h + 10.26 / (h + 5.10)), held at its
 * horizon value below 0), so a time read off suncalc and a time computed here
 * cannot disagree by a convention (docs/failure-modes.md, A: two refraction
 * conventions either side of one crossing).
 */
export function refractionDeg(elevationDeg: number): number {
  const h = Math.max(0, elevationDeg)
  return 1.02 / Math.tan((h + 10.26 / (h + 5.1)) * DEG) / 60
}

/** The geometric elevation for suncalc's apparent altitude: the inverse of the line above, by bisection. */
export function geometricFromApparent(apparentDeg: number): number {
  let lo = apparentDeg - 1
  let hi = apparentDeg
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2
    if (mid + refractionDeg(mid) < apparentDeg) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Whether the sun reaches a cloud base h metres up: refraction-lifted elevation above the cloud's horizon. */
export const lit = (elevationDeg: number, heightM: number): boolean =>
  elevationDeg + refractionDeg(elevationDeg) > -dipDeg(heightM)

export interface AirMass {
  rayleigh: number
  aerosol: number
}

/**
 * Relative air mass along the ray from a cloud h metres up toward the sun.
 * Null when the ray meets the ground: unlit.
 */
export function airMass(elevationDeg: number, heightM: number): AirMass | null {
  if (!lit(elevationDeg, heightM)) return null
  const e = (elevationDeg + refractionDeg(elevationDeg)) * DEG
  const r0 = EARTH_R_M + heightM
  const step = 250
  let rayleigh = 0
  let aerosol = 0
  for (let s = step / 2; s < 1_200_000; s += step) {
    const x = s * Math.cos(e)
    const y = r0 + s * Math.sin(e)
    const z = Math.hypot(x, y) - EARTH_R_M
    if (z < 0) return null
    if (z > 100_000) break
    rayleigh += Math.exp(-z / RAYLEIGH_H_M) * step
    aerosol += Math.exp(-z / AEROSOL_H_M) * step
  }
  return { rayleigh: rayleigh / RAYLEIGH_H_M, aerosol: aerosol / AEROSOL_H_M }
}

/* ----------------------------------------------------------- the spectrum */

const WAVELENGTHS: readonly number[] = Array.from({ length: 35 }, (_, i) => 380 + i * 10)

/** Rayleigh optical depth of the whole column at sea level (Hansen & Travis 1974), lambda in nm. */
export function rayleighTau(nm: number): number {
  const um = nm / 1000
  return 0.008569 * um ** -4 * (1 + 0.0113 * um ** -2 + 0.00013 * um ** -4)
}

export const aerosolTau = (nm: number, aod550: number): number => aod550 * (nm / 550) ** -ANGSTROM

function planck(nm: number, kelvin = 5778): number {
  const m = nm * 1e-9
  return 1 / (m ** 5 * (Math.exp(1.4388e-2 / (m * kelvin)) - 1))
}

const g = (x: number, mu: number, s1: number, s2: number) => Math.exp(-0.5 * ((x - mu) / (x < mu ? s1 : s2)) ** 2)
/* CIE 1931 2-degree observer, the multi-lobe fit of Wyman, Sloan and Shirley (2013). */
const cie = (nm: number): [number, number, number] => [
  1.056 * g(nm, 599.8, 37.9, 31.0) + 0.362 * g(nm, 442.0, 16.0, 26.7) - 0.065 * g(nm, 501.1, 20.4, 26.2),
  0.821 * g(nm, 568.8, 46.9, 40.5) + 0.286 * g(nm, 530.9, 16.3, 31.1),
  1.217 * g(nm, 437.0, 11.8, 36.0) + 0.681 * g(nm, 459.0, 26.0, 13.8),
]

function linearRgb(transmission: (nm: number) => number): [number, number, number] {
  let X = 0
  let Y = 0
  let Z = 0
  for (const nm of WAVELENGTHS) {
    const p = planck(nm) * transmission(nm)
    const [x, y, z] = cie(nm)
    X += p * x
    Y += p * y
    Z += p * z
  }
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z]
}

const WHITE = linearRgb(() => 1)
const WHITE_Y = (() => {
  let Y = 0
  for (const nm of WAVELENGTHS) Y += planck(nm) * cie(nm)[1]
  return Y
})()

export interface Light {
  /** Linear RGB at full brightness, 0-1, the largest channel 1. */
  rgb: [number, number, number]
  /** Luminance against the sun with no air: 0-1. */
  brightness: number
}

/** The colour and brightness of sunlight after a path of air, white balanced to the sun above the air. */
export function lightThrough(mass: AirMass, aod550: number): Light {
  const t = (nm: number) => Math.exp(-(rayleighTau(nm) * mass.rayleigh + aerosolTau(nm, aod550) * mass.aerosol))
  const raw = linearRgb(t)
  const balanced = raw.map((v, i) => Math.max(0, v / WHITE[i])) as [number, number, number]
  const top = Math.max(...balanced, 1e-12)
  let Y = 0
  for (const nm of WAVELENGTHS) Y += planck(nm) * t(nm) * cie(nm)[1]
  return { rgb: balanced.map((v) => v / top) as [number, number, number], brightness: Y / WHITE_Y }
}

/** The light on a cloud h metres up with the sun at this geometric elevation, or null when unlit. */
export function cloudLight(elevationDeg: number, heightM: number, aod550: number): Light | null {
  const mass = airMass(elevationDeg, heightM)
  return mass === null ? null : lightThrough(mass, aod550)
}

/** sRGB hex for a light, at full brightness. */
export function lightHex(l: Light): string {
  const enc = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')
  }
  return `#${l.rgb.map(enc).join('')}`
}

/* ------------------------------------------------------------- the strips */

export type Layer = 'high' | 'mid' | 'low'
export const LAYER_WORD: Record<Layer, string> = { high: 'high cirrus', mid: 'mid deck', low: 'low deck' }

/** Minutes either side of the event the clock covers. */
export const CLOCK_FROM_MIN = -50
export const CLOCK_TO_MIN = 40

/**
 * A GLOW: orange to red, green under this share of red in linear light
 * (about sRGB #ffa500 at the edge). Past it the light is gold, then white:
 * lit, but no longer the colour anyone gets up for.
 */
export const GLOW_GREEN_BELOW = 0.4
/**
 * The deepest red is looked for only while the light is at least this share
 * of the sun above the air: dimmer, the cloud is lost against the twilight
 * sky, however red the light that reaches it.
 */
export const DEEPEST_MIN_BRIGHTNESS = 0.01

export interface StripLayer {
  layer: Layer
  heightM: number
  /** How far toward the sun the lit cloud is: the layer's own horizon, or where the forecast deck ends. */
  reachKm: number
}

export interface Minute {
  at: Date
  light: Light | null
}

export interface Strip extends StripLayer {
  minutes: Minute[]
}

/**
 * The cloud a ground observer sees lit first is the most sunward part of the
 * deck still above their horizon: sqrt(2Rh) away at most, and no further than
 * the forecast has the deck. There the sun stands higher by the angle the
 * Earth turns over that distance, reachKm / R.
 */
export function strip(
  layer: StripLayer,
  event: Date,
  /** Suncalc's apparent altitude at the observer, degrees. */
  sunAltitudeDeg: (t: Date) => number,
  aod550: number,
): Strip {
  const lift = ((layer.reachKm * 1000) / EARTH_R_M) / DEG
  const minutes: Minute[] = []
  for (let m = CLOCK_FROM_MIN; m <= CLOCK_TO_MIN; m += 1) {
    const at = new Date(event.getTime() + m * 60_000)
    minutes.push({ at, light: cloudLight(geometricFromApparent(sunAltitudeDeg(at)) + lift, layer.heightM, aod550) })
  }
  return { ...layer, minutes }
}

/**
 * How far toward the sun a layer's lit cloud is, from the forecast along the
 * sun's line (src/core/skyFire.ts): the farthest sample with the layer there
 * (CANVAS_MIN or more) that is still above the observer's horizon,
 * sqrt(2Rh). Null when the forecast has no such layer on the line.
 */
export function reachKm(path: ModelPath | undefined, layer: Layer, heightM: number): number | null {
  if (path === undefined) return null
  const horizon = grazingKm(heightM)
  let far: number | null = null
  PATH_KM.forEach((km, i) => {
    const cover = path.samples[i]?.[layer]
    if (cover != null && cover >= CANVAS_MIN && km <= horizon) far = km
  })
  return far
}

const glows = (l: Light | null): boolean => l !== null && l.rgb[1] < GLOW_GREEN_BELOW * l.rgb[0]

export interface StripTimes {
  firstLit: Date | null
  lastLit: Date | null
  glowFrom: Date | null
  glowTo: Date | null
  /** The reddest minute bright enough to see (DEEPEST_MIN_BRIGHTNESS). */
  deepest: Date | null
}

export function stripTimes(s: Strip): StripTimes {
  const lit = s.minutes.filter((m) => m.light !== null)
  const glow = s.minutes.filter((m) => glows(m.light))
  /* The reddest light bright enough to be seen: the least green against red. */
  let deepest: Minute | null = null
  for (const m of glow) {
    const l = m.light as Light
    if (l.brightness < DEEPEST_MIN_BRIGHTNESS) continue
    if (deepest === null || l.rgb[1] < (deepest.light as Light).rgb[1]) deepest = m
  }
  return {
    firstLit: lit[0]?.at ?? null,
    lastLit: lit.at(-1)?.at ?? null,
    glowFrom: glow[0]?.at ?? null,
    glowTo: glow.at(-1)?.at ?? null,
    deepest: deepest?.at ?? null,
  }
}

/** How long before the first light to be standing ready. */
export const SET_UP_MIN = 5

/**
 * The words, computed from the strips: which layer fires first, each glow,
 * the deepest red, and when to be set up. Sunrise reads forward; at sunset
 * the high cloud is lit last, and that is what is said.
 */
export function clockWords(strips: readonly Strip[], kind: 'sunrise' | 'sunset', clock: (d: Date) => string): string {
  const timed = strips.map((s) => ({ s, t: stripTimes(s) })).filter((x) => x.t.firstLit !== null)
  if (timed.length === 0) return 'No cloud the forecast has is lit in this hour.'
  const parts: string[] = []
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
  if (kind === 'sunrise') {
    const first = [...timed].sort((a, b) => (a.t.firstLit as Date).getTime() - (b.t.firstLit as Date).getTime())[0]
    if (timed.length > 1) parts.push(`${cap(LAYER_WORD[first.s.layer])} fires first ${clock(first.t.firstLit as Date)}`)
    for (const x of [...timed].sort((a, b) => (a.t.glowFrom?.getTime() ?? Infinity) - (b.t.glowFrom?.getTime() ?? Infinity))) {
      if (timed.length > 1 && x === first) continue
      if (x.t.glowFrom !== null && x.t.glowTo !== null) parts.push(`${LAYER_WORD[x.s.layer]} glows ${clock(x.t.glowFrom)}–${clock(x.t.glowTo)}`)
    }
  } else {
    for (const x of timed) {
      if (x.t.glowFrom !== null && x.t.glowTo !== null) parts.push(`${LAYER_WORD[x.s.layer]} glows ${clock(x.t.glowFrom)}–${clock(x.t.glowTo)}`)
    }
    const last = [...timed].sort((a, b) => (b.t.lastLit as Date).getTime() - (a.t.lastLit as Date).getTime())[0]
    if (timed.length > 1) parts.push(`${LAYER_WORD[last.s.layer]} lit last, until ${clock(last.t.lastLit as Date)}`)
  }
  /* The deepest red of the lowest layer that glows: the low deck carries the most colour when it is there. */
  const order: Layer[] = ['low', 'mid', 'high']
  const red = order.map((l) => timed.find((x) => x.s.layer === l)).find((x) => x?.t.deepest != null)
  if (red?.t.deepest != null) parts.push(`deepest red ${clock(red.t.deepest)}`)
  const starts = timed.map((x) => (x.t.glowFrom ?? x.t.firstLit) as Date).sort((a, b) => a.getTime() - b.getTime())
  parts.push(`be set up by ${clock(new Date(starts[0].getTime() - SET_UP_MIN * 60_000))}`)
  const line = parts.join(' · ')
  return line[0].toUpperCase() + line.slice(1)
}
