import { describe, expect, it } from 'vitest'
import { alphaFromHeading, calibrationFromTap, frameBox, project, unproject, visibleFov } from './arProjection.ts'

const fov = { h: 50, v: 65 }
/* Held upright, screen facing you, top edge up: beta 90. Facing north: heading 0. */
const upright = (heading: number) => ({ alpha: alphaFromHeading(heading), beta: 90, gamma: 0 })

describe('the viewfinder projection', () => {
  it('puts the direction the camera faces in the middle of the picture', () => {
    const p = project(0, 0, upright(0), fov)
    expect(p?.x).toBeCloseTo(0.5, 6)
    expect(p?.y).toBeCloseTo(0.5, 6)
  })

  it('puts something to the right on the right, and higher up higher', () => {
    const right = project(10, 0, upright(0), fov)
    const up = project(0, 10, upright(0), fov)
    expect(right?.x ?? 0).toBeGreaterThan(0.5)
    expect(up?.y ?? 1).toBeLessThan(0.5)
  })

  it('turns with the heading: facing east, east is the middle', () => {
    const p = project(90, 0, upright(90), fov)
    expect(p?.x).toBeCloseTo(0.5, 6)
    expect(p?.y).toBeCloseTo(0.5, 6)
  })

  it('puts the edge of the field of view at the edge of the picture', () => {
    expect(project(25, 0, upright(0), fov)?.x).toBeCloseTo(1, 6)
    expect(project(0, 32.5, upright(0), fov)?.y).toBeCloseTo(0, 6)
  })

  it('draws nothing behind the camera', () => {
    expect(project(180, 0, upright(0), fov)).toBeNull()
  })

  it('unprojects a tap back to the direction it came from', () => {
    const o = { alpha: 37, beta: 75, gamma: 8 }
    /* alpha 37 is a heading of 323: look a little east of that. */
    const p = project(330, 14, o, fov)
    expect(p).not.toBeNull()
    const back = unproject(p ?? { x: 0, y: 0 }, o, fov)
    expect(back.azimuth).toBeCloseTo(330, 6)
    expect(back.altitude).toBeCloseTo(14, 6)
  })

  it('a tap on the sun gives the compass error, and that offset puts the sun under the tap', () => {
    /* The compass reads 6 degrees high: the phone thinks it faces 6 when it faces 0. */
    const o = upright(6)
    const sun = { azimuth: 3, altitude: 12 }
    const tap = project(sun.azimuth, sun.altitude, upright(0), fov) ?? { x: 0, y: 0 }
    const offset = calibrationFromTap(tap, sun, o, fov)
    expect(offset).toBeCloseTo(6, 6)
    const corrected = project(sun.azimuth, sun.altitude, o, fov, -offset)
    expect(corrected?.x).toBeCloseTo(tap.x, 6)
    expect(corrected?.y).toBeCloseTo(tap.y, 6)
  })

  it('sizes a frame box by the tangent of half the angle', () => {
    expect(frameBox(fov, fov)).toEqual({ w: 1, h: 1 })
    expect(frameBox({ h: 10, v: 6.7 }, fov).w).toBeLessThan(0.2)
  })
})

describe('the field of the picture as shown', () => {
  it('keeps the long side and cuts the short side to the screen', () => {
    /* 65 degrees given explicitly: the default is now the 69 of a 26 mm equivalent. */
    const f = visibleFov(390, 844, 65)
    expect(f.v).toBe(65)
    expect(f.h).toBeCloseTo(32.8, 1)
    expect(visibleFov(390, 844).v).toBe(69)
  })

  /* A 3:2 frame drawn on that screen has the shape of a 3:2 frame, measured in pixels. */
  it('draws a 70 mm full-frame box with a 3:2 shape', () => {
    const f = visibleFov(390, 844)
    const deg = (mm: number) => (2 * Math.atan(mm / 2 / 70) * 180) / Math.PI
    const box = frameBox({ h: deg(35.9), v: deg(24) }, f)
    expect((box.w * 390) / (box.h * 844)).toBeCloseTo(35.9 / 24, 1)
  })
})
