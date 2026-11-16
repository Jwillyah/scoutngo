import { destinationPoint, type LatLon } from './geo.ts'

/*
 * THE PILOT FIGURE IN FLY (Batch DRONE, Section 2.5). It stood exactly at
 * the takeoff point, so at takeoff the camera sat about half a metre from a
 * plain white 6 ft body: the "white shape 5 ft in front of the camera"
 * (Batch CORE, Section 2). It now stands PILOT_BEHIND_M behind takeoff, on
 * the side opposite the drone's starting heading, and is hidden while the
 * drone is within PILOT_HIDE_WITHIN_M of it.
 */
export const PILOT_BEHIND_M = 4
export const PILOT_HIDE_WITHIN_M = 10

/** Where the figure stands: PILOT_BEHIND_M from takeoff, opposite the start heading (degrees from north). */
export function pilotSpot(takeoff: LatLon, startHeadingDeg: number): LatLon {
  return destinationPoint(takeoff, (((startHeadingDeg + 180) % 360) + 360) % 360, PILOT_BEHIND_M)
}

/** Whether the figure is drawn, from the drone's distance to it in metres. */
export function pilotShown(droneToPilotM: number): boolean {
  return droneToPilotM >= PILOT_HIDE_WITHIN_M
}
