/*
 * A STATION'S WIND, AT 10 M OVER THE BEACH (Batch NOW, Section 2; 13 Nov
 * 7:55 AM at Sandbridge: we said 7 kt W, Surfline 14 g19 WNW, Cape Henry
 * read 23 NNW from an anemometer 27.9 m up a mast on a 2.7 m site).
 *
 * The log profile: in neutral air the wind grows with the log of height over
 * the surface's roughness length z0, u(z) = (u* / k) ln(z / z0). A reading
 * at the sensor's height over the station's own surface is carried up to
 * BLEND_M, where the surfaces below no longer tell apart, then down to 10 m
 * over the surface upwind of the spot:
 *
 *   u10 = u(sensor) * ln(BLEND / z0st) / ln(sensor / z0st)
 *                   * ln(10 / z0spot) / ln(BLEND / z0spot)
 *
 * Roughness by exposure, from the wind's own direction: over open water
 * Z0.water; over the shore's dunes, scrub and low buildings Z0.shore; an
 * airport's mown grass Z0.open (the WMO standard exposure). At a beach the
 * wind is over water when it blows from within 90° of the way the beach
 * faces (onshore), over the land behind it otherwise. Neutral air only: no
 * stability; gusts carried by the same factor.
 */

export const Z0 = { water: 0.0002, open: 0.03, shore: 0.3 } as const
export type Surface = keyof typeof Z0
export const BLEND_M = 60
export const STANDARD_M = 10

/** The factor from a reading at `sensorM` over `from` to 10 m over `to`. */
export function heightFactor(sensorM: number, from: Surface, to: Surface): number {
  const zs = Z0[from]
  const zt = Z0[to]
  const up = Math.log(BLEND_M / zs) / Math.log(Math.max(sensorM, zs * 10) / zs)
  const down = Math.log(STANDARD_M / zt) / Math.log(BLEND_M / zt)
  return up * down
}

const apart = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180)

/** Inside a clockwise sector [from, to], degrees. */
const inSector = (deg: number, [from, to]: readonly [number, number]) => {
  const d = ((deg % 360) + 360) % 360
  return from <= to ? d >= from && d <= to : d >= from || d <= to
}

/** What the wind blew over to reach a beach facing `facingDeg`: water when onshore, the shore behind it when not. Null facing: not a beach, the shore. */
export function spotSurface(fromDeg: number | null, facingDeg: number | null): Surface {
  if (fromDeg === null || facingDeg === null) return 'shore'
  return apart(fromDeg, facingDeg) < 90 ? 'water' : 'shore'
}

export interface StationSite {
  /** CO-OPS number and the NDBC id. */
  ids: readonly string[]
  /** The anemometer above the water or ground under it, m; null when not published. */
  sensorM: number | null
  /** Where it reads open water: clockwise sectors the wind blows from; the rest is the shore. */
  water: readonly (readonly [number, number])[]
  source: string
}

/*
 * THE STATIONS ROUND VIRGINIA BEACH, from NDBC's station pages (read 13 Nov
 * 2026): the anemometer's height above the site plus the site's elevation,
 * so the height over the water. The water sectors from the map (each
 * station's shore). Elsewhere a coastal station's height is not known here:
 * read as 10 m, over water, and said so.
 */
export const STATION_SITES: readonly StationSite[] = [
  { ids: ['8638999', 'CHYV2'], sensorM: 30.6, water: [[270, 110]], source: 'NDBC CHYV2: anemometer 27.9 m above a 2.7 m site; the bay north, the ocean east' },
  { ids: ['8638901', 'CHBV2'], sensorM: 13.0, water: [[0, 360]], source: 'NDBC CHBV2: anemometer 4.3 m above an 8.7 m site on the bridge-tunnel island; water all round' },
  { ids: ['8632200', 'KPTV2'], sensorM: 9.8, water: [[180, 360]], source: 'NDBC KPTV2: anemometer 7.2 m above a 2.6 m site; the bay to the west' },
  { ids: ['8638595', 'CRYV2'], sensorM: 9.6, water: [[0, 360]], source: 'NDBC CRYV2: anemometer 8.6 m above a 1 m site; the harbour round it' },
  { ids: ['8651370', 'DUKN7'], sensorM: 16.3, water: [[340, 160]], source: 'NDBC DUKN7: anemometer 8.6 m above a 7.7 m site at the end of the pier; the ocean east' },
  { ids: ['8638610', 'SWPV2'], sensorM: null, water: [[0, 360]], source: 'NDBC SWPV2: no anemometer height published' },
]

export const AIRPORT_M = 10

export interface Normalized {
  /** At 10 m over the spot's upwind surface, m/s. */
  mps: number
  gustMps: number | null
  factor: number
  sensorM: number
  /** The height was published (an airport's is the standard 10 m); false: read as 10 m. */
  heightKnown: boolean
  from: Surface
  to: Surface
}

/** A reading carried to 10 m over the spot. An airport's is 10 m over grass. */
export function normalizeWind(r: { id: string; kind: 'airport' | 'coastal'; mps: number; gustMps: number | null; fromDeg: number | null }, spotFacing: number | null): Normalized {
  const to = spotSurface(r.fromDeg, spotFacing)
  if (r.kind === 'airport') {
    const factor = heightFactor(AIRPORT_M, 'open', to)
    return { mps: r.mps * factor, gustMps: r.gustMps === null ? null : r.gustMps * factor, factor, sensorM: AIRPORT_M, heightKnown: true, from: 'open', to }
  }
  const site = STATION_SITES.find((s) => s.ids.includes(r.id)) ?? null
  const sensorM = site?.sensorM ?? STANDARD_M
  const from: Surface = site === null || r.fromDeg === null ? 'water' : site.water.some((w) => inSector(r.fromDeg as number, w)) ? 'water' : 'shore'
  const factor = heightFactor(sensorM, from, to)
  return { mps: r.mps * factor, gustMps: r.gustMps === null ? null : r.gustMps * factor, factor, sensorM, heightKnown: site?.sensorM != null, from, to }
}

/** Above this many knots apart after normalizing, the page shows both (Section 2.2). */
export const DISAGREE_KT = 8

/** "7 kt model · Cape Henry reads 23 kt", or null when they are within DISAGREE_KT. */
export function disagreeLine(headKt: number | null, coastal: { label: string; rawKt: number; normKt: number } | null): string | null {
  if (headKt === null || coastal === null) return null
  if (Math.abs(headKt - coastal.normKt) <= DISAGREE_KT) return null
  return `${Math.round(headKt)} kt model · ${coastal.label} reads ${Math.round(coastal.rawKt)} kt`
}

/** Nearest first; at a beach, every coastal station before any airport. */
export function stationOrder<T extends { station: { kind: 'airport' | 'coastal'; km: number } }>(list: readonly T[], coastal: boolean): T[] {
  return [...list].sort((a, b) => (coastal ? Number(a.station.kind === 'airport') - Number(b.station.kind === 'airport') : 0) || a.station.km - b.station.km)
}
