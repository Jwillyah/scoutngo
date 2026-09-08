export interface SensorSize {
  /** Sensor width in millimetres. */
  w: number
  /** Sensor height in millimetres. */
  h: number
}

export const SENSORS = {
  fullFrame: { w: 35.9, h: 24.0 },
  apsc: { w: 23.5, h: 15.6 },
} as const satisfies Record<string, SensorSize>

export type SensorName = keyof typeof SENSORS

export interface FOV {
  /** Horizontal field of view in degrees. */
  hFOV: number
  /** Vertical field of view in degrees. Deliverables are vertical cuts, so this is the one that matters. */
  vFOV: number
}

function angleOfView(size: number, focalLength: number): number {
  return 2 * Math.atan(size / (2 * focalLength)) * (180 / Math.PI)
}

export function computeFOV(focalLength: number, sensor: SensorSize): FOV {
  return {
    hFOV: angleOfView(sensor.w, focalLength),
    vFOV: angleOfView(sensor.h, focalLength),
  }
}
