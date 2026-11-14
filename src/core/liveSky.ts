/*
 * THE LIVE SKY BEHIND THE PAGE (Batch LIVE, Section 7). The background shows
 * the sky at the spot, from the same computed state as the sky word
 * (src/core/skyWord.ts skyCondition): the sun's height, the cloud by layer,
 * rain and fog from the forecast's code, the moon. Eight states:
 *
 *   clear-day     blue, as before
 *   cloudy        soft cloud shapes over blue, as many as the cover
 *   overcast      a textured grey-blue deck
 *   rain          a darker deck, faint streaks
 *   fog           haze
 *   golden        the warm gradients (the sun under GOLDEN_SUN_DEG)
 *   night-clear   dark navy, stars by the clear share and the darkness, the
 *                 moon at its real phase and place
 *   night-cloudy  dark, dim cloud, no stars
 *
 * The page draws it (src/components/LiveSky.tsx); this decides it.
 */
import { GOLDEN_SUN_DEG, NIGHT_SUN_DEG, type Ground } from './homeDay.ts'

export type LiveSkyState = 'clear-day' | 'cloudy' | 'overcast' | 'rain' | 'fog' | 'golden' | 'night-clear' | 'night-cloudy'
export const LIVE_SKY_STATES: readonly LiveSkyState[] = ['clear-day', 'cloudy', 'overcast', 'rain', 'fog', 'golden', 'night-clear', 'night-cloudy']

/** At most this many stars, on a clear, moonless, fully dark night. */
export const STAR_MAX = 90
/** At most this many cloud shapes, at full cover. */
export const CLOUD_MAX = 10
/** Cover this much or more is a deck: overcast. */
export const DECK_PCT = 87
/** Under this, a clear sky. */
export const CLEAR_PCT = 20
/** At night, this much cover or more hides the stars. */
export const NIGHT_CLOUDY_PCT = 70
/** The band above the cards the moon and stars are drawn in, as shares of the page's height. */
export const MOON_BAND: readonly [number, number] = [0.035, 0.1]
export const STAR_BAND = 0.2

export interface LiveSkyIn {
  sunDeg: number
  /** The forecast's WMO code now. */
  code: number | null
  /** The cloud by layer, %, the sky word's own (the station's in place of the model's when fresh). */
  cover: { low: number | null; mid: number | null; high: number | null } | null
  /** The sky word now ("Overcast", "Mostly cloudy"); it wins over the layers when said. */
  word: string | null
  /** The moon: height and bearing, degrees; lit fraction, waxing. */
  moon: { alt: number; az: number; fraction: number; waxing: boolean } | null
}

export interface LiveSky {
  state: LiveSkyState
  /** The ground class the page's gradient takes (src/styles/look-d.css). */
  ground: Ground
  /** 0-1: how much of the sky the shapes cover. */
  cover: number
  clouds: number
  stars: number
  /** The moon on the page: x, y as shares of the width and height; null when down or by day. */
  moon: { x: number; y: number; fraction: number; waxing: boolean } | null
}

const GROUND: Record<LiveSkyState, Ground> = { 'clear-day': 'day', cloudy: 'day', overcast: 'cloud', rain: 'rain', fog: 'fog', golden: 'golden', 'night-clear': 'night', 'night-cloudy': 'night' }

export function liveSkyOf(s: LiveSkyIn): LiveSky {
  const total = s.cover === null ? 0 : Math.max(s.cover.low ?? 0, s.cover.mid ?? 0, s.cover.high ?? 0)
  const word = s.word?.toLowerCase() ?? ''
  const pct = word === 'overcast' ? 100 : word === 'mostly cloudy' ? Math.max(total, 70) : word === 'clear' ? Math.min(total, 5) : total
  const night = s.sunDeg < NIGHT_SUN_DEG
  let state: LiveSkyState
  if (night) state = pct >= NIGHT_CLOUDY_PCT ? 'night-cloudy' : 'night-clear'
  else if (s.code === 45 || s.code === 48 || word === 'fog') state = 'fog'
  else if (s.code !== null && s.code >= 51) state = 'rain'
  else if (pct >= DECK_PCT) state = 'overcast'
  else if (s.sunDeg < GOLDEN_SUN_DEG) state = 'golden'
  else if (pct >= CLEAR_PCT) state = 'cloudy'
  else state = 'clear-day'
  const cover = Math.max(0, Math.min(1, pct / 100))
  /* Darkness: 0 at civil dusk, 1 at astronomical (-18°); a bright moon up takes up to 60% of the stars. */
  const dark = Math.max(0, Math.min(1, (-s.sunDeg - 6) / 12))
  const moonUp = s.moon !== null && s.moon.alt > 0
  const moonLoss = moonUp && s.moon !== null ? 0.6 * s.moon.fraction : 0
  const stars = state === 'night-clear' ? Math.round(STAR_MAX * (1 - cover) * dark * (1 - moonLoss)) : 0
  const clouds = state === 'cloudy' || state === 'night-cloudy' ? Math.max(1, Math.round(cover * CLOUD_MAX)) : state === 'overcast' || state === 'rain' ? CLOUD_MAX + 4 : 0
  /*
   * The moon on the page as you face south: east on the left, west on the
   * right, higher in the top band when higher; kept to the band above the
   * cards (MOON_BAND) and off the middle, where the temperature is, so it is
   * never behind a card's words.
   */
  const side = (x: number) => (x < 0.5 ? Math.min(x, 0.24) : Math.max(x, 0.76))
  const moon =
    night && moonUp && s.moon !== null
      ? { x: side(Math.max(0.08, Math.min(0.92, 0.5 + Math.sin(((s.moon.az - 180) * Math.PI) / 180) * 0.42))), y: MOON_BAND[1] - (Math.min(90, s.moon.alt) / 90) * (MOON_BAND[1] - MOON_BAND[0]), fraction: s.moon.fraction, waxing: s.moon.waxing }
      : null
  return { state, ground: GROUND[state], cover, clouds, stars, moon }
}

/** Deterministic places for n things, spread over 0-1 (the same sky draws the same way on every render). */
export function scatter(n: number, seed: number): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = []
  let a = seed * 9301 + 49297
  const next = () => {
    a = (a * 9301 + 49297) % 233280
    return a / 233280
  }
  for (let i = 0; i < n; i += 1) out.push({ x: next(), y: next(), r: next() })
  return out
}

/** The lit part of a moon of radius r at (cx, cy): the bright limb on the right while waxing (northern sky), the terminator an ellipse. */
export function moonPath(cx: number, cy: number, r: number, fraction: number, waxing: boolean): string {
  const f = Math.max(0, Math.min(1, fraction))
  const rx = r * Math.abs(1 - 2 * f)
  const top = `${cx} ${cy - r}`
  const bottom = `${cx} ${cy + r}`
  const outerSweep = waxing ? 1 : 0
  const innerSweep = (f > 0.5) === waxing ? 1 : 0
  return `M ${top} A ${r} ${r} 0 0 ${outerSweep} ${bottom} A ${rx} ${r} 0 0 ${innerSweep} ${top} Z`
}
