/*
 * The field pack: everything FIELD needs, on the device, before you leave.
 *
 * WHY THIS EXISTS. Venues have bad signal. FIELD recomputes light and tide
 * locally, which needs no network, but two things do: the Street View photo for
 * each position, and NOAA's tide predictions. Without them the most useful mode
 * degrades at exactly the moment it is being used.
 *
 * NEVER AUTOMATIC. Building a pack sends every position's coordinates to Google
 * to fetch its ground view. That is a real disclosure and it happens only when
 * the shooter presses the button that says so. The rest of the app keeps the
 * opt-in stance described in README.md, and so does this: nothing here runs on
 * its own, on a timer, or as a side effect of generating a plan.
 *
 * A PACK FROM A DIFFERENT PLAN IS WORSE THAN NO PACK. It would show yesterday's
 * positions with today's confidence. So every pack carries a fingerprint of the
 * plan it was built from, and anything that would change where you stand, the
 * venue, the window, or any position, changes that fingerprint and retires the
 * pack.
 */

import type { FramingWarning } from '../core/fov.ts'
import type { LatLon } from '../core/geo.ts'
import type { Classification } from '../core/lighting.ts'
import type { SiteWarning } from '../core/siting.ts'
import type { TideExtreme, TideSample } from '../core/tide.ts'
import { fetchGroundView } from './groundView.ts'
import type { PlannedPosition } from './plan.ts'
import type { Platform } from './parsePlan.ts'

export const FIELD_PACK_KEY = 'scoutngo.fieldpack.v1'
export const FIELD_PACK_VERSION = 1

/** One position, flattened to exactly what a field card renders. */
export interface PackedPosition {
  id: string
  number: number
  shot: string
  risk: string
  focalLength: number
  platform: Platform
  altitudeFeet: number
  at: LatLon
  /** Where the camera points. Computed by src/core/, stored, never re-derived. */
  cameraBearing: number
  /** From the subject outward. What classifyLighting wants at any moment. */
  positionBearing: number
  subjectRangeMeters: number
  /** The class at the time the plan was made, for the "light has moved" line. */
  lightingPlanned: Classification
  warnings: SiteWarning[]
  framingWarnings: FramingWarning[]
  /** Base64 data URL, or a plain reason there is no picture. */
  groundView: { status: 'ok'; image: string } | { status: 'none'; message: string }
}

export interface PackedTide {
  extremes: TideExtreme[]
  curve: TideSample[]
}

export interface FieldPack {
  version: number
  /** ISO instant the pack was built. Shown so a stale pack is visible as stale. */
  madeAt: string
  fingerprint: string
  venue: LatLon
  positions: PackedPosition[]
  /** Absent inland, or when NOAA was unavailable when the pack was built. */
  tide?: PackedTide
}

/**
 * A stable signature of the plan a pack was built for.
 *
 * Deliberately includes everything that changes where a person stands or what
 * they shoot: the venue, the window, and each position's coordinates, optic and
 * shot text. Dragging one position two metres changes it, which is correct, a
 * moved position is a different place to walk to.
 *
 * Coordinates are rounded to six decimals, about a tenth of a metre, so floating
 * point noise cannot retire a pack that is really still valid.
 */
export function fingerprintPlan(
  venue: LatLon | null,
  windowKey: string,
  plan: PlannedPosition[],
): string {
  const at = (p: LatLon) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
  const venuePart = venue === null ? 'no-venue' : at(venue)
  const positions = plan
    .map((entry) => {
      const p = entry.position
      return [
        p.id,
        at(p.at),
        p.lensId,
        p.focalLength,
        p.platform,
        p.altitudeFeet,
        p.shot,
      ].join('~')
    })
    .join('|')
  return `v${FIELD_PACK_VERSION}::${venuePart}::${windowKey}::${positions}`
}

/** The window half of the fingerprint. Empty when the window has not resolved. */
export function windowKeyOf(
  venueWindow: { start: Date; end: Date; timeZone: string } | null,
): string {
  if (venueWindow === null) return 'no-window'
  return `${venueWindow.start.toISOString()}~${venueWindow.end.toISOString()}~${venueWindow.timeZone}`
}

/* ------------------------------------------------------------- storage */

export type PackSaveResult =
  | { status: 'ok'; bytes: number }
  | { status: 'error'; reason: string }

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22)

/**
 * Writes the pack, and says so plainly if it cannot.
 *
 * A pack that failed to save must never look like one that succeeded: the
 * shooter would walk out believing they have offline photos and find out at the
 * venue that they do not.
 */
export function savePack(pack: FieldPack): PackSaveResult {
  let serialised: string
  try {
    serialised = JSON.stringify(pack)
  } catch {
    return { status: 'error', reason: 'The pack could not be encoded.' }
  }

  try {
    localStorage.setItem(FIELD_PACK_KEY, serialised)
    return { status: 'ok', bytes: serialised.length }
  } catch (error) {
    if (isQuotaError(error)) {
      /*
       * Out of room. Drop the images and retry with the computed values alone:
       * a pack without pictures still makes FIELD work offline for everything
       * except the photo, which is far better than no pack. The caller is told
       * which of the two it got.
       */
      const lean: FieldPack = {
        ...pack,
        positions: pack.positions.map((p) => ({
          ...p,
          groundView: {
            status: 'none' as const,
            message: 'Not cached: the browser ran out of storage.',
          },
        })),
      }
      try {
        localStorage.setItem(FIELD_PACK_KEY, JSON.stringify(lean))
        return {
          status: 'error',
          reason:
            'Out of browser storage, so the photos were not cached. Everything else is saved and Field mode still works offline.',
        }
      } catch {
        return {
          status: 'error',
          reason: 'Out of browser storage. Nothing was cached. Free some space and try again.',
        }
      }
    }
    return { status: 'error', reason: 'The browser refused to save the pack.' }
  }
}

/** Anything unreadable is treated as absent rather than thrown. */
export function loadPack(): FieldPack | null {
  try {
    const raw = localStorage.getItem(FIELD_PACK_KEY)
    if (raw === null) return null
    const pack = JSON.parse(raw) as FieldPack
    if (pack?.version !== FIELD_PACK_VERSION) return null
    if (!Array.isArray(pack.positions) || typeof pack.fingerprint !== 'string') return null
    return revivePack(pack)
  } catch {
    return null
  }
}

/** JSON has no Date, so the tide instants come back as strings. */
export function revivePack(pack: FieldPack): FieldPack {
  if (pack.tide === undefined) return pack
  return {
    ...pack,
    tide: {
      extremes: pack.tide.extremes.map((e) => ({ ...e, at: new Date(e.at) })),
      curve: pack.tide.curve.map((s) => ({ ...s, at: new Date(s.at) })),
    },
  }
}

export function clearPack(): void {
  try {
    localStorage.removeItem(FIELD_PACK_KEY)
  } catch {
    // Storage disabled: there was nothing cached to clear.
  }
}

/** Does this pack describe the plan currently on screen? */
export const packMatches = (pack: FieldPack | null, fingerprint: string): boolean =>
  pack !== null && pack.fingerprint === fingerprint

/* ------------------------------------------------------------- building */

/**
 * Builds a pack, fetching each position's ground view.
 *
 * THIS IS THE ONLY PLACE COORDINATES GO TO GOOGLE IN BULK, and it runs only from
 * an explicit press. Failures per position are recorded as a reason rather than
 * aborting the pack: one position with no Street View coverage should not cost
 * the other five their photos.
 */
export async function buildPack(
  venue: LatLon,
  fingerprint: string,
  plan: PlannedPosition[],
  tide: PackedTide | undefined,
  onProgress?: (done: number, total: number) => void,
): Promise<FieldPack> {
  const positions: PackedPosition[] = []

  for (const [index, entry] of plan.entries()) {
    const p = entry.position
    const view = await fetchGroundView(p.at, entry.cameraBearing, entry.fov.hFOV)
    positions.push({
      id: p.id,
      number: p.number,
      shot: p.shot,
      risk: p.risk,
      focalLength: p.focalLength,
      platform: p.platform,
      altitudeFeet: p.altitudeFeet,
      at: p.at,
      cameraBearing: entry.cameraBearing,
      positionBearing: entry.positionBearing,
      subjectRangeMeters: entry.subjectRangeMeters,
      lightingPlanned: entry.lighting.classification,
      warnings: entry.warnings,
      framingWarnings: entry.framingWarnings,
      groundView:
        view.status === 'ok'
          ? { status: 'ok', image: view.image }
          : {
              status: 'none',
              // idle and loading cannot survive an awaited fetch, but the union
              // includes them, so name a reason rather than assert they are gone.
              message:
                'message' in view ? view.message : 'No ground view for this position.',
            },
    })
    onProgress?.(index + 1, plan.length)
  }

  return {
    version: FIELD_PACK_VERSION,
    madeAt: new Date().toISOString(),
    fingerprint,
    venue,
    positions,
    ...(tide === undefined ? {} : { tide }),
  }
}
