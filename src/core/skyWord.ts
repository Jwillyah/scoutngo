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
 *
 * THE STATION'S OWN WORD (Batch NOW, Section 1.3; 12 Nov 4:36 PM said "Clear"
 * under KNTU's three broken decks, 13 Nov 7:55 "Overcast" at Pembroke and
 * "Mostly cloudy" at Sandbridge). When the nearest airport's report is
 * fresh (SKY_MAX_AGE_MS), its most-covering group is the word: FEW Few
 * clouds, SCT Partly cloudy, BKN Mostly cloudy, OVC Overcast. The same
 * report is the same word wherever it is read from. "Clear" only when the
 * station reports nothing (CLR/SKC, which reaches 12,000 ft) and the sky
 * above is empty too: the satellite under SAT_CLEAR_PCT when it was read,
 * else the model's mid and high under it. The model's layers only when no
 * station is fresh, in the same words.
 */
import { conditionOf, type SkyIcon } from './homeDay.ts'
import { LOW_TOP_FT, CEILOMETER_FT } from './layerTruth.ts'
import type { MetarSky } from './metar.ts'
import { skyCell, type SkyWord } from './statStrip.ts'

export const FOG_VIS_MI = 1
/** A station's sky counts for this long (Batch NOW: 75 minutes). */
export const SKY_MAX_AGE_MS = 75 * 60_000
/** "Clear" needs the sky above the ceilometer under this, per cent. */
export const SAT_CLEAR_PCT = 10

/** The station's sky, when its report is fresh at `now`; else null. */
export function freshSky(obs: { sky?: MetarSky | null; visMi?: number | null; skyAt?: Date | null } | null, now: Date): { sky: MetarSky | null; visMi: number | null } | null {
  if (obs === null || obs.skyAt == null) return null
  const age = now.getTime() - obs.skyAt.getTime()
  return age <= SKY_MAX_AGE_MS && age >= -10 * 60_000 ? { sky: obs.sky ?? null, visMi: obs.visMi ?? null } : null
}

const STATION_WORD = { FEW: 'Few clouds', SCT: 'Partly cloudy', BKN: 'Mostly cloudy', OVC: 'Overcast', VV: 'Overcast' } as const
const RANK: readonly SkyWord[] = ['Clear', 'Few clouds', 'High cloud', 'Partly cloudy', 'Mostly cloudy', 'Overcast']

/** A report's own word: its most-covering group; "Clear" for CLR/SKC; null when it says nothing of the sky. */
export function stationWord(sky: MetarSky): SkyWord | null {
  if (sky.groups.length === 0) return sky.clear ? 'Clear' : null
  return sky.groups.map((g): SkyWord => STATION_WORD[g.amount]).reduce((a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a))
}

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
  /** The station's latest report, only when it is fresh and the time asked is now (freshSky); else null. */
  station: { sky: MetarSky | null; visMi: number | null } | null
  /** The satellite's cloud cover over the spot, per cent, when it was read. */
  satCover?: number | null
}

const ICON: Record<SkyWord, { day: SkyIcon; night: SkyIcon }> = {
  Clear: { day: 'sun', night: 'moon' },
  'Few clouds': { day: 'partly', night: 'partly-night' },
  'High cloud': { day: 'partly', night: 'partly-night' },
  'Partly cloudy': { day: 'partly', night: 'partly-night' },
  'Mostly cloudy': { day: 'cloud', night: 'cloud' },
  Overcast: { day: 'cloud', night: 'cloud' },
}

/** The word and icon for the sky at one time: the home's condition and the map strip's Sky cell. */
export function skyCondition(s: SkyIn): { word: string; icon: SkyIcon } | null {
  if (s.station !== null && s.station.visMi !== null && s.station.visMi < FOG_VIS_MI) return { word: 'Fog', icon: 'fog' }
  const coded = conditionOf(s.code, s.day)
  /* Rain, drizzle, snow, thunder: the model's word (codes 51 and up). */
  if (coded !== null && s.code !== null && s.code >= 51) return coded
  const icon = (word: SkyWord) => ({ word, icon: ICON[word][s.day ? 'day' : 'night'] })
  /* A fresh station's own word. */
  const said = s.station?.sky == null ? null : stationWord(s.station.sky)
  if (said !== null && said !== 'Clear') return icon(said)
  if (said === 'Clear') {
    /* Nothing under 12,000 ft: "Clear" when the sky above is empty too, else the word for what is up there. */
    const above = s.satCover != null ? (s.satCover < SAT_CLEAR_PCT ? 0 : s.satCover) : Math.max(s.layers?.mid ?? 0, s.layers?.high ?? 0)
    if (above < SAT_CLEAR_PCT) return icon('Clear')
    return icon(skyCell({ low: 0, mid: s.satCover != null ? null : (s.layers?.mid ?? null), high: s.satCover != null ? s.satCover : (s.layers?.high ?? null) }) ?? 'Few clouds')
  }
  const seen = s.station?.sky == null ? null : stationLayers(s.station.sky)
  const modelMid = s.layers?.mid ?? null
  const layers = s.layers === null && seen === null ? null : { low: seen?.low ?? s.layers?.low ?? null, mid: seen?.mid == null ? modelMid : Math.max(seen.mid, modelMid ?? 0), high: s.layers?.high ?? null }
  const word = skyCell(layers)
  if (word !== null) return icon(word)
  /* No layers: the code's word, but never its fog. */
  return coded === null || coded.icon === 'fog' ? null : coded
}
