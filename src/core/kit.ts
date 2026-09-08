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

export interface Drone {
  id: string
  name: string
  weightGrams: number
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
      weightGrams: 720,
      notes: 'Paired with DJI wireless mics. Too heavy for FAA Category 1 flight over people.',
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
