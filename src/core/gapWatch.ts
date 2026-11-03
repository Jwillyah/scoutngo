/*
 * THE GAP WATCH (Batch J, Section 2): the open horizon is what made the
 * 2 Nov sunset fire. A deck over you lights from underneath only when the
 * sun's light can get under it, through a slot of clear sky toward the sun.
 * The models placed the deck badly that day; the stations did not.
 *
 * THE LINE. From the venue along the sun's azimuth at the event, out to
 * GAP_REACH_KM, the stations within GAP_CORRIDOR_KM of it.
 *
 * EACH STATION. Against the deck's height (the deck over you, else the
 * lowest deck any of them reports):
 *   shut     broken or overcast at or under the deck (the deck runs on)
 *   open     few or scattered under it, or nothing under it, or a CLR when
 *            the deck is under the ceilometer's 12,000 ft
 *   unknown  a CLR when the deck is at 12,000 ft or higher: "clear below
 *            12,000 ft" cannot say whether the deck is there
 *
 * THE GAP. The deck over you is expected near you; what matters is whether
 * it ENDS toward the sun. Walking in from the farthest station: when the
 * farthest that can say is open, the gap is open, its edge between the last
 * shut station and the first of the open run. When it is shut, the gap is
 * shut. The satellite says the same along the line (warm = no mid or high
 * cloud, src/core/goesNowcast.ts), from its last cold sample. Radar echoes
 * past the edge are showers in the gap: shut.
 *
 * Stations and satellite together: either open and the other not shut is
 * open; open against shut is partly; both shut is shut. At sunrise on this
 * coast the line runs out to sea: the satellite alone.
 */
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { CEILOMETER_FT } from './layerTruth.ts'
import type { MetarSky } from './metar.ts'
import { COLD_BY_C, type SatSample } from './goesNowcast.ts'
import { compassPoint } from './field.ts'

export const GAP_REACH_KM = 300
export const GAP_CORRIDOR_KM = 25
/** Stations nearer than this are under your own sky, not the line's. */
export const GAP_FROM_KM = 20
/** A deck within this much above the given height is the same deck. */
const SAME_DECK_FT = 2000
/** The satellite's open run must be at least this long to be a gap, not a hole. */
export const SAT_OPEN_RUN_KM = 30

export interface LineStation {
  id: string
  name: string
  alongKm: number
  offKm: number
}

/** The stations within the corridor of the sun's line, nearest first. */
export function stationsAlong(venue: LatLon, azimuthDeg: number, stations: readonly (readonly [string, string, number, number])[], reachKm = GAP_REACH_KM, corridorKm = GAP_CORRIDOR_KM): LineStation[] {
  const out: LineStation[] = []
  for (const [id, name, lat, lon] of stations) {
    const d = distanceMeters(venue, { lat, lon }) / 1000
    if (d < GAP_FROM_KM || d > reachKm + corridorKm) continue
    const off = ((bearingBetween(venue, { lat, lon }) - azimuthDeg + 540) % 360) - 180
    const r = (off * Math.PI) / 180
    const alongKm = d * Math.cos(r)
    const offKm = Math.abs(d * Math.sin(r))
    if (alongKm >= GAP_FROM_KM && alongKm <= reachKm && offKm <= corridorKm) out.push({ id, name, alongKm, offKm })
  }
  return out.sort((a, b) => a.alongKm - b.alongKm)
}

export type StationGap = 'open' | 'shut' | 'unknown'

const AMOUNT_WORD = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast', VV: 'fog' } as const

/** One station against the deck's height: open, shut or unknown, and a word for it. */
export function stationGap(sky: MetarSky, deckFt: number | null): { state: StationGap; word: string } {
  const top = deckFt === null ? Infinity : deckFt + SAME_DECK_FT
  const under = sky.groups.filter((g) => g.baseFt <= top)
  const deck = under.find((g) => g.amount === 'BKN' || g.amount === 'OVC' || g.amount === 'VV')
  if (deck !== undefined) return { state: 'shut', word: AMOUNT_WORD[deck.amount] }
  if (under.length > 0) return { state: 'open', word: AMOUNT_WORD[under[under.length - 1].amount] }
  if (sky.groups.length > 0) return { state: 'open', word: 'clear under the deck' }
  if (!sky.clear) return { state: 'unknown', word: 'no cloud reported' }
  return deckFt !== null && deckFt < CEILOMETER_FT ? { state: 'open', word: 'clear' } : { state: 'unknown', word: 'clear below 12k' }
}

/** The deck's height for the line: the one over you, else the lowest broken or overcast any station reports. */
export function lineDeckFt(overYouFt: number | null, skies: readonly MetarSky[]): number | null {
  if (overYouFt !== null && overYouFt < CEILOMETER_FT) return overYouFt
  const decks = skies.flatMap((s) => s.groups.filter((g) => (g.amount === 'BKN' || g.amount === 'OVC') && g.baseFt >= 6500).map((g) => g.baseFt))
  const lowest = decks.length === 0 ? null : Math.min(...decks)
  return lowest !== null && (overYouFt === null || lowest <= overYouFt) ? lowest : overYouFt
}

export type GapState = 'open' | 'partly' | 'shut'

export interface GapStation extends LineStation {
  state: StationGap
  word: string
}

export interface GapRead {
  state: GapState | null
  /** Where the deck ends toward the sun, km, when it does. */
  edgeKm: number | null
  /** "WSW". */
  toward: string
  stations: GapStation[]
  stationsSay: GapState | null
  satSays: GapState | null
  satEdgeKm: number | null
  /** Radar echoes past the edge. */
  showers: boolean
  /** "Gap to the WSW: open · Henderson scattered, Roxboro clear". */
  line: string
}

/** The stations' word: the farthest that can say decides; the open run's start is the edge. */
function fromStations(st: readonly GapStation[]): { says: GapState | null; edgeKm: number | null } {
  const known = st.filter((s) => s.state !== 'unknown')
  if (known.length === 0) return { says: null, edgeKm: null }
  const far = known[known.length - 1]
  if (far.state === 'shut') return { says: 'shut', edgeKm: null }
  let i = known.length - 1
  while (i > 0 && known[i - 1].state === 'open') i -= 1
  const edgeKm = i === 0 ? known[0].alongKm / 2 : (known[i - 1].alongKm + known[i].alongKm) / 2
  return { says: 'open', edgeKm }
}

/** The satellite's word: open when the far end is warm for SAT_OPEN_RUN_KM or more, from its last cold sample. */
export function fromSatellite(samples: readonly SatSample[] | null, groundC: number | null, reachKm = GAP_REACH_KM): { says: GapState | null; edgeKm: number | null } {
  if (samples === null || groundC === null) return { says: null, edgeKm: null }
  const known = samples.filter((s) => s.c !== null && s.km <= reachKm && s.km >= GAP_FROM_KM)
  if (known.length < 5) return { says: null, edgeKm: null }
  const cold = (c: number) => c < groundC - COLD_BY_C
  let lastCold: number | null = null
  for (const s of known) if (cold(s.c as number)) lastCold = s.km
  const farKm = known[known.length - 1].km
  if (lastCold === null) return { says: 'open', edgeKm: known[0].km }
  if (farKm - lastCold < SAT_OPEN_RUN_KM) return { says: 'shut', edgeKm: null }
  return { says: 'open', edgeKm: lastCold }
}

export interface GapIn {
  azimuthDeg: number
  line: readonly LineStation[]
  /** The latest report of each line station, by id. */
  reports: ReadonlyMap<string, MetarSky>
  deckFt: number | null
  sat?: { samples: readonly SatSample[]; groundC: number } | null
  /** Kilometres along the line with radar echoes. */
  echoesKm?: readonly number[] | null
}

export function gapRead(g: GapIn): GapRead {
  const toward = compassPoint(g.azimuthDeg)
  const stations: GapStation[] = g.line.flatMap((s) => {
    const sky = g.reports.get(s.id)
    return sky === undefined ? [] : [{ ...s, ...stationGap(sky, g.deckFt) }]
  })
  const st = fromStations(stations)
  const sat = fromSatellite(g.sat?.samples ?? null, g.sat?.groundC ?? null)
  let state: GapState | null =
    st.says === null ? sat.says : sat.says === null ? st.says : st.says === sat.says ? st.says : st.says === 'open' || sat.says === 'open' ? 'partly' : 'shut'
  const edgeKm = st.says === 'open' ? st.edgeKm : sat.says === 'open' ? sat.edgeKm : null
  const showers = (state === 'open' || state === 'partly') && (g.echoesKm ?? []).some((km) => edgeKm === null || km >= edgeKm)
  if (showers) state = 'shut'
  /* Say the stations that make the case: the open run's when open, the farthest shut ones when shut. */
  const said = state === 'open' || state === 'partly' ? stations.filter((s) => s.state === 'open' && (edgeKm === null || s.alongKm >= edgeKm)) : stations.filter((s) => s.state === 'shut').reverse()
  const names = said.slice(0, 2).map((s) => `${s.name} ${s.word}`)
  const satWord = sat.says === null ? null : sat.says === 'open' ? `satellite clear past ${Math.round(sat.edgeKm ?? 0)} km` : 'satellite cloud to the end'
  const evidence = [...names, ...(names.length === 0 && satWord !== null ? [satWord] : []), ...(showers ? ['showers in the gap'] : [])]
  const line = state === null ? `Gap to the ${toward}: no station or satellite can say` : `Gap to the ${toward}: ${state === 'partly' ? 'partly open' : state}${evidence.length === 0 ? '' : ` · ${evidence.join(', ')}`}`
  return { state, edgeKm, toward, stations, stationsSay: st.says, satSays: sat.says, satEdgeKm: sat.edgeKm, showers, line }
}
