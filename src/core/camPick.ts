/*
 * WHICH CAMS, AND WHICH ONE BIG (Batch SIMPLE-2, Section 6).
 *
 * Pure: the list is src/data/cams.json (scripts/build-cams.mjs), passed in.
 * Nothing here fetches; whether a cam may play in the app is its `embed`
 * (docs/sources-licenses.md, "Cam sources"), and the UI decides how to show
 * that. Which cam is remembered is the UI's, on the phone: resolveCam only
 * finds a stored id in a list.
 *
 * FACING. `facing` is where the cam looks, in degrees, or null when nobody
 * can say. 'sea' is the sea's direction from a beach cam's beach; 'name' is
 * read from the cam's own name ("Toward Berkley Bridge"). A VDOT lane label
 * is never a facing. A null facing is never offered as looking anywhere.
 */
import { angleApart } from './coastFacing.ts'
import { distanceMeters, type LatLon } from './geo.ts'
import { CAM_MAX_KM } from './skyCams.ts'

export type CamTag = 'sky' | 'surf' | 'road'

export interface CamEntry {
  id: string
  name: string
  lat: number
  lon: number
  /** An id in data/cam-sources.json. */
  source: string
  operator: string
  url: string
  access: 'free' | 'paid'
  tags: readonly CamTag[]
  facing: number | null
  facingIs: 'sea' | 'name' | null
  /** May the phone show the owner's image in the app; false means link out only. */
  embed: boolean
}

export interface CamAt {
  cam: CamEntry
  km: number
}

/** Surf cams within 30 mi, the Surf page's reach (docs/cams.md). */
export const SURF_CAMS_KM = 48.28
/** Within this of sunrise or sunset the big sky cam is the one facing the sun: 90 minutes. */
export const SUN_EVENT_WINDOW_MIN = 90
/** A cam "faces" a line when its facing is within this of it: the half of the sky on that side, 90°. */
export const SKY_FACING_HALF_DEG = 90

const within = (spot: LatLon, cams: readonly CamEntry[], maxKm: number, keep: (c: CamEntry) => boolean): CamAt[] =>
  cams
    .filter(keep)
    .map((cam) => ({ cam, km: distanceMeters(spot, { lat: cam.lat, lon: cam.lon }) / 1000 }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km || a.cam.id.localeCompare(b.cam.id))

/** Surf-tagged cams within maxKm, nearest first. */
export function surfCams(spot: LatLon, cams: readonly CamEntry[], maxKm = SURF_CAMS_KM): CamAt[] {
  return within(spot, cams, maxKm, (c) => c.tags.includes('surf'))
}

export interface SkyMoment {
  /** The sun's azimuth now, degrees from north (computed by the caller from suncalc). */
  sunAzimuthDeg: number
  /** Minutes to or since the nearest sunrise or sunset; null when there is none (polar day or night). */
  minutesFromSunEvent: number | null
  /** The bearing from the spot toward the observed cloud deck; null when none is observed. */
  cloudDeckBearingDeg: number | null
}

/** Why the big cam is the big one: it faces the sun, it faces the cloud deck, or it is just the nearest. */
export type BigWhy = 'sun' | 'deck' | 'nearest'

export interface SkyPick {
  big: CamAt | null
  bigWhy: BigWhy | null
  /** How far the big cam's facing is from the line it was picked for; null when picked as the nearest. */
  bigOffDeg: number | null
  /** Every other sky cam in reach, nearest first. */
  others: CamAt[]
  /** Road cams in reach not tagged sky: "N road-only cams hidden". */
  hiddenRoadOnlyCount: number
}

/** The line the big cam should look along now, and why; null when there is none to look along. */
export function skyLine(moment: SkyMoment): { deg: number; why: 'sun' | 'deck' } | null {
  const m = moment.minutesFromSunEvent
  if (m !== null && Number.isFinite(m) && Math.abs(m) <= SUN_EVENT_WINDOW_MIN && Number.isFinite(moment.sunAzimuthDeg)) return { deg: moment.sunAzimuthDeg, why: 'sun' }
  const d = moment.cloudDeckBearingDeg
  return d !== null && Number.isFinite(d) ? { deg: d, why: 'deck' } : null
}

/**
 * Every sky-tagged cam within maxKm. The big one faces the sun within 90 min
 * of sunrise or sunset, otherwise the observed cloud deck: the cam whose
 * recorded facing is closest to that line, within SKY_FACING_HALF_DEG (ties to
 * the nearer). No line, or no cam facing it: the nearest, said as such.
 */
export function skyCams(spot: LatLon, cams: readonly CamEntry[], moment: SkyMoment, maxKm = CAM_MAX_KM): SkyPick {
  const sky = within(spot, cams, maxKm, (c) => c.tags.includes('sky'))
  const hiddenRoadOnlyCount = within(spot, cams, maxKm, (c) => c.tags.includes('road') && !c.tags.includes('sky')).length
  if (sky.length === 0) return { big: null, bigWhy: null, bigOffDeg: null, others: [], hiddenRoadOnlyCount }

  const line = skyLine(moment)
  let big: CamAt = sky[0]
  let bigWhy: BigWhy = 'nearest'
  let bigOffDeg: number | null = null
  if (line !== null) {
    const facing = sky
      .filter((x) => x.cam.facing !== null)
      .map((x) => ({ x, off: angleApart(x.cam.facing as number, line.deg) }))
      .filter((f) => f.off <= SKY_FACING_HALF_DEG)
      .sort((a, b) => a.off - b.off || a.x.km - b.x.km)
    if (facing.length > 0) {
      big = facing[0].x
      bigWhy = line.why
      bigOffDeg = Math.round(facing[0].off)
    }
  }
  return { big, bigWhy, bigOffDeg, others: sky.filter((x) => x !== big), hiddenRoadOnlyCount }
}

/** A stored cam id found in a list (the remembered cam); null when it is not there any more. */
export function resolveCam(id: string | null | undefined, list: readonly CamAt[]): CamAt | null {
  if (id === null || id === undefined || id === '') return null
  return list.find((x) => x.cam.id === id) ?? null
}
