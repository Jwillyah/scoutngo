/*
 * NOAA'S PUBLISHED DATUMS FOR A STATION (CO-OPS Metadata API, keyless, CORS
 * open), and the offset the waterline uses (src/core/waterline.ts): the
 * venue's own station's when it publishes MLLW and NAVD88, else borrowed from
 * the nearest that does and sits on open water. Kept on the phone: a station's
 * datums change once in a decade or two.
 */
import { distanceMeters, destinationPoint, type LatLon } from '../../core/geo.ts'
import type { TideStation } from '../../core/tide.ts'
import { chooseOffset, type Candidate, type OffsetChoice, type StationDatums } from '../../core/waterline.ts'
import { seaTestAround } from '../coast.ts'
import { fetchStations } from '../noaa.ts'

export const DATUMS_URL = (id: string) => `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${id}/datums.json?units=metric`
const KEY = (id: string) => `scoutngo.datums.${id}.v1`
/* How far out to look for a station to borrow from, and how many to ask about. */
export const BORROW_WITHIN_KM = 150
export const BORROW_ASK = 14

export function parseDatums(st: TideStation, payload: unknown): StationDatums {
  const list = (payload as { datums?: { name?: string; value?: number }[] | null })?.datums ?? []
  const get = (n: string) => {
    const v = list.find((d) => d.name === n)?.value
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  return { id: st.id, name: st.name, lat: st.at.lat, lon: st.at.lon, mllw: get('MLLW'), navd88: get('NAVD88'), msl: get('MSL'), gt: get('GT') }
}

export async function stationDatums(st: TideStation): Promise<StationDatums | null> {
  try {
    const kept = localStorage.getItem(KEY(st.id))
    if (kept !== null) return parseDatums(st, JSON.parse(kept))
  } catch {
    /* Ask instead. */
  }
  try {
    const r = await fetch(DATUMS_URL(st.id))
    if (!r.ok) return null
    const payload = (await r.json()) as unknown
    try {
      localStorage.setItem(KEY(st.id), JSON.stringify(payload))
    } catch {
      /* Not kept. */
    }
    return parseDatums(st, payload)
  } catch {
    return null
  }
}

/** The share of the ring 1 to 5 km around a point that is ocean on the map tiles, or null when the tiles cannot be had. */
export async function oceanShare(at: LatLon): Promise<number | null> {
  const sea = await seaTestAround(at, 5200)
  if (sea === null) return null
  let n = 0
  let wet = 0
  for (let r = 1000; r <= 5000; r += 1000) {
    for (let b = 0; b < 360; b += 10) {
      n += 1
      if (sea(destinationPoint(at, b, r))) wet += 1
    }
  }
  return wet / n
}

/**
 * The offset for a venue whose tide comes from `own`. Walks outward by
 * distance, and stops at the first station that publishes both datums and is
 * on open water.
 */
export async function offsetFor(venue: LatLon, own: TideStation, venueGt: number | null): Promise<OffsetChoice | null> {
  const ownDatums = await stationDatums(own)
  if (ownDatums !== null && ownDatums.mllw !== null && ownDatums.navd88 !== null) return chooseOffset(ownDatums, [], venueGt)
  const listed = await fetchStations()
  if (listed.status !== 'ok') return null
  const near = listed.stations
    .filter((s) => s.id !== own.id)
    .map((s) => ({ s, km: distanceMeters(venue, s.at) / 1000 }))
    .filter((x) => x.km <= BORROW_WITHIN_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, BORROW_ASK)
  const candidates: Candidate[] = []
  for (const { s, km } of near) {
    const d = await stationDatums(s)
    if (d === null || d.mllw === null || d.navd88 === null) continue
    const share = (await oceanShare(s.at)) ?? 0
    candidates.push({ datums: d, distanceKm: km, oceanShare: share })
    if (share >= 0.25) break
  }
  return chooseOffset(ownDatums, candidates, venueGt)
}
