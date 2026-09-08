import { describe, expect, it } from 'vitest'
import { computeFOV, SENSORS } from './fov.ts'
import { DEFAULT_KIT, effectiveSensor } from './kit.ts'

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
