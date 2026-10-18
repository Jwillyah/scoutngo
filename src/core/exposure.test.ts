import { describe, expect, it } from 'vitest'
import {
  npfForCamera,
  npfSeconds,
  NPF_NOTE,
  pixelPitchMicrons,
  startingExposure,
  STARTING_EXPOSURE,
  STARTING_EXPOSURE_LABEL,
  type ExposureTarget,
  type SkyDarkness,
} from './exposure.ts'
import { DEFAULT_KIT } from './kit.ts'
import { SENSORS } from './fov.ts'

describe('pixel pitch', () => {
  it('matches Sony published pitch for the a7IV', () => {
    /* 35.9 mm across 7008 pixels. Sony publish 5.12 microns for this body. */
    const pitch = pixelPitchMicrons(35.9, 7008)
    expect(pitch).not.toBeNull()
    expect(pitch ?? 0).toBeCloseTo(5.12, 2)
  })

  it('matches Sony published pitch for the a7III', () => {
    /* 35.6 mm across 6000 pixels. Sony publish 5.93 microns for this body. */
    expect(pixelPitchMicrons(35.6, 6000) ?? 0).toBeCloseTo(5.93, 2)
  })

  it('separates the two full frame bodies, which is why this is not a sensor property', () => {
    const a7iv = pixelPitchMicrons(35.9, 7008) ?? 0
    const a7iii = pixelPitchMicrons(35.6, 6000) ?? 0
    /* Same sensor FORMAT, pitches 16 percent apart. */
    expect(Math.abs(a7iii - a7iv) / a7iv).toBeGreaterThan(0.15)
  })

  it('returns null rather than a number for impossible inputs', () => {
    expect(pixelPitchMicrons(0, 7008)).toBeNull()
    expect(pixelPitchMicrons(35.9, 0)).toBeNull()
    expect(pixelPitchMicrons(-35.9, 7008)).toBeNull()
    expect(pixelPitchMicrons(Number.NaN, 7008)).toBeNull()
    expect(pixelPitchMicrons(35.9, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('the NPF rule', () => {
  it('computes (35N + 30p) / f exactly', () => {
    /* (35 * 2.8 + 30 * 5.123) / 28 = (98 + 153.69) / 28 */
    const seconds = npfSeconds(2.8, 5.123, 28)
    expect(seconds ?? 0).toBeCloseTo((35 * 2.8 + 30 * 5.123) / 28, 10)
    expect(seconds ?? 0).toBeCloseTo(8.989, 2)
  })

  it('gets shorter as the lens gets longer, which is the point of it', () => {
    const wide = npfSeconds(2.8, 5.12, 14) ?? 0
    const long = npfSeconds(2.8, 5.12, 200) ?? 0
    expect(long).toBeLessThan(wide)
    /* And it scales as 1/f, so 200mm is 14/200 of the 14mm time. */
    expect(long).toBeCloseTo(wide * (14 / 200), 6)
  })

  it('gives a longer time on the coarser sensor at the same lens', () => {
    const onA7iv = npfSeconds(2.8, pixelPitchMicrons(35.9, 7008) ?? 0, 28) ?? 0
    const onA7iii = npfSeconds(2.8, pixelPitchMicrons(35.6, 6000) ?? 0, 28) ?? 0
    expect(onA7iii).toBeGreaterThan(onA7iv)
  })

  it('returns null rather than zero or Infinity for impossible inputs', () => {
    expect(npfSeconds(0, 5.12, 28)).toBeNull()
    expect(npfSeconds(2.8, 0, 28)).toBeNull()
    expect(npfSeconds(2.8, 5.12, 0)).toBeNull()
    expect(npfSeconds(2.8, 5.12, Number.NaN)).toBeNull()
  })
})

describe('npfForCamera states a reason rather than guessing', () => {
  it('answers with seconds and the note when everything is recorded', () => {
    const got = npfForCamera({
      bodyName: 'Sony a7IV',
      sensorWidthMm: 35.9,
      horizontalPixels: 7008,
      lensName: 'Sigma 28-75 f2.8',
      aperture: 2.8,
      focalLength: 28,
    })
    expect(got.kind).toBe('seconds')
    if (got.kind !== 'seconds') return
    expect(got.seconds).toBeCloseTo(8.99, 1)
    expect(got.pitchMicrons).toBeCloseTo(5.12, 2)
    expect(got.note).toBe(NPF_NOTE)
  })

  it('names the BODY when the pixel count is missing', () => {
    const got = npfForCamera({
      bodyName: 'Sony FX3',
      sensorWidthMm: 35.9,
      horizontalPixels: null,
      lensName: 'Sigma 28-75 f2.8',
      aperture: 2.8,
      focalLength: 28,
    })
    expect(got.kind).toBe('reason')
    if (got.kind !== 'reason') return
    expect(got.reason).toContain('Sony FX3')
    expect(got.reason).toMatch(/pixel count/i)
  })

  it('names the LENS when the aperture is missing', () => {
    const got = npfForCamera({
      bodyName: 'Sony a7IV',
      sensorWidthMm: 35.9,
      horizontalPixels: 7008,
      lensName: 'Sony 200-600',
      aperture: null,
      focalLength: 200,
    })
    expect(got.kind).toBe('reason')
    if (got.kind !== 'reason') return
    expect(got.reason).toContain('Sony 200-600')
    expect(got.reason).toMatch(/aperture/i)
  })

  it('never returns a number dressed as an answer when an input is missing', () => {
    const missing = npfForCamera({
      bodyName: 'Nameless',
      sensorWidthMm: 35.9,
      horizontalPixels: null,
      lensName: 'Nameless lens',
      aperture: null,
      focalLength: 28,
    })
    expect(missing.kind).toBe('reason')
    expect(JSON.stringify(missing)).not.toMatch(/"seconds"/)
  })
})

describe('the shipped kit carries what NPF needs', () => {
  it('records a cited pixel count for both shipped bodies', () => {
    for (const body of DEFAULT_KIT.bodies) {
      expect(body.horizontalPixels).not.toBeNull()
      expect(body.verticalPixels).not.toBeNull()
    }
  })

  it('keeps the a7IV and a7III pixel counts at their published values', () => {
    const a7iv = DEFAULT_KIT.bodies.find((b) => b.id === 'a7iv')
    const a7iii = DEFAULT_KIT.bodies.find((b) => b.id === 'a7iii')
    expect(a7iv?.horizontalPixels).toBe(7008)
    expect(a7iv?.verticalPixels).toBe(4672)
    expect(a7iii?.horizontalPixels).toBe(6000)
    expect(a7iii?.verticalPixels).toBe(4000)
  })

  it('gives every shipped body a real NPF time on a lens with an aperture', () => {
    for (const body of DEFAULT_KIT.bodies) {
      const got = npfForCamera({
        bodyName: body.name,
        sensorWidthMm: SENSORS[body.sensor].w,
        horizontalPixels: body.horizontalPixels,
        lensName: 'Sigma 28-75 f2.8',
        aperture: 2.8,
        focalLength: 28,
      })
      expect(got.kind).toBe('seconds')
    }
  })
})

describe('the starting exposure table', () => {
  const targets: ExposureTarget[] = ['meteors', 'milkyway', 'moon']
  const darknesses: SkyDarkness[] = ['astro-dark', 'moonlit', 'twilight']

  it('has an entry for every target and every sky, with no holes', () => {
    for (const target of targets) {
      for (const darkness of darknesses) {
        const got = startingExposure(target, darkness)
        expect(got).not.toBeNull()
        expect(got?.iso).toBeGreaterThan(0)
        expect(got?.aperture).toBeGreaterThan(0)
        expect(got?.seconds).toBeGreaterThan(0)
      }
    }
  })

  it('asks for less light as the sky gets brighter, for the two dark targets', () => {
    for (const target of ['meteors', 'milkyway'] as const) {
      const dark = STARTING_EXPOSURE[target]['astro-dark']
      const moon = STARTING_EXPOSURE[target].moonlit
      const twilight = STARTING_EXPOSURE[target].twilight
      expect(moon.iso).toBeLessThanOrEqual(dark.iso)
      expect(twilight.iso).toBeLessThanOrEqual(moon.iso)
      expect(moon.seconds).toBeLessThanOrEqual(dark.seconds)
      expect(twilight.seconds).toBeLessThanOrEqual(moon.seconds)
    }
  })

  it('treats the moon as a sunlit rock, the same in any sky', () => {
    const rows = darknesses.map((d) => STARTING_EXPOSURE.moon[d])
    for (const row of rows) {
      expect(row).toEqual(rows[0])
      expect(row.iso).toBe(100)
      expect(row.seconds).toBeLessThan(0.05)
    }
  })

  it('carries the label that says what kind of number it is', () => {
    expect(STARTING_EXPOSURE_LABEL).toMatch(/starting point/i)
    expect(STARTING_EXPOSURE_LABEL).toMatch(/not an answer/i)
  })

  it('returns null for a pair that is not in the table', () => {
    expect(startingExposure('meteors', 'not-a-sky' as never)).toBeNull()
    expect(startingExposure('not-a-target' as never, 'astro-dark')).toBeNull()
  })
})

describe('what the numbers are never allowed to say', () => {
  it('does not promise anything about the sky in the NPF note', () => {
    expect(NPF_NOTE).not.toMatch(/\bclear\b/i)
    expect(NPF_NOTE).not.toMatch(/\bguarantee/i)
  })
})
