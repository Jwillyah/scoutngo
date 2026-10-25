import { describe, expect, it } from 'vitest'
import { destinationPoint } from './geo.ts'
import { measureBetween } from './measure.ts'

const A = { lat: 36.8466, lon: -75.9767 }

describe('two-pin measure', () => {
  it('gives the distance and bearing a pin was placed at', () => {
    const B = destinationPoint(A, 45, 500)
    const m = measureBetween(A, B)
    expect(m.meters).toBeCloseTo(500, 3)
    expect(m.bearing).toBeCloseTo(45, 3)
  })

  it('measures the reverse bearing, which is nearly but not exactly the forward plus 180', () => {
    const B = destinationPoint(A, 90, 2000)
    const m = measureBetween(A, B)
    expect(m.reverseBearing).toBeCloseTo(270, 1)
    expect(m.reverseBearing).not.toBe((m.bearing + 180) % 360)
  })

  it('is zero between a pin and itself', () => {
    expect(measureBetween(A, A).meters).toBe(0)
  })
})
