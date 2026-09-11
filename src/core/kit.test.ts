import { describe, expect, it } from 'vitest'
import { computeFOV, SENSORS } from './fov.ts'
import {
  DEFAULT_KIT,
  effectiveSensor,
  findDroneCamera,
  resolveSensor,
  selectedDroneCameras,
} from './kit.ts'

const lens = (id: string) => {
  const found = DEFAULT_KIT.lenses.find((l) => l.id === id)
  if (!found) throw new Error(`no lens ${id}`)
  return found
}
const body = (id: string) => {
  const found = DEFAULT_KIT.bodies.find((b) => b.id === id)
  if (!found) throw new Error(`no body ${id}`)
  return found
}

describe('DEFAULT_KIT', () => {
  it('carries the bodies and lenses from the brief', () => {
    expect(DEFAULT_KIT.bodies.map((b) => b.name)).toEqual(['Sony a7IV', 'Sony a7III'])
    expect(DEFAULT_KIT.lenses.map((l) => l.name)).toEqual([
      'Sigma 28-75 f2.8',
      'Sigma 30mm',
      'Sony 75-300',
      'Sony 200-600',
      'Sony 10-18 f4',
    ])
    expect(DEFAULT_KIT.drones.map((d) => d.name)).toEqual(['DJI Air 3S'])
  })

  it('records the shooting style that makes the plan specific', () => {
    expect(DEFAULT_KIT.style.longGlassShareOfGroundTime).toBe(0.7)
    expect(DEFAULT_KIT.style.droneHeavy).toBe(true)
    expect(DEFAULT_KIT.style.deliverables.orientation).toBe('vertical')
  })

  it('has sane focal ranges', () => {
    for (const l of DEFAULT_KIT.lenses) {
      expect(l.minFocalLength).toBeGreaterThan(0)
      expect(l.maxFocalLength).toBeGreaterThanOrEqual(l.minFocalLength)
    }
  })
})

describe('effectiveSensor', () => {
  it('forces APS-C crop for the Sony 10-18 f4 on the a7IV', () => {
    expect(effectiveSensor(lens('sony-10-18'), body('a7iv'))).toBe('apsc')
  })

  it('leaves other lenses on the body native full frame sensor', () => {
    expect(effectiveSensor(lens('sigma-28-75'), body('a7iv'))).toBe('fullFrame')
    expect(effectiveSensor(lens('sony-200-600'), body('a7iv'))).toBe('fullFrame')
  })

  it('does not force the crop on the a7III', () => {
    expect(effectiveSensor(lens('sony-10-18'), body('a7iii'))).toBe('fullFrame')
  })

  it('the forced crop narrows the actual field of view at 10mm', () => {
    const cropped = computeFOV(10, SENSORS[effectiveSensor(lens('sony-10-18'), body('a7iv'))])
    const uncropped = computeFOV(10, SENSORS.fullFrame)
    expect(cropped.hFOV).toBeLessThan(uncropped.hFOV)
    expect(cropped.hFOV).toBeCloseTo(99.2, 1)
  })
})

/*
 * THE AIR 3S IS NOT A ZOOM, and the kit used to pretend it was. Modelling it as a
 * focal RANGE let the model ask for focal lengths the aircraft cannot produce.
 * These are the published specs: two fixed cameras, 24mm and 70mm equivalent.
 */
describe('DJI Air 3S', () => {
  const drone = DEFAULT_KIT.drones.find((d) => d.id === 'dji-air-3s')!

  it('weighs 724g, which is why the flight path check exists', () => {
    expect(drone.weightGrams).toBe(724)
    // Far above the 249g ceiling for FAA Category 1 operations over people.
    expect(drone.weightGrams).toBeGreaterThan(249)
  })

  it('has exactly two cameras, both fixed', () => {
    expect(drone.cameras).toHaveLength(2)
    expect(drone.cameras.map((c) => c.equiv35)).toEqual([24, 70])
  })

  it('records the published apertures and sensors', () => {
    const [wide, tele] = drone.cameras
    expect(wide).toMatchObject({ equiv35: 24, maxAperture: 1.8, sensorNote: '1-inch' })
    expect(tele).toMatchObject({ equiv35: 70, maxAperture: 2.8, sensorNote: '1/1.3-inch' })
  })

  /*
   * The check that the 35mm equivalent route is sound. DJI publish a DIAGONAL
   * field of view for each camera; computing from the equivalent focal length on
   * a full frame sensor has to reproduce it, or the drone cones are drawn with
   * different arithmetic from the ground ones.
   *
   * Tolerance is one degree, not a tenth, because DJI'S OWN TWO FIGURES DISAGREE
   * by more than that. The wide lands at 84.06 against a published 84. The tele
   * computes 34.29 against a published 35; an exactly 35 degree diagonal would
   * need a 68.6mm equivalent, so the "70mm" and the "35 degrees" have each been
   * rounded off the same underlying lens and cannot both be exact. 70 is the
   * number kept, because it is the one that describes the framing.
   *
   * A degree of slack still catches the failure that matters. Computing the tele
   * against the 1/1.3-inch sensor instead of full frame would land near 23
   * degrees, and this test would fail loudly.
   */
  it('reproduces the published field of view from the 35mm equivalent', () => {
    for (const camera of drone.cameras) {
      const { dFOV } = computeFOV(camera.equiv35, SENSORS.fullFrame)
      expect(Math.abs(dFOV - camera.publishedDiagonalFOV)).toBeLessThan(1)
    }
  })

  it('makes the tele camera meaningfully tighter than the wide one', () => {
    const wide = computeFOV(24, SENSORS.fullFrame)
    const tele = computeFOV(70, SENSORS.fullFrame)
    expect(tele.hFOV).toBeLessThan(wide.hFOV / 2)
  })

  it('finds its cameras by id, and only when the drone is packed', () => {
    expect(findDroneCamera(DEFAULT_KIT, 'air-3s-tele')?.equiv35).toBe(70)
    expect(findDroneCamera(DEFAULT_KIT, 'air-3s-superzoom')).toBeUndefined()
    expect(selectedDroneCameras(DEFAULT_KIT, [])).toEqual([])
    expect(selectedDroneCameras(DEFAULT_KIT, ['dji-air-3s'])).toHaveLength(2)
  })
})

/*
 * Positions no longer carry a body. The one way a body still changes the
 * arithmetic is the a7IV's forced APS-C crop, so it is resolved from the kit
 * selection instead.
 */
describe('resolveSensor', () => {
  const lens = (id: string) => DEFAULT_KIT.lenses.find((l) => l.id === id)!
  const body = (id: string) => DEFAULT_KIT.bodies.find((b) => b.id === id)!

  it('applies the crop when the a7IV is packed', () => {
    expect(resolveSensor(lens('sony-10-18'), DEFAULT_KIT.bodies)).toBe('apsc')
    expect(resolveSensor(lens('sony-10-18'), [body('a7iv')])).toBe('apsc')
  })

  it('leaves every other lens on full frame', () => {
    expect(resolveSensor(lens('sony-200-600'), DEFAULT_KIT.bodies)).toBe('fullFrame')
    expect(resolveSensor(lens('sigma-28-75'), [body('a7iv')])).toBe('fullFrame')
  })

  it('does not crop when the body that forces it is left at home', () => {
    expect(resolveSensor(lens('sony-10-18'), [body('a7iii')])).toBe('fullFrame')
  })

  it('falls back to full frame rather than throwing on an empty kit', () => {
    expect(resolveSensor(lens('sony-10-18'), [])).toBe('fullFrame')
  })
})
