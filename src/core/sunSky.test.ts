import { describe, expect, it } from 'vitest'
import { directionVector, horizonInFrame, projectSky, type SkyCamera } from './sunSky.ts'

const CAM = (over: Partial<SkyCamera> = {}): SkyCamera => ({
  bearing: 0,
  pitch: 60,
  fovDegrees: 36.87,
  width: 390,
  height: 844,
  ...over,
})

describe('direction vectors', () => {
  it('puts north, east, south and west where they belong', () => {
    const near = (v: readonly number[], e: number, n: number, u: number) => {
      expect(v[0]).toBeCloseTo(e, 6)
      expect(v[1]).toBeCloseTo(n, 6)
      expect(v[2]).toBeCloseTo(u, 6)
    }
    near(directionVector(0, 0), 0, 1, 0)
    near(directionVector(90, 0), 1, 0, 0)
    near(directionVector(180, 0), 0, -1, 0)
    near(directionVector(270, 0), -1, 0, 0)
  })

  it('puts straight up straight up, whatever the azimuth', () => {
    for (const az of [0, 90, 254.1]) {
      const v = directionVector(az, 90)
      expect(v[2]).toBeCloseTo(1, 6)
      expect(Math.hypot(v[0], v[1])).toBeCloseTo(0, 6)
    }
  })

  it('is a unit vector at every angle', () => {
    for (const az of [0, 37, 180, 300]) {
      for (const alt of [-20, 0, 8.2, 45, 89]) {
        const v = directionVector(az, alt)
        expect(Math.hypot(v[0], v[1], v[2]), `${az}/${alt}`).toBeCloseTo(1, 9)
      }
    }
  })
})

describe('projecting a direction onto the canvas', () => {
  /*
   * THE OPTICAL AXIS LANDS DEAD CENTRE. At pitch 60 the camera looks 30
   * degrees below horizontal along its bearing, so a direction at that
   * azimuth and that elevation is the centre pixel by definition. If the
   * pitch convention were inverted this would be the first thing to fail.
   */
  it('puts the optical axis at the centre of the frame', () => {
    for (const pitch of [0, 30, 60]) {
      for (const bearing of [0, 90, 254.1]) {
        const camera = CAM({ pitch, bearing })
        const p = projectSky(bearing, pitch - 90, camera)
        expect(p.x, `pitch ${pitch} bearing ${bearing}`).toBeCloseTo(camera.width / 2, 4)
        expect(p.y, `pitch ${pitch} bearing ${bearing}`).toBeCloseTo(camera.height / 2, 4)
        expect(p.inFront).toBe(true)
      }
    }
  })

  it('puts a higher sun higher up the frame', () => {
    const camera = CAM({ pitch: 70 })
    const low = projectSky(0, 5, camera)
    const high = projectSky(0, 25, camera)
    expect(high.y).toBeLessThan(low.y)
  })

  it('puts a sun to the right of the bearing on the right of the frame', () => {
    const camera = CAM({ bearing: 0, pitch: 70 })
    const right = projectSky(30, 10, camera)
    const left = projectSky(330, 10, camera)
    expect(right.x).toBeGreaterThan(camera.width / 2)
    expect(left.x).toBeLessThan(camera.width / 2)
  })

  /*
   * NORTH IS UP WHEN LOOKING STRAIGHT DOWN. The nadir case is the one where a
   * cross-product basis collapses, so it is asserted directly: at pitch 0 with
   * bearing 0, a direction tilted toward the north must land ABOVE centre.
   */
  it('keeps a usable basis at nadir, where a cross product would collapse', () => {
    const camera = CAM({ pitch: 0, bearing: 0 })
    const northish = projectSky(0, -80, camera)
    const eastish = projectSky(90, -80, camera)
    expect(northish.y).toBeLessThan(camera.height / 2)
    expect(eastish.x).toBeGreaterThan(camera.width / 2)
    expect(northish.inFront).toBe(true)
  })

  it('reports a direction behind the camera rather than drawing it', () => {
    const camera = CAM({ bearing: 0, pitch: 60 })
    /* The sun due south and high up, while looking north and downward. */
    const behind = projectSky(180, 70, camera)
    expect(behind.inFront).toBe(false)
    expect(behind.onScreen).toBe(false)
  })

  it('reports in-front-but-off-frame separately from behind', () => {
    const camera = CAM({ bearing: 0, pitch: 70 })
    const offLeft = projectSky(300, 10, camera)
    expect(offLeft.inFront).toBe(true)
    expect(offLeft.onScreen).toBe(false)
  })

  /*
   * THE FIELD OF VIEW SCALES THE FRAME, not the directions. A wider lens puts
   * the same sun nearer the centre, which is the check that the focal length
   * is derived from the fov rather than hardcoded.
   */
  it('moves a fixed direction inward as the field of view widens', () => {
    const narrow = projectSky(20, 10, CAM({ pitch: 70, fovDegrees: 25 }))
    const wide = projectSky(20, 10, CAM({ pitch: 70, fovDegrees: 60 }))
    expect(Math.abs(wide.x - 195)).toBeLessThan(Math.abs(narrow.x - 195))
  })
})

describe('whether there is any sky in frame', () => {
  /*
   * Drawing a sun on a top-down map would put it on a patch of ground and
   * claim an altitude the view cannot show. A flat map at least makes no
   * claim.
   */
  it('is false looking straight down', () => {
    expect(horizonInFrame(CAM({ pitch: 0 }))).toBe(false)
    expect(horizonInFrame(CAM({ pitch: 30 }))).toBe(false)
  })

  it('is true once the horizon comes into frame', () => {
    /* Half of 36.87 is 18.4, so the horizon enters above pitch 71.6. */
    expect(horizonInFrame(CAM({ pitch: 60 }))).toBe(false)
    expect(horizonInFrame(CAM({ pitch: 75 }))).toBe(true)
    expect(horizonInFrame(CAM({ pitch: 85 }))).toBe(true)
  })

  it('depends on the field of view, not only the pitch', () => {
    expect(horizonInFrame(CAM({ pitch: 60, fovDegrees: 36.87 }))).toBe(false)
    expect(horizonInFrame(CAM({ pitch: 60, fovDegrees: 90 }))).toBe(true)
  })
})
