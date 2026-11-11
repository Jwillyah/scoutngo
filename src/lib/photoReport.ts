import type { PhotoFacts } from '../core/exif.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { spotKey } from '../core/spotSkill.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'

/*
 * A PHOTO PREFILLS A REPORT (Batch Polish, Section 6). Its time (with the
 * camera's own offset, else its wall clock read in the spot's zone), and,
 * when it carried a position, the nearest spot within PHOTO_SPOT_M of it:
 * this one, a saved spot or a surf spot. The position picks the spot and is
 * dropped; the report keeps the spot's key and name, never the photo's
 * coordinates.
 */
export const PHOTO_SPOT_M = 3000
/* A report counts against the live buoy only when it is about now. */
export const BUOY_WITHIN_MS = 3_600_000

export interface SpotChoice {
  key: string
  name: string
  at: LatLon
}

export interface PhotoPrefill {
  /** When it was seen, ms; null when the photo did not say. */
  at: number | null
  /** The spot it was taken at; null when it carried no position or none is within PHOTO_SPOT_M. */
  spot: { key: string; name: string } | null
  note: string
}

export function photoPrefill(facts: PhotoFacts, here: SpotChoice, others: readonly SpotChoice[], timeZone: string): PhotoPrefill {
  let at = facts.at
  if (at === null && facts.wallClock !== null) {
    const [d, t] = facts.wallClock.split(' ')
    at = zonedTimeToUtc(d.replace(/:/g, '-'), t.slice(0, 5), timeZone)?.getTime() ?? null
  }
  let spot: PhotoPrefill['spot'] = null
  if (facts.where !== null) {
    const near = [here, ...others]
      .map((s) => ({ s, m: distanceMeters(facts.where as LatLon, s.at) }))
      .filter((x) => x.m <= PHOTO_SPOT_M)
      .sort((a, b) => a.m - b.m)[0]
    spot = near === undefined ? null : { key: near.s.key, name: near.s.name }
  }
  const note =
    at === null && facts.where === null
      ? 'The photo carried no time or place: the report is for now, here.'
      : `From the photo: ${at === null ? 'no time' : 'its time'}${facts.where === null ? ', no place' : spot === null ? ', not near a spot you have' : spot.key === here.key ? ', here' : `, near ${spot.name}`}. The photo is not kept.`
  return { at, spot, note }
}

export const choice = (name: string, at: LatLon): SpotChoice => ({ key: spotKey(at), name, at })
