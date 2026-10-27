import type { PathPoint } from '../../core/flight.ts'
import type { LatLon } from '../../core/geo.ts'

/* Playing a Preflight move in the 3D view (Clay3D.tsx, clayScene.ts playPath). */
export interface FlightPlay {
  path: PathPoint[]
  /** What the camera looks at. */
  subject: LatLon
  /** Where it takes off: heights in the path are above the ground here. */
  takeoff: LatLon
  /** Full-frame equivalent focal length of the Air 3S camera chosen: 24 or 70. */
  focal: 24 | 70
  /** The time the move starts at; the time bar follows the move. */
  startAt: Date
  /** Record the preview as video, watermarked. */
  record: boolean
  tick: number
}

export const WATERMARK = 'Simulated from public map data'

/** Horizontal field of view, degrees, of a full-frame-equivalent focal length. */
export const horizontalFov = (focal: number): number => (2 * Math.atan(36 / (2 * focal)) * 180) / Math.PI
