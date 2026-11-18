import type { PlaceState } from './place.ts'

/*
 * THE 3D VIEW'S ONE STATUS, MOST IMPORTANT FIRST (src/components/Clay3D.tsx
 * ClayPill): 3D could not start, the map data did not load, the view still
 * loading, the map data still loading. On 27 Oct three messages stood one
 * over another at the foot of the 3D view.
 */
export type ClayStatus =
  | { kind: 'broken'; why: string }
  | { kind: 'map-failed' }
  | { kind: 'view-loading' }
  | { kind: 'map-loading' }

/** Batch LIVE, Section 5.2: the 3D view not shown this long after it was asked: "3D didn't load · Back to 2D". */
export const CLAY_LOAD_MS = 10_000
/** Batch CORE, Section 2.2: Fly opens within this, or says "Fly didn't load · Back". */
export const FLY_LOAD_MS = 3000

export function clayStatus(failed: string | null, shown: boolean, place: PlaceState): ClayStatus | null {
  if (failed !== null) return { kind: 'broken', why: failed }
  if (place.status === 'failed') return { kind: 'map-failed' }
  if (!shown) return { kind: 'view-loading' }
  if (place.status === 'loading') return { kind: 'map-loading' }
  return null
}


/*
 * FLY OPENS ON ITS OWN (Batch 3D, Section 1.3). Fly waited for the whole 3D
 * view: `shown`, which waits for every near ground picture (up to the
 * scene's SHOW_WITHIN_MS, 30 s), against FLY_LOAD_MS, 3 s. On a phone over
 * a mobile network that is "Not open in 3 s" before the graphics had a say,
 * and with no graphics at all it was the same 3 s card. Now Fly needs only
 * its own minimal start: the scene made, its first frame drawn, the ground
 * at take-off read. The pictures fill in as it flies. A context the phone
 * refused, or took back, is said at once, never after a timer.
 */
export const FLY_NO_GRAPHICS = "Needs 3D graphics this phone didn't allow"

export type FlyGate = { kind: 'open' } | { kind: 'waiting' } | { kind: 'no-graphics'; why: string }

export function flyGate(s: { failed: string | null; lost: boolean; drawn: boolean; groundRead: boolean }): FlyGate {
  if (s.failed !== null) return { kind: 'no-graphics', why: s.failed }
  if (s.lost) return { kind: 'no-graphics', why: 'the phone took back the graphics memory' }
  return s.drawn && s.groundRead ? { kind: 'open' } : { kind: 'waiting' }
}
