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

export function clayStatus(failed: string | null, shown: boolean, place: PlaceState): ClayStatus | null {
  if (failed !== null) return { kind: 'broken', why: failed }
  if (place.status === 'failed') return { kind: 'map-failed' }
  if (!shown) return { kind: 'view-loading' }
  if (place.status === 'loading') return { kind: 'map-loading' }
  return null
}

