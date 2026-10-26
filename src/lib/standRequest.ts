/*
 * WHERE "STAND HERE" PUTS THE EYE, from a planned position or the moonrise
 * line-up. Everything comes from the plan: the spot, the planned bearing,
 * the drone height, the focal length the cone was computed from, and the
 * lens's two ends from the kit so the 3D frame can zoom between them.
 */
import type { SensorName } from '../core/fov.ts'
import type { LatLon } from '../core/geo.ts'
import type { KitProfile } from '../core/kit.ts'
import { cameraBearingOf } from '../core/shotType.ts'
import type { PlannedPosition } from './plan.ts'

export interface StandRequest {
  label: string
  at: LatLon
  aimAt: LatLon
  /** The planned camera bearing, when the position has one; else straight at the aim. */
  bearing: number | null
  droneFeet: number | null
  focal: number
  lensMin: number
  lensMax: number
  sensor: SensorName
  tick: number
}

/** The lens's ends from the kit; a drone camera, or a lens no longer in the kit, is fixed at its focal length. */
export function lensEnds(kit: KitProfile, opticId: string, focal: number): [number, number] {
  const lens = kit.lenses.find((l) => l.id === opticId)
  return lens === undefined ? [focal, focal] : [lens.minFocalLength, lens.maxFocalLength]
}

export function standAtPosition(p: PlannedPosition, kit: KitProfile, subject: LatLon, tick: number): StandRequest {
  const [lensMin, lensMax] = lensEnds(kit, p.optic.id, p.focalLength)
  return {
    label: `position ${p.position.number}`,
    at: p.position.at,
    aimAt: subject,
    bearing: cameraBearingOf(p.aim),
    droneFeet: p.position.platform === 'air' ? p.position.altitudeFeet : null,
    focal: p.focalLength,
    lensMin,
    lensMax,
    sensor: p.sensor,
    tick,
  }
}

/**
 * The moonrise line-up: the first stand point, where the moon sits behind the
 * target at 2 degrees, facing the target, on the longest lens. The caller
 * moves the time bar to that stand's time.
 */
export function standForLineUp(
  stand: { stand: LatLon; at: Date; altitude: number },
  target: LatLon,
  lens: { id: string; minFocalLength: number; maxFocalLength: number } | null,
  sensor: SensorName,
  tick: number,
): StandRequest {
  const focal = lens?.maxFocalLength ?? 50
  return {
    label: `the line-up, moon at ${stand.altitude}°`,
    at: stand.stand,
    aimAt: target,
    bearing: null,
    droneFeet: null,
    focal,
    lensMin: lens?.minFocalLength ?? focal,
    lensMax: focal,
    sensor,
    tick,
  }
}
