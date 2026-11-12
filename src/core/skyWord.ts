/*
 * ONE SKY WORD (Batch TRUTH, Section 0.6). On 12 Nov at 7:21 the home said
 * "Fog" (HRRR's 09Z run: weather code 45, visibility 100 m) while the map's
 * strip said "Overcast" (the same run's low cloud, 100%), under a mackerel
 * sky with blue gaps; KNTU read 10 miles and nothing under 12,000 ft.
 *
 * Now the home and the strip ask this one function, so they say the same
 * word at the same time:
 *
 *   fog       only when the station a fog would be measured at reports under
 *             FOG_VIS_MI. A model's fog code is never the word by itself.
 *   wet       rain, drizzle, snow, thunder: the model's code, as before.
 *   cloud     else the cloud layers (src/core/statStrip.ts skyCell), with
 *             what the station saw in place of the model's low and mid
 *             layers when its report is fresh: it measures below 12,000 ft,
 *             the model guesses.
 */
import { conditionOf, type SkyIcon } from './homeDay.ts'
import { LOW_TOP_FT, CEILOMETER_FT } from './layerTruth.ts'
import type { MetarSky } from './metar.ts'
import { skyCell, type SkyWord } from './statStrip.ts'

export const FOG_VIS_MI = 1

export interface Layers {
  low: number | null
  mid: number | null
  high: number | null
}

/** The visibility in a METAR's body, statute miles: "10SM", "1/2SM", "1 1/2SM", "M1/4SM", "P6SM". Null when not said. */
export function metarVisMiles(raw: string): number | null {
  const body = raw.split(' RMK')[0]
  const m = /(?:^|\s)(?:(\d+)\s)?([MP])?(\d+)(?:\/(\d+))?SM(?=\s|$)/.exec(body)
  if (m === null) return null
  const whole = m[1] === undefined ? 0 : Number(m[1])
  const part = m[4] === undefined ? Number(m[3]) : Number(m[3]) / Number(m[4])
  const v = whole + part
  return m[2] === 'M' ? Math.min(v, v - 0.01) : v
}

const COVER = { FEW: 25, SCT: 50, BKN: 75, OVC: 100, VV: 100 } as const

/**
 * What the station saw, as low and mid cover: each layer the most any of
 * its groups in that layer covers. Low is the station's outright (0 when it
 * saw none); mid only when it saw a deck there, up to the ceilometer's reach.
 */
export function stationLayers(sky: MetarSky): { low: number; mid: number | null } {
  let low = 0
  let mid = 0
  for (const g of sky.groups) {
    if (g.baseFt < LOW_TOP_FT) low = Math.max(low, COVER[g.amount])
    else if (g.baseFt <= CEILOMETER_FT) mid = Math.max(mid, COVER[g.amount])
  }
  /* A CLR says nothing under 12,000 ft, and the mid layer runs to 20,000: a mid deck seen counts, none seen says nothing. */
  return { low, mid: mid > 0 ? mid : null }
}

export interface SkyIn {
  /** The forecast's WMO code at that hour. */
  code: number | null
  /** The forecast's cloud layers at that hour, %. */
  layers: Layers | null
  day: boolean
  /** The station's latest report, only when it is fresh and the time asked is now; else null. */
  station: { sky: MetarSky | null; visMi: number | null } | null
}

const ICON: Record<SkyWord, { day: SkyIcon; night: SkyIcon }> = {
  Clear: { day: 'sun', night: 'moon' },
  'A few clouds': { day: 'partly', night: 'partly-night' },
  'High cloud': { day: 'partly', night: 'partly-night' },
  'Some cloud': { day: 'partly', night: 'partly-night' },
  'Mostly cloudy': { day: 'cloud', night: 'cloud' },
  Overcast: { day: 'cloud', night: 'cloud' },
}

/** The word and icon for the sky at one time: the home's condition and the map strip's Sky cell. */
export function skyCondition(s: SkyIn): { word: string; icon: SkyIcon } | null {
  if (s.station !== null && s.station.visMi !== null && s.station.visMi < FOG_VIS_MI) return { word: 'Fog', icon: 'fog' }
  const coded = conditionOf(s.code, s.day)
  /* Rain, drizzle, snow, thunder: the model's word (codes 51 and up). */
  if (coded !== null && s.code !== null && s.code >= 51) return coded
  const seen = s.station?.sky == null ? null : stationLayers(s.station.sky)
  const modelMid = s.layers?.mid ?? null
  const layers = s.layers === null && seen === null ? null : { low: seen?.low ?? s.layers?.low ?? null, mid: seen?.mid == null ? modelMid : Math.max(seen.mid, modelMid ?? 0), high: s.layers?.high ?? null }
  const word = skyCell(layers)
  if (word !== null) return { word, icon: ICON[word][s.day ? 'day' : 'night'] }
  /* No layers: the code's word, but never its fog. */
  return coded === null || coded.icon === 'fog' ? null : coded
}
