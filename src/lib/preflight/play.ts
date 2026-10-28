import type { PathPoint } from '../../core/flight.ts'
import type { LatLon } from '../../core/geo.ts'
import type { CinemaInputs, Look } from '../../three/cinema.ts'

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
  /** Record the preview as video, watermarked: rendered frame by frame, then encoded at a steady 30 fps. */
  record: boolean
  /** The look: Real (the imagery as it is) or Animated (painted). */
  look: Look
  /** The forecast the sky, sea and clouds are drawn from, or null for the plain clay model. */
  cinema: CinemaInputs | null
  tick: number
}

export const WATERMARK = 'Simulated from public map data'

/** What the preview says over itself: the watermark, and what is illustrative or not known in it. */
export function previewNote(cinema: CinemaInputs | null, cloudsDrawn: boolean): string {
  const parts = [WATERMARK]
  if (cloudsDrawn) parts.push('Clouds illustrative')
  if (cinema !== null && cinema.seaMask !== null && cinema.waterLevelM === null) parts.push('Water height not known')
  return parts.join(' · ')
}

/** Horizontal field of view, degrees, of a full-frame-equivalent focal length. */
export const horizontalFov = (focal: number): number => (2 * Math.atan(36 / (2 * focal)) * 180) / Math.PI
