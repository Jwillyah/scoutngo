/*
 * THE DRONE PAGE'S PREFLIGHT, AS ARITHMETIC (Batch SIMPLE-1, Section 1).
 *
 * A checklist: eight rows, each green or amber with one line. Every fact is the
 * code's from somewhere else (the airspace read, the wind at 400 ft, the cold
 * trim, the sun, the TFR fetch, the FRIA layer, NOAA's Kp); this file only
 * says which colour each one is.
 *
 *   green   the fact was read and sits under its line
 *   amber   the fact is over its line, needs something of the pilot, or WAS
 *           NOT READ. Amber is the default: an unknown is never green, and no
 *           row, in any wording, says an area is clear (docs/ux-rules.md 12).
 *
 * Green says "nothing to do about this row", never "go".
 */
import type { AirspaceRead } from './droneAirRead.ts'
import { coldMinutes, coldTrim, limitRole } from './droneNow.ts'
import { tfrLine, type TfrRead } from './tfrLine.ts'

export type PreflightTone = 'green' | 'amber'
export type PreflightKey = 'airspace' | 'wind' | 'gusts' | 'battery' | 'sunset' | 'tfr' | 'remoteid' | 'kp'

export interface PreflightRow {
  key: PreflightKey
  label: string
  tone: PreflightTone
  line: string
}

/** Under this long to sunset, the row is amber: the light is what is left to plan. */
export const SUNSET_SOON_MIN = 60
/** NOAA's own line: a K index of 4 is active and 5 and over is a geomagnetic storm; either can degrade GPS. */
export const KP_AMBER_FROM = 4

export interface PreflightInput {
  /** The page's one airspace read, or null while it is being read. */
  air: AirspaceRead | null
  /** Restricted or prohibited areas and park land over the point (src/core/airspaceCard.ts), or null while unread. */
  marked: number | null
  mps400: number | null
  gust400: number | null
  limitMps: number | null
  /** m/s in the pilot's unit with the unit: "14 kt". */
  speed: (mps: number) => string
  ratedMin: number
  tempC: number | null
  /** "47°F". */
  temp: (c: number | null) => string
  now: Date
  sunset: Date | null
  /** Civil dusk: the sun 6° under. */
  dusk: Date | null
  clock: (d: Date) => string
  tfr: TfrRead
  timeZone: string
  /** In a FAA-Recognized Identification Area, or 'unknown' before that layer arrives. */
  fria: boolean | 'unknown'
  /** The K index, or null when this phone has none. */
  kp: number | null
  kpWord: (kp: number) => string
}

const row = (key: PreflightKey, label: string, tone: PreflightTone, line: string): PreflightRow => ({ key, label, tone, line })

export function preflightRows(i: PreflightInput): PreflightRow[] {
  const out: PreflightRow[] = []

  /* Airspace: class, ceiling, and whether LAANC is the way. Only a read point with nothing marked is green. */
  if (i.air === null) out.push(row('airspace', 'Airspace', 'amber', 'Still reading the FAA data in the app'))
  else if (i.air.controlled) {
    const ceiling = i.air.ceilingFt === null ? 'no grid ceiling here' : `ceiling ${i.air.ceilingFt} ft`
    out.push(row('airspace', 'Airspace', 'amber', `${i.air.cls === null ? 'Controlled' : `Class ${i.air.cls}`} · ${ceiling} · ${i.air.laanc ? 'LAANC needed' : 'FAA authorization needed'}`))
  } else if (i.marked === null || i.marked > 0) out.push(row('airspace', 'Airspace', 'amber', i.marked === null ? 'Still reading the FAA data in the app' : 'A restricted area, park or wildlife refuge is over this point'))
  else out.push(row('airspace', 'Airspace', 'green', i.air.ceilingFt === null ? 'No class airspace in the app’s data here' : `No class airspace in the app’s data · grid ${i.air.ceilingFt} ft`))

  /* Wind at 400 ft against the pilot's limit: the home's own line (limitRole). */
  const lim = i.limitMps
  if (i.mps400 === null) out.push(row('wind', 'Wind at 400 ft', 'amber', 'The forecast did not say'))
  else if (lim === null || lim <= 0) out.push(row('wind', 'Wind at 400 ft', 'amber', `${i.speed(i.mps400)} · no wind limit in My gear`))
  else out.push(row('wind', 'Wind at 400 ft', limitRole(i.mps400, lim) === 'calm' ? 'green' : 'amber', `${i.speed(i.mps400)} against your ${i.speed(lim)} limit`))

  /* Gusts at 400 ft, the 10 m gust's excess carried up (droneNow.ts gustAloft). */
  if (i.gust400 === null) out.push(row('gusts', 'Gusts', 'amber', 'The forecast did not say'))
  else if (lim === null || lim <= 0) out.push(row('gusts', 'Gusts', 'amber', `${i.speed(i.gust400)} · no wind limit in My gear`))
  else out.push(row('gusts', 'Gusts', limitRole(i.gust400, lim) === 'calm' ? 'green' : 'amber', `${i.speed(i.gust400)} against your ${i.speed(lim)} limit`))

  /* Battery: the rated minutes, trimmed for the cold. */
  const min = coldMinutes(i.ratedMin, i.tempC)
  if (i.tempC === null) out.push(row('battery', 'Battery', 'amber', `~${min} min · ${i.ratedMin} min rated · no temperature`))
  else if (coldTrim(i.tempC) > 0) out.push(row('battery', 'Battery', 'amber', `~${min} min · ${i.ratedMin} min rated · ${i.temp(i.tempC)} cold`))
  else out.push(row('battery', 'Battery', 'green', `~${min} min · ${i.ratedMin} min rated · ${i.temp(i.tempC)}`))

  /* Sunset and civil twilight. */
  if (i.sunset === null) out.push(row('sunset', 'Sunset', 'amber', 'No sunset in the forecast’s days'))
  else {
    const left = Math.round((i.sunset.getTime() - i.now.getTime()) / 60_000)
    const dusk = i.dusk === null ? '' : ` · civil twilight ends ${i.clock(i.dusk)}`
    if (left <= 0) out.push(row('sunset', 'Sunset', 'amber', `Sunset was ${i.clock(i.sunset)}${dusk}`))
    else out.push(row('sunset', 'Sunset', left < SUNSET_SOON_MIN ? 'amber' : 'green', `Sunset ${i.clock(i.sunset)} · ${left < 90 ? `${left} min away` : `${Math.floor(left / 60)} h ${left % 60} min away`}${dusk}`))
  }

  /* TFRs: the one line (tfrLine.ts). Green only for a fetch that answered with none within the radius. */
  out.push(row('tfr', 'TFRs', i.tfr.kind === 'ok' && i.tfr.within === 0 && i.tfr.inside === 0 ? 'green' : 'amber', tfrLine(i.tfr, i.timeZone, i.now)))

  /* Remote ID: broadcast is required unless the pilot flies inside a FRIA. Never green on an unknown. */
  if (i.fria === true) out.push(row('remoteid', 'Remote ID', 'green', 'In a FRIA · no broadcast needed'))
  else if (i.fria === false) out.push(row('remoteid', 'Remote ID', 'amber', 'Broadcast needed here'))
  else out.push(row('remoteid', 'Remote ID', 'amber', 'Broadcast needed unless you fly inside a FRIA'))

  /* Kp: NOAA's planetary K index. */
  if (i.kp === null) out.push(row('kp', 'Kp', 'amber', 'Not received from NOAA'))
  else out.push(row('kp', 'Kp', i.kp >= KP_AMBER_FROM ? 'amber' : 'green', `Kp ${Math.round(i.kp)} · ${i.kpWord(i.kp)}${i.kp >= KP_AMBER_FROM ? ' · can degrade GPS' : ''}`))

  return out
}
