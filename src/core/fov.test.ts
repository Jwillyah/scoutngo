import { describe, expect, it } from 'vitest'
import { computeFOV, SENSORS } from './fov.ts'

describe('computeFOV', () => {
  it('200mm on full frame is about 10.3 horizontal and 6.9 vertical', () => {
    const { hFOV, vFOV } = computeFOV(200, SENSORS.fullFrame)
    expect(hFOV).toBeCloseTo(10.3, 1)
    expect(vFOV).toBeCloseTo(6.9, 1)
  })

  it('600mm on full frame is a narrow tunnel', () => {
    const { hFOV, vFOV } = computeFOV(600, SENSORS.fullFrame)
    expect(hFOV).toBeCloseTo(3.43, 2)
    expect(vFOV).toBeCloseTo(2.29, 2)
  })

  it('10mm on APS-C, the forced crop case, is wide', () => {
    const { hFOV, vFOV } = computeFOV(10, SENSORS.apsc)
    expect(hFOV).toBeCloseTo(99.2, 1)
    expect(vFOV).toBeCloseTo(75.9, 1)
  })

  it('vertical FOV is always narrower than horizontal on these sensors', () => {
    for (const sensor of Object.values(SENSORS)) {
      for (const focal of [10, 28, 75, 200, 600]) {
        const { hFOV, vFOV } = computeFOV(focal, sensor)
        expect(vFOV).toBeLessThan(hFOV)
      }
    }
  })

  it('narrows monotonically as focal length grows', () => {
    const focals = [10, 18, 28, 75, 200, 300, 600]
    const widths = focals.map((f) => computeFOV(f, SENSORS.fullFrame).hFOV)
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThan(widths[i - 1])
    }
  })

  it('a crop sensor is tighter than full frame at the same focal length', () => {
    expect(computeFOV(28, SENSORS.apsc).hFOV).toBeLessThan(computeFOV(28, SENSORS.fullFrame).hFOV)
  })
})
