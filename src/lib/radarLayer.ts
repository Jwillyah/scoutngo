/*
 * THE RADAR ON THE MAP, WITH ITS TIME (Batch K, Section 6). The past hour is
 * the radar itself (Iowa State's composite, a frame every 10 minutes); the
 * next 90 minutes are a projection: the tracked cells carried along their
 * motion (src/core/stormCells.ts), drawn as rings and labelled as a
 * projection, never as radar. The Weather tab owns the slider; the map
 * listens (PlanMode), as it does for the guide.
 */
import { RADAR_TILES, RADAR_Z } from './stormData.ts'

export const RADAR_EVENT = 'scoutngo:radar'
/* Batch Map, Section 5: the past two hours (board MapChrome), then the projection. */
export const PAST_MIN = 120
export const AHEAD_MIN = 90
export const FRAME_MIN = 10

/** The radar frame to draw, or null to take the radar off the map. */
export function showRadar(at: Date | null): void {
  window.dispatchEvent(new CustomEvent(RADAR_EVENT, { detail: at }))
}

const stamp = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 12)
/** MapLibre's tile template for one composite time. */
export const radarTemplate = (at: Date) => `${RADAR_TILES}/ridge::USCOMP-N0Q-${stamp(at)}/{z}/{x}/{y}.png`
/** The composite is not drawn finer than this; nearer in, MapLibre stretches it. */
export const RADAR_MAX_ZOOM = RADAR_Z + 3

/** Minutes from the scan, oldest first: -60 … 0 (radar), +10 … +90 (projection). */
export function sliderSteps(): number[] {
  const out: number[] = []
  for (let m = -PAST_MIN; m <= AHEAD_MIN; m += FRAME_MIN) out.push(m)
  return out
}
