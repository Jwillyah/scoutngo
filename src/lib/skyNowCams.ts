/*
 * SKY › NOW'S CAMS (Batch SIMPLE-2, Sections 4 and 6.4): the moment the pick
 * is made for, worked out from the sun, then src/core/camPick.ts skyCams.
 * Pure; the page loads src/data/cams.json lazily and passes it in.
 *
 *   big     skyCams' big one: within 90 min of sunrise or sunset the cam
 *           facing the sun, else the one facing the observed deck, else the
 *           nearest (said as such)
 *   strip   the next SKY_STRIP sky cams, nearest first
 *   road    the road-only cams in the same reach, for "Show all"; the same filter
 *           as skyCams' hiddenRoadOnlyCount (held equal in its test)
 *
 * The deck's bearing: a station report says how much cloud and how high,
 * never which way, so no observed bearing exists here and the caller passes
 * null; outside the sun's window the big cam is then the nearest.
 *
 * NO IMAGE IS FETCHED OR KEPT HERE. A cam with embed false is a link out to
 * its owner's page; nothing in the app requests it.
 */
import { getPosition, getTimes } from 'suncalc'
import { skyCams, type CamAt, type CamEntry, type SkyMoment, type SkyPick } from '../core/camPick.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { CAM_MAX_KM } from '../core/skyCams.ts'
import { normalizeBearing } from '../core/sun.ts'

/** How many sky cams sit in the row under the big one. */
export const SKY_STRIP = 4

const MIN = 60_000
const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

/** The sun now, and the minutes to or since the nearest sunrise or sunset (yesterday's, today's or tomorrow's). */
export function skyMomentAt(spot: LatLon, now: Date, cloudDeckBearingDeg: number | null = null): SkyMoment {
  const sunAzimuthDeg = normalizeBearing(getPosition(now, spot.lat, spot.lon).azimuth)
  const events = [-1, 0, 1].flatMap((d) => {
    const t = getTimes(new Date(now.getTime() + d * 1440 * MIN), spot.lat, spot.lon)
    return [t.sunrise, t.sunset].filter(usable)
  })
  const nearest = events.length === 0 ? null : events.map((e) => (e.getTime() - now.getTime()) / MIN).sort((a, b) => Math.abs(a) - Math.abs(b))[0]
  return { sunAzimuthDeg, minutesFromSunEvent: nearest === null ? null : Math.round(nearest), cloudDeckBearingDeg }
}

export interface SkyNowCams extends SkyPick {
  strip: CamAt[]
  road: CamAt[]
}

/** The Now tab's cams at `now`: the big one, the row of four, and the road-only ones "Show all" opens. */
export function skyNowCams(spot: LatLon, cams: readonly CamEntry[], now: Date, maxKm = CAM_MAX_KM): SkyNowCams {
  const pick = skyCams(spot, cams, skyMomentAt(spot, now), maxKm)
  const road = cams
    .filter((c) => c.tags.includes('road') && !c.tags.includes('sky'))
    .map((cam) => ({ cam, km: distanceMeters(spot, { lat: cam.lat, lon: cam.lon }) / 1000 }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km || a.cam.id.localeCompare(b.cam.id))
  return { ...pick, strip: pick.others.slice(0, SKY_STRIP), road }
}

/** "traffic cam", "surf cam", "cam": what a cam is, by its tags. */
export function camKind(cam: CamEntry): string {
  return cam.tags.includes('surf') ? 'surf cam' : cam.tags.includes('road') ? 'traffic cam' : 'cam'
}
