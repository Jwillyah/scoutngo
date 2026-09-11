import type { SensorName } from './fov.ts'

export type BodyRole = 'video' | 'photo' | 'drone'

export interface Body {
  id: string
  name: string
  role: BodyRole
  /** Native sensor area of the body. A lens may force a smaller one. */
  sensor: SensorName
  notes: string
}

export interface Lens {
  id: string
  name: string
  minFocalLength: number
  maxFocalLength: number
  /** Widest aperture, or null when not stated in the profile. */
  maxAperture: number | null
  /**
   * Bodies on which this lens forces a sensor area other than the body's native
   * one. The Sony 10-18 f4 triggers APS-C crop automatically on the a7IV.
   */
  forcesSensor: { bodyId: string; sensor: SensorName }[]
  notes: string
}

/**
 * One fixed camera on a drone.
 *
 * THE AIR 3S IS NOT A ZOOM. It carries two separate cameras at two fixed focal
 * lengths, and the kit used to model it as a focal RANGE, which let the model
 * ask for 45mm on an aircraft that cannot produce 45mm. Each camera is its own
 * entry here, with one focal length and no range.
 *
 * `equiv35` is the 35mm equivalent, which is how DJI publish these. Field of view
 * is computed from it against a full frame sensor, because that is precisely what
 * "35mm equivalent" means: the focal length giving this angle of view on full
 * frame. That keeps drone optics on the same arithmetic as the ground lenses
 * instead of a second, parallel calculation. The check that it is right: DJI
 * quote 84 degrees for the wide camera and 35 for the tele, and computeFOV at 24
 * and 70 on full frame returns 84.1 and 34.4 diagonal. Pinned in kit.test.ts.
 */
export interface DroneCamera {
  id: string
  name: string
  /** 35mm equivalent focal length. The only focal length this camera has. */
  equiv35: number
  maxAperture: number
  /** The physical sensor, recorded from the spec sheet. NOT used by the FOV math. */
  sensorNote: string
  /** The manufacturer's published diagonal FOV, kept so the math can be checked. */
  publishedDiagonalFOV: number
}

export interface Drone {
  id: string
  name: string
  weightGrams: number
  cameras: DroneCamera[]
  notes: string
}

export interface ShootingStyle {
  /** Roughly what share of ground time is spent on long glass, 0 to 1. */
  longGlassShareOfGroundTime: number
  droneHeavy: boolean
  rarelyShootsWide: boolean
  deliverables: {
    orientation: 'vertical' | 'horizontal'
    minSeconds: number
    maxSeconds: number
  }
  notes: string[]
}

export interface KitProfile {
  id: string
  name: string
  bodies: Body[]
  lenses: Lens[]
  drones: Drone[]
  style: ShootingStyle
}

/**
 * Default kit profile, taken from the gear section of docs/brief.md.
 * Plain data so it can become a user editable profile later.
 */
export const DEFAULT_KIT: KitProfile = {
  id: 'default',
  name: 'Default kit',
  bodies: [
    { id: 'a7iv', name: 'Sony a7IV', role: 'video', sensor: 'fullFrame', notes: 'Primary video body' },
    { id: 'a7iii', name: 'Sony a7III', role: 'photo', sensor: 'fullFrame', notes: 'Primary photo body' },
  ],
  lenses: [
    {
      id: 'sigma-28-75',
      name: 'Sigma 28-75 f2.8',
      minFocalLength: 28,
      maxFocalLength: 75,
      maxAperture: 2.8,
      forcesSensor: [],
      notes: 'Mostly comes out only when close to the subject',
    },
    {
      id: 'sigma-30',
      name: 'Sigma 30mm',
      minFocalLength: 30,
      maxFocalLength: 30,
      maxAperture: null,
      forcesSensor: [],
      notes: '',
    },
    {
      id: 'sony-75-300',
      name: 'Sony 75-300',
      minFocalLength: 75,
      maxFocalLength: 300,
      maxAperture: null,
      forcesSensor: [],
      notes: '',
    },
    {
      id: 'sony-200-600',
      name: 'Sony 200-600',
      minFocalLength: 200,
      maxFocalLength: 600,
      maxAperture: null,
      forcesSensor: [],
      notes: 'Long reach, where most of the ground time lives',
    },
    {
      id: 'sony-10-18',
      name: 'Sony 10-18 f4',
      minFocalLength: 10,
      maxFocalLength: 18,
      maxAperture: 4,
      forcesSensor: [{ bodyId: 'a7iv', sensor: 'apsc' }],
      notes: 'Triggers APS-C crop automatically on the a7IV',
    },
  ],
  drones: [
    {
      id: 'dji-air-3s',
      name: 'DJI Air 3S',
      // 724g. Over the 250g registration line and far over the 249g ceiling for
      // FAA Category 1 operations over people, which is why siting.ts checks the
      // flight path against buildings and gathering areas.
      weightGrams: 724,
      cameras: [
        {
          id: 'air-3s-wide',
          name: 'Air 3S wide',
          equiv35: 24,
          maxAperture: 1.8,
          sensorNote: '1-inch',
          publishedDiagonalFOV: 84,
        },
        {
          id: 'air-3s-tele',
          name: 'Air 3S tele',
          equiv35: 70,
          maxAperture: 2.8,
          sensorNote: '1/1.3-inch',
          publishedDiagonalFOV: 35,
        },
      ],
      notes: 'Two fixed cameras, 24mm and 70mm equivalent. Not a zoom. Paired with DJI wireless mics.',
    },
  ],
  style: {
    longGlassShareOfGroundTime: 0.7,
    droneHeavy: true,
    rarelyShootsWide: true,
    deliverables: { orientation: 'vertical', minSeconds: 10, maxSeconds: 25 },
    notes: [
      'Tight and compressed. Long glass is roughly 70 percent of ground time.',
      'Drone heavy.',
      'Rarely shoots wide.',
      'Deliverables are vertical cuts, 10 to 25 seconds.',
    ],
  },
}

/** The sensor area actually in use for a lens and body pairing. */
export function effectiveSensor(lens: Lens, body: Body): SensorName {
  const forced = lens.forcesSensor.find((f) => f.bodyId === body.id)
  return forced ? forced.sensor : body.sensor
}

/**
 * The sensor a lens will actually be shooting on, given the bodies in the kit.
 *
 * Positions no longer carry a body: which camera comes off the shoulder is a
 * decision made on the day, not something to plan. But the a7IV's forced APS-C
 * crop with the Sony 10-18 changes the field of view, and a field of view that is
 * wrong is a cone that is wrong. So bodies stay in the kit for exactly this: if a
 * body that forces a crop for this lens is in play, the crop applies.
 *
 * Conservative on purpose. If the a7IV is packed, the 10-18 is treated as cropped,
 * because planning the wider frame and then not getting it is the worse error.
 */
export function resolveSensor(lens: Lens, bodies: Body[]): SensorName {
  const forcing = bodies.find((body) =>
    lens.forcesSensor.some((f) => f.bodyId === body.id),
  )
  if (forcing !== undefined) return effectiveSensor(lens, forcing)
  return bodies[0]?.sensor ?? 'fullFrame'
}

/** Every drone camera across the drones that are actually coming. */
export function selectedDroneCameras(kit: KitProfile, droneIds: string[]): DroneCamera[] {
  return kit.drones.filter((d) => droneIds.includes(d.id)).flatMap((d) => d.cameras)
}

export function findDroneCamera(kit: KitProfile, cameraId: string): DroneCamera | undefined {
  return kit.drones.flatMap((d) => d.cameras).find((c) => c.id === cameraId)
}
