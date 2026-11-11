/*
 * THE WEATHER PAGE'S SIX TILES (Batch Pages, Section 2; board WeatherPage).
 * Wind (+gusts), Rain (+next 6 h), UV (+until), Humidity (+dew point),
 * Pressure (+trend), Cloud (+source station). The arithmetic and the words,
 * nothing drawn; a dash where the forecast did not say. Facts, never advice
 * (rule 28): "moderate till 3 PM", never "wear sunscreen".
 */
import type { CloudGroup, MetarSky } from './metar.ts'
import { RAIN_SOME } from './weatherWords.ts'

/* ------------------------------------------------------------------ UV */

/** The WHO's UV index bands, by their lower bound. */
const UV_BANDS = [
  { from: 11, word: 'extreme' },
  { from: 8, word: 'very high' },
  { from: 6, word: 'high' },
  { from: 3, word: 'moderate' },
  { from: 0, word: 'low' },
] as const

export function uvBand(uv: number): { from: number; word: string } {
  return UV_BANDS.find((b) => uv >= b.from) ?? UV_BANDS[UV_BANDS.length - 1]
}

/**
 * "moderate till 3 PM": the band now and the hour it drops below it, today;
 * low now and higher later: "low, moderate from 11 AM"; low all day: "low
 * all day". `later` are the hours from now to the day's end.
 */
export function uvLine(uvNow: number | null, later: readonly { at: Date; uv: number | null }[], clock: (d: Date) => string): string | null {
  if (uvNow === null) return null
  const band = uvBand(uvNow)
  if (band.from > 0) {
    const drop = later.find((h) => h.uv !== null && h.uv < band.from)
    return drop === undefined ? `${band.word} into the evening` : `${band.word} till ${clock(drop.at)}`
  }
  const up = later.find((h) => h.uv !== null && h.uv >= 3)
  return up === undefined ? 'low all day' : `low, ${uvBand(up.uv as number).word} from ${clock(up.at)}`
}

/* ------------------------------------------------------------ pressure */

/** Less than this change over three hours is steady (hPa; the NWS's own "steady" is under about 1 hPa in 3 h). */
export const PRESSURE_STEADY_HPA = 1

export function pressureTrend(nowHpa: number | null, threeHoursAgoHpa: number | null): 'rising' | 'falling' | 'steady' | null {
  if (nowHpa === null || threeHoursAgoHpa === null) return null
  const d = nowHpa - threeHoursAgoHpa
  return Math.abs(d) < PRESSURE_STEADY_HPA ? 'steady' : d > 0 ? 'rising' : 'falling'
}

const HPA_TO_INHG = 0.0295299830714

/** "30.12" (inches of mercury) in feet and miles; "1020 hPa" in metres. */
export function pressureWords(hpa: number | null, imperial: boolean): string {
  if (hpa === null) return '—'
  return imperial ? (hpa * HPA_TO_INHG).toFixed(2) : `${Math.round(hpa)} hPa`
}

/* --------------------------------------------------------------- cloud */

const AMOUNT: Record<CloudGroup['amount'], string> = { FEW: 'A few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast', VV: 'Sky hidden' }

/** Low under 6,500 ft, high from 20,000 ft, mid between (the forecast's own three layers, roughly). */
export function cloudHeightWord(baseFt: number): 'low' | 'mid' | 'high' {
  return baseFt < 6500 ? 'low' : baseFt < 20_000 ? 'mid' : 'high'
}

/**
 * The Cloud tile: the nearest station's report when there is one ("A few ·
 * high, at KNTU"; the most cloud it reports, the lowest of those layers),
 * else the blended forecast's cover ("Partly cloudy · forecast").
 */
export function cloudTile(sky: MetarSky | null, forecastPct: number | null, forecastWords: (pct: number | null) => string): { big: string; line: string } {
  if (sky !== null) {
    if (sky.groups.length === 0) return sky.clear ? { big: 'Clear', line: `below 12,000 ft, at ${sky.station}` } : { big: 'Clear', line: `reported at ${sky.station}` }
    const rank = ['FEW', 'SCT', 'BKN', 'OVC', 'VV']
    const most = sky.groups.reduce((a, b) => (rank.indexOf(b.amount) > rank.indexOf(a.amount) ? b : a))
    return { big: AMOUNT[most.amount], line: `${cloudHeightWord(most.baseFt)}, at ${sky.station}` }
  }
  if (forecastPct === null) return { big: '—', line: 'not said' }
  const w = forecastWords(forecastPct)
  return { big: w.charAt(0).toUpperCase() + w.slice(1), line: 'forecast' }
}

/* ---------------------------------------------------------------- rain */

/** The Rain tile's line: "none next 6 h", "from 3 PM", "now"; a chance of RAIN_SOME is rain, as the 6-hour line says it (src/core/weatherWords.ts). */
export function rainTileLine(next: readonly { at: Date; chance: number | null }[], now: Date, clock: (d: Date) => string): string {
  if (next.length === 0 || next.every((h) => h.chance === null)) return 'not said'
  const first = next.find((h) => (h.chance ?? 0) >= RAIN_SOME)
  if (first === undefined) return 'none next 6 h'
  return first.at.getTime() <= now.getTime() ? 'now' : `from ${clock(first.at)}`
}
