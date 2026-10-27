/*
 * THE WATER'S EDGE ON THE SCANNED BEACH, AT THE TIME ON THE BAR.
 *
 * The tide comes from NOAA in feet above MLLW (the station's low-water
 * datum); the scan's ground is in metres on NAVD88 (it matches our elevation,
 * measurements/2026-10-27-lidar-stop.md). The bridge between them is the
 * station's published offset, NAVD88 above MLLW.
 *
 * WHICH OFFSET. The venue's own station when it publishes MLLW and NAVD88
 * (a thin line: NOAA's own number). Otherwise one is BORROWED, and said so:
 * the nearest station that publishes both and sits on open water (a quarter
 * or more of the 5 km around it is ocean on the map tiles; a station up a bay
 * has a different tide), else the nearest that publishes both at all.
 *
 * HOW SURE. A borrowed offset is checked a second way: scaled to the venue's
 * own tide range (MLLW sits below mean sea level in proportion to the range,
 * and the venue's range is known from its own predictions). The two
 * disagree by some centimetres; that disagreement is the uncertainty, and the
 * waterline is drawn as a band that wide in height, which on a beach of run
 * R per metre of rise is R times as wide on the ground: said in feet.
 */
export interface StationDatums {
  id: string
  name: string
  lat: number
  lon: number
  /** Metres on the station's own zero (STND), as NOAA publishes them. */
  mllw: number | null
  navd88: number | null
  msl: number | null
  /** Great diurnal range, metres. */
  gt: number | null
}

export const OPEN_WATER_SHARE = 0.25
/* An offset NOAA publishes for the venue's own station: drawn as a line this wide in height either side. */
export const OWN_UNCERTAINTY_M = 0.02
/* The least a borrowed offset is ever credited with. */
export const MIN_BORROWED_UNCERTAINTY_M = 0.03

/** NAVD88 above MLLW at a station, metres, or null when it does not publish both. */
export const offsetOf = (d: StationDatums): number | null => (d.mllw === null || d.navd88 === null ? null : d.navd88 - d.mllw)

/** The same offset scaled to another place's tide range (the second way). */
export function offsetScaled(donor: StationDatums, venueGt: number): number | null {
  if (donor.mllw === null || donor.navd88 === null || donor.msl === null || donor.gt === null || donor.gt <= 0) return null
  return donor.navd88 - donor.msl + ((donor.msl - donor.mllw) / donor.gt) * venueGt
}

export interface OffsetChoice {
  station: StationDatums
  borrowed: boolean
  openWater: boolean
  distanceKm: number
  /** NAVD88 above MLLW, metres. */
  offsetM: number
  /** The second way, when borrowed. */
  checkM: number | null
  uncertaintyM: number
}

export interface Candidate {
  datums: StationDatums
  distanceKm: number
  /** Share of the 5 km around it that is ocean on the map tiles. */
  oceanShare: number
}

/** `own` is the venue's own station's datums, when it has a station; `candidates` the others, any order. */
export function chooseOffset(own: StationDatums | null, candidates: readonly Candidate[], venueGt: number | null): OffsetChoice | null {
  if (own !== null) {
    const o = offsetOf(own)
    if (o !== null) return { station: own, borrowed: false, openWater: true, distanceKm: 0, offsetM: o, checkM: null, uncertaintyM: OWN_UNCERTAINTY_M }
  }
  const usable = [...candidates].filter((c) => offsetOf(c.datums) !== null).sort((a, b) => a.distanceKm - b.distanceKm)
  const pick = usable.find((c) => c.oceanShare >= OPEN_WATER_SHARE) ?? usable[0]
  if (pick === undefined) return null
  const offsetM = offsetOf(pick.datums) as number
  const checkM = venueGt === null ? null : offsetScaled(pick.datums, venueGt)
  return {
    station: pick.datums,
    borrowed: true,
    openWater: pick.oceanShare >= OPEN_WATER_SHARE,
    distanceKm: pick.distanceKm,
    offsetM,
    checkM,
    uncertaintyM: Math.max(MIN_BORROWED_UNCERTAINTY_M, checkM === null ? 0.1 : Math.abs(offsetM - checkM)),
  }
}

/** Mean of the rises and falls between consecutive turns, metres: the venue's own tide range, from its predictions. */
export function meanRange(turns: readonly { feet: number }[]): number | null {
  if (turns.length < 2) return null
  let sum = 0
  for (let i = 1; i < turns.length; i += 1) sum += Math.abs(turns[i].feet - turns[i - 1].feet)
  return (sum / (turns.length - 1)) * 0.3048
}

/** The water's height on NAVD88, metres, for a tide in feet above MLLW. */
export const waterNavd = (tideFtMllw: number, offsetM: number): number => tideFtMllw * 0.3048 - offsetM

export interface WaterRaster {
  width: number
  height: number
  cellM: number
  dtm: Float32Array
}

export const KIND_DRY = 0
export const KIND_BAND = 1
export const KIND_WET_SAND = 2
export const KIND_THIN = 3
export const KIND_SEA = 4
/* A beach flatter than 1 in this many is where a thin film of water lies still: the reflection zone. */
export const THIN_RUN = 40

/** Run per metre of rise at a cell, from its neighbours, or null at the edge. */
export function runAt(r: WaterRaster, i: number): number | null {
  const x = i % r.width
  const y = (i / r.width) | 0
  if (x < 1 || y < 1 || x >= r.width - 1 || y >= r.height - 1) return null
  const gx = (r.dtm[i + 1] - r.dtm[i - 1]) / (2 * r.cellM)
  const gy = (r.dtm[i + r.width] - r.dtm[i - r.width]) / (2 * r.cellM)
  const g = Math.hypot(gx, gy)
  return g < 1e-6 ? Infinity : 1 / g
}

export interface WaterlineMap {
  kind: Uint8Array
  /** Median run per rise across the band, for its width. */
  run: number | null
  /** The band's width on the ground, feet: 2 x uncertainty x run. */
  widthFt: number | null
}

/**
 * Every cell sorted: in the band (within the uncertainty of the water level),
 * wet sand (between low tide and the water now, uncovered), the thin-water
 * zone (wet sand at low tide that is flat), the sea, or dry.
 */
export function waterlineMap(r: WaterRaster, levelM: number, lowLevelM: number, uncertaintyM: number, measured: (i: number) => boolean = () => true): WaterlineMap {
  const kind = new Uint8Array(r.width * r.height)
  const runs: number[] = []
  for (let i = 0; i < kind.length; i += 1) {
    const z = r.dtm[i]
    /*
     * Only where the scan measured ground: under the water there were no
     * ground returns, and the raster there is filled in from the beach
     * around it, which would put a waterline on the sea.
     */
    if (Number.isNaN(z) || !measured(i)) continue
    if (Math.abs(z - levelM) <= uncertaintyM) {
      kind[i] = KIND_BAND
      const run = runAt(r, i)
      if (run !== null && Number.isFinite(run)) runs.push(run)
    } else if (z < levelM) kind[i] = KIND_SEA
    else if (z >= lowLevelM && z < levelM + uncertaintyM) kind[i] = KIND_WET_SAND
  }
  /* The thin-water zone: at low tide, the flat strip just above the water. */
  for (let i = 0; i < kind.length; i += 1) {
    const z = r.dtm[i]
    if (Number.isNaN(z) || !measured(i) || z < lowLevelM || z > lowLevelM + 0.3) continue
    const run = runAt(r, i)
    if (run !== null && run >= THIN_RUN && kind[i] !== KIND_BAND) kind[i] = KIND_THIN
  }
  runs.sort((a, b) => a - b)
  const run = runs.length === 0 ? null : runs[runs.length >> 1]
  return { kind, run, widthFt: run === null ? null : (2 * uncertaintyM * run) / 0.3048 }
}

/**
 * Where the scan measured ground: a cell with ground returns, or one cell (a
 * metre) from one. The scan's ground thins out near the water, and a hole of a
 * cell or two on the beach is not the sea; the sea, filled in from the beach
 * over many cells, stays out.
 */
export function nearGround(ground: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(ground.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0
      for (let dy = -1; dy <= 1 && hit === 0; dy += 1) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx
          if (xx >= 0 && xx < width && ground[yy * width + xx] === 1) {
            hit = 1
            break
          }
        }
      }
      out[y * width + x] = hit
    }
  }
  return out
}

/* Near the water the ground returns thin out: a crossing may span this many unmeasured cells between two measured ones. */
export const CROSSING_GAP = 3

/** The second way to find the edge: walk a line of cells and return where the measured ground crosses the level (cell index), or null. */
export function crossingAlong(r: WaterRaster, cells: readonly number[], levelM: number, measured: (i: number) => boolean = () => true): number | null {
  let prev = -1
  for (let k = 0; k < cells.length; k += 1) {
    const b = r.dtm[cells[k]]
    if (!measured(cells[k]) || Number.isNaN(b)) continue
    if (prev >= 0 && k - prev <= CROSSING_GAP + 1) {
      const a = r.dtm[cells[prev]]
      if ((a - levelM) * (b - levelM) <= 0) return Math.abs(a - levelM) <= Math.abs(b - levelM) ? cells[prev] : cells[k]
    }
    prev = k
  }
  return null
}

export const borrowedLabel = (c: OffsetChoice, distance: string): string =>
  c.borrowed ? `Height offset borrowed from ${c.station.name}, ${distance} away.` : `Height offset from ${c.station.name}, this venue's own station.`
