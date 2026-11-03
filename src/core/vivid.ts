/*
 * HOW VIVID (Batch J, Section 4). Whether there is colour is the gap and the
 * canvas; how strong it is, is the air the light comes through.
 *
 *   air       Open-Meteo's air quality at the venue for the hour: aerosol
 *             optical depth at 550 nm, dust and fine particles. Clean air
 *             (AOD under VIVID_AOD) is vivid; haze, dust or smoke over
 *             MUTED_AOD, MUTED_DUST or MUTED_PM25 is muted; between, normal.
 *   rain      rain in the last 6 hours upwind washes the air: "clean air
 *             after rain" when RAIN_MM or more fell (it lifts normal to vivid)
 *   runs      the GFS ensemble's 31 runs (control and 30 members), each
 *             asked for total cloud along the sun's line: a run keeps the gap
 *             open when there is a canvas over you (CANVAS_MIN) and the line
 *             clears, under RUN_OPEN_PCT from some point past 150 km to the
 *             end. "21 of 31 runs keep the gap open", beside the five models.
 *   contrails ice supersaturation at 300 or 250 hPa (over 100% over ice,
 *             colder than -40 °C): persistent trails "may streak the sky".
 *   the AFD   NWS's Area Forecast Discussion: one quoted line about the sky,
 *             labelled as theirs, NEVER an input to the call.
 */
import type { Level } from './layerTruth.ts'
import { rhForCloud } from './layerTruth.ts'
import { CANVAS_MIN, PATH_KM } from './skyFire.ts'

export const VIVID_AOD = 0.08
export const MUTED_AOD = 0.25
export const MUTED_DUST = 50
export const MUTED_PM25 = 35
export const RAIN_MM = 1
export const RUN_OPEN_PCT = 50

export type AirWord = 'vivid' | 'normal' | 'muted'

export interface AirRead {
  word: AirWord
  /** "muted (haze)", "vivid", "normal". */
  line: string
  afterRain: boolean
}

export function airRead(aod: number | null, dust: number | null, pm25: number | null, rainMm: number | null): AirRead | null {
  if (aod === null && dust === null && pm25 === null) return null
  const afterRain = rainMm !== null && rainMm >= RAIN_MM
  const why = (dust ?? 0) >= MUTED_DUST ? 'dust' : (pm25 ?? 0) >= MUTED_PM25 ? 'smoke or haze' : (aod ?? 0) >= MUTED_AOD ? 'haze' : null
  if (why !== null) return { word: 'muted', line: `muted (${why})`, afterRain }
  const word: AirWord = aod !== null && aod < VIVID_AOD ? 'vivid' : afterRain ? 'vivid' : 'normal'
  return { word, line: afterRain ? `${word} · clean air after rain` : word, afterRain }
}

/** One run's total cloud along the sun's line, sample by sample (PATH_KM). */
export type RunPath = readonly (number | null)[]

/** Whether a run keeps the gap open: a canvas over you, and the line clear from some point past 150 km to the end. */
export function runKeepsGap(run: RunPath): boolean | null {
  const over = run[0]
  if (over === null || over === undefined) return null
  if (over < CANVAS_MIN) return false
  for (let i = 0; i < PATH_KM.length; i += 1) {
    if (PATH_KM[i] < 150) continue
    const rest = run.slice(i)
    if (rest.every((c) => c !== null && c < RUN_OPEN_PCT)) return true
  }
  return false
}

export function runsLine(runs: readonly RunPath[]): { open: number; of: number; line: string } | null {
  const said = runs.map(runKeepsGap).filter((x): x is boolean => x !== null)
  if (said.length === 0) return null
  const open = said.filter(Boolean).length
  return { open, of: said.length, line: `${open} of ${said.length} runs keep the gap open` }
}

/** Persistent contrails: ice supersaturation at 300 or 250 hPa, colder than -40 °C. */
export function contrailsLikely(levels: readonly Level[]): boolean {
  return levels.some((l) => l.heightM >= 8500 && l.heightM <= 11500 && l.tempC <= -40 && rhForCloud(l) > 100)
}

/** The near term first: a line about this evening says more than one about Thursday. */
const NEAR_WORDS = /\b(this (?:morning|afternoon|evening)|tonight|today|sunset|sunrise)\b/i
const SKY_WORDS = /\b(sky|skies|cloud|clouds|cloudy|overcast|clear(?:ing)?|sunset|sunrise|mid-level|high-level|cirrus|altocumulus|stratus|fog)\b/i

/**
 * One line from an AFD about the sky: the first sentence of its discussion
 * that speaks of cloud or sky and of today or tonight, else the first about
 * the sky at all, as written (whitespace closed up). Null when
 * none does. Context only: never read by the call.
 */
export function afdSkyLine(text: string): string | null {
  const body = text.split(/\n\.(?:DISCUSSION|NEAR TERM|SHORT TERM)[^\n]*\n/i)[1] ?? text
  const sentences = body
    .replace(/\n&&[\s\S]*$/, '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 20 && s.length < 260 && !/^As of /i.test(s) && !/KEY MESSAGE/i.test(s))
  const sky = sentences.filter((s) => SKY_WORDS.test(s))
  return sky.find((s) => NEAR_WORDS.test(s)) ?? sky[0] ?? null
}

/** The issue time of an AFD, from its "636 PM EST Mon Nov 2 2026" line, as Eastern or Central or the zone it names. */
export function afdIssued(text: string): string | null {
  return /^\s*(\d{3,4} [AP]M [A-Z]{3} \w{3} \w{3} \d{1,2} \d{4})\s*$/m.exec(text)?.[1] ?? null
}
