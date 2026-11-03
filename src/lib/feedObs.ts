/*
 * THE STATIONS' CALL FOR THE CALENDAR FEED (Batch J, Section 6). The feed's
 * server is stateless and reads the models; in the hour before a sunrise or
 * sunset it now also reads the stations, as the phone does, so a call that
 * moves (Maybe to Go on 2 Nov, or Go to Skip) moves in the calendar too.
 *
 * WHAT IS ASKED (by api/calendar.ts): aviationweather.gov, by station ids only: the station
 * nearest the venue (from the baked list, never a lookup by coordinate) and
 * those along the sun's line. No satellite, no profile: the deck is named
 * from the station's report alone.
 */
import { getPosition } from 'suncalc'
import type { CallObs } from '../core/briefing.ts'
import { gapRead, lineDeckFt, stationsAlong } from '../core/gapWatch.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { deckTruth, stationDeck } from '../core/layerTruth.ts'
import { parseMetarSky, type MetarSky } from '../core/metar.ts'
import { ASOS_STATIONS } from '../data/asosStations.ts'

/** The venue's own station is the nearest within this. */
export const OWN_STATION_KM = 30

export function ownStation(at: LatLon): string | null {
  let best: { id: string; km: number } | null = null
  for (const [id, , lat, lon] of ASOS_STATIONS) {
    const km = distanceMeters(at, { lat, lon }) / 1000
    if (km <= OWN_STATION_KM && (best === null || km < best.km)) best = { id, km }
  }
  return best?.id ?? null
}

/** The latest of each station's METARs, from the service's raw text (newest first). */
export function latestSkies(text: string): Map<string, MetarSky> {
  const out = new Map<string, MetarSky>()
  for (const l of text.split('\n')) {
    const sky = parseMetarSky(l.trim())
    if (sky !== null && !out.has(sky.station)) out.set(sky.station, sky)
  }
  return out
}

/** What the stations say for one event, read from their METAR text. */
export function feedObsFrom(at: LatLon, event: Date, skies: ReadonlyMap<string, MetarSky>, own: string | null): CallObs {
  const azimuthDeg = getPosition(event, at.lat, at.lon).azimuth
  const line = stationsAlong(at, azimuthDeg, ASOS_STATIONS)
  const mine = own === null ? null : (skies.get(own) ?? null)
  const over = mine === null ? null : stationDeck(mine)
  const truth = mine === null ? null : deckTruth({ station: over })
  const reports = new Map(line.flatMap((s) => (skies.has(s.id) ? [[s.id, skies.get(s.id) as MetarSky] as const] : [])))
  const gap = gapRead({ azimuthDeg, line, reports, deckFt: lineDeckFt(over?.baseFt ?? null, [...reports.values()]) })
  return { venue: at, truth, gap }
}

/** The station ids to ask for one event: the venue's own, then the line's, at most twelve. */
export function feedIds(at: LatLon, event: Date): { own: string | null; ids: string[] } {
  const own = ownStation(at)
  const line = stationsAlong(at, getPosition(event, at.lat, at.lon).azimuth, ASOS_STATIONS)
  return { own, ids: [...new Set([...(own === null ? [] : [own]), ...line.slice(0, 11).map((s) => s.id)])] }
}
