import { describe, expect, it } from 'vitest'
import { SENSORS } from './fov.ts'
import { destinationPoint } from './geo.ts'
import { EYE_HEIGHT_M, frameBox, observerPose, verticalFromHorizontal, viewWidthDegrees, zoomWithin } from './observer.ts'

describe('standing at a position', () => {
  const aim = { lat: 38.3607, lon: -75.6036 }
  const stand = destinationPoint(aim, 200, 120)

  it('on foot: 1.6 m up, level, facing the aim', () => {
    const p = observerPose({ standAt: stand, aimAt: aim, droneFeet: null })
    expect(p.heightAboveGround).toBe(EYE_HEIGHT_M)
    expect(p.pitch).toBe(0)
    expect(p.heading).toBeCloseTo(20, 0)
  })

  it('a drone spot: the planned height, looking down at the subject', () => {
    const p = observerPose({ standAt: stand, aimAt: aim, droneFeet: 200 })
    expect(p.heightAboveGround).toBeCloseTo(60.96, 2)
    expect(p.pitch).toBeCloseTo(-Math.atan2(60.96, 120) * (180 / Math.PI), 1)
  })

  it('the frame box: a 200 mm frame is a fraction of a 70 mm one, on the same screen', () => {
    const view = viewWidthDegrees(34)
    const wide = frameBox(70, SENSORS.fullFrame, view, 390)
    const tele = frameBox(200, SENSORS.fullFrame, view, 390)
    expect(tele.width / wide.width).toBeCloseTo(70 / 200, 2)
    expect(wide.width).toBeLessThan(390)
    expect(zoomWithin(300, 70, 200)).toBe(200)
    expect(verticalFromHorizontal(60, 390, 844)).toBeGreaterThan(60)
  })
})

