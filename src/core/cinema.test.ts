import { describe, expect, it } from 'vitest'
import { airMassKastenYoung, airMassPickering, fogDensity, sunColour } from './sunColour.ts'
import { glintMirror, glintSearch, halfwayTilt, type Vec3 } from './glint.ts'
import { drift, DRIFT_DEG, easedSpeed, easedTime, frameTimes, subframeTimes } from './gimbal.ts'
import { CLOUD_FIELD_M, cloudCount, coveredShareByRays, LAYERS, placeClouds } from './clouds.ts'
import { readMp4, writeMp4 } from '../lib/cinema/mp4.ts'

describe('the sun colour', () => {
  it('air mass: 1 overhead, about 38 at the horizon, the two formulas within 3% above 5 deg', () => {
    expect(airMassKastenYoung(90)).toBeCloseTo(1, 3)
    expect(airMassPickering(90)).toBeCloseTo(1, 2)
    expect(airMassKastenYoung(0)).toBeGreaterThan(37)
    expect(airMassKastenYoung(0)).toBeLessThan(39)
    for (const h of [5, 10, 20, 45, 70]) {
      const a = airMassKastenYoung(h) as number
      const b = airMassPickering(h) as number
      expect(Math.abs(a - b) / a).toBeLessThan(0.03)
    }
    expect(airMassKastenYoung(-2)).toBeNull()
  })
  it('is near white high, golden low: blue falls away first', () => {
    const high = sunColour(60, 20) as NonNullable<ReturnType<typeof sunColour>>
    const low = sunColour(3, 20) as NonNullable<ReturnType<typeof sunColour>>
    expect(high.rgb[2]).toBeGreaterThan(0.8)
    expect(low.rgb[0]).toBe(1)
    expect(low.rgb[2]).toBeLessThan(0.3)
    expect(low.rgb[1]).toBeGreaterThan(low.rgb[2])
    expect(low.transmittance).toBeLessThan(high.transmittance)
    expect(sunColour(-3, 20)).toBeNull()
  })
  it('the two air masses give the same colour within 0.03 a channel at 2 deg and up', () => {
    for (const h of [2, 5, 10, 30]) {
      const a = sunColour(h, 15, airMassKastenYoung) as NonNullable<ReturnType<typeof sunColour>>
      const b = sunColour(h, 15, airMassPickering) as NonNullable<ReturnType<typeof sunColour>>
      for (let c = 0; c < 3; c += 1) expect(Math.abs(a.rgb[c] - b.rgb[c])).toBeLessThan(0.03)
    }
  })
  it('fog reaches 2% contrast at the visibility', () => {
    const d = fogDensity(10)
    expect(Math.exp(-((d * 10_000) ** 2))).toBeCloseTo(0.02, 3)
    expect(fogDensity(null)).toBeGreaterThan(0)
  })
})

describe('the glint', () => {
  const cams: Vec3[] = [[0, 0, 60], [120, -40, 15], [-300, 200, 120]]
  const suns: Vec3[] = [[0.3, -0.9, 0.3], [-0.7, 0.1, 0.12], [0.1, 0.2, 0.97]]
  it('mirror and search agree within 5 cm, and the mirror point obeys the reflection law', () => {
    for (const c of cams) {
      for (const s of suns) {
        const a = glintMirror(c, s, 0.2) as Vec3
        const b = glintSearch(c, s, 0.2) as Vec3
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.05)
        expect(halfwayTilt(c, s, a)).toBeLessThan(1e-6)
      }
    }
  })
  it('none with the sun down or the camera under water', () => {
    expect(glintMirror([0, 0, 10], [0, 1, -0.1], 0)).toBeNull()
    expect(glintMirror([0, 0, -1], [0, 1, 0.5], 0)).toBeNull()
  })
})

describe('the camera', () => {
  it('eases: same start and end, still at both ends, steady between, never backwards', () => {
    const T = 12
    expect(easedTime(0, T)).toBe(0)
    expect(easedTime(T, T)).toBeCloseTo(T, 9)
    expect(easedSpeed(0, T)).toBe(0)
    expect(easedSpeed(T, T)).toBeCloseTo(0, 9)
    let last = -1
    for (let t = 0; t <= T; t += 0.01) {
      const e = easedTime(t, T)
      expect(e).toBeGreaterThanOrEqual(last)
      last = e
    }
  })
  it('the closed form matches summing the speed (two ways) within 1 ms', () => {
    const T = 9
    const dt = 1e-4
    let sum = 0
    for (let t = 0; t < T; t += dt) {
      sum += easedSpeed(t + dt / 2, T) * dt
      if (Math.abs(t - 0.7) < dt / 2 || Math.abs(t - 4.5) < dt / 2 || Math.abs(t - 8.6) < dt / 2) expect(Math.abs(sum - easedTime(t + dt, T))).toBeLessThan(1e-3)
    }
    expect(Math.abs(sum - T)).toBeLessThan(1e-3)
  })
  it('drifts no more than a quarter degree', () => {
    for (let t = 0; t < 120; t += 0.05) {
      const d = drift(t)
      expect(Math.abs(d.yaw)).toBeLessThanOrEqual(DRIFT_DEG)
      expect(Math.abs(d.pitch)).toBeLessThanOrEqual(DRIFT_DEG)
    }
  })
  it('30 fps frames, and each frame blurs over half a frame', () => {
    const f = frameTimes(2)
    expect(f.length).toBe(61)
    expect(f[1]).toBeCloseTo(1 / 30, 9)
    const s = subframeTimes(1, 10)
    expect(s.length).toBe(4)
    expect(Math.max(...s) - 1).toBeLessThan(0.5 / 30)
    expect(Math.min(...s)).toBeGreaterThan(1)
  })
})

describe('the clouds', () => {
  it('none at 0%, more with more cover, the same for the same seed', () => {
    expect(placeClouds({ low: 0, mid: null, high: 0 }, 1)).toEqual([])
    expect(cloudCount(0.6, LAYERS[0])).toBeGreaterThan(cloudCount(0.2, LAYERS[0]))
    expect(placeClouds({ low: 40, mid: 20, high: 10 }, 7)).toEqual(placeClouds({ low: 40, mid: 20, high: 10 }, 7))
  })
  it('cover the forecast share, checked by rays, within 0.12 up to 60%', () => {
    for (const pct of [10, 30, 60]) {
      const clouds = placeClouds({ low: pct, mid: null, high: null }, 3)
      const share = coveredShareByRays(clouds, 'low', 120)
      expect(Math.abs(share - pct / 100)).toBeLessThan(0.12)
    }
    expect(CLOUD_FIELD_M).toBeGreaterThan(0)
  })
})

describe('the MP4', () => {
  it('reads back steady 30 fps frames, sizes and key frames', () => {
    const frames = Array.from({ length: 45 }, (_, i) => ({ data: new Uint8Array(100 + i), key: i % 30 === 0 }))
    const file = writeMp4(frames, new Uint8Array([1, 0x42, 0, 0x1f, 0xff, 0xe0, 0]), 1280, 720, 30)
    const f = readMp4(file)
    expect(f.brand).toBe('isom')
    expect([f.width, f.height]).toEqual([1280, 720])
    expect(f.samples).toBe(45)
    expect(new Set(f.deltas)).toEqual(new Set([3000]))
    expect(f.timescale).toBe(90_000)
    expect(f.durationS).toBeCloseTo(1.5, 6)
    expect(f.keyframes).toBe(2)
    expect(f.sizesMatch).toBe(true)
  })
})

describe('the sea surface', () => {
  it('ripples carry Cox and Munk\'s slope variance for the wind, swell its wavelength, height and direction', async () => {
    const { coxMunkVariance, deepWavelength, seaWaves, slopeVariance } = await import('./seaSurface.ts')
    const waves = seaWaves({ heightM: 1.2, periodS: 9, fromDeg: 90, windMps: 7, windFromDeg: 200 })
    const ripples = waves.slice(3)
    expect(slopeVariance(ripples)).toBeCloseTo(coxMunkVariance(7), 9)
    /* All of it, swell included, within 10% of the measured variance: the swell is long and gentle. */
    expect(Math.abs(slopeVariance(waves) - coxMunkVariance(7)) / coxMunkVariance(7)).toBeLessThan(0.1)
    expect((2 * Math.PI) / waves[1].k).toBeCloseTo(deepWavelength(9), 6)
    expect(deepWavelength(9)).toBeCloseTo(126.5, 0)
    /* Hs = 4 sigma: three sines of amplitude a, sigma = a sqrt(3/2). */
    expect(4 * waves[0].a * Math.sqrt(1.5)).toBeCloseTo(1.2, 9)
    /* From the east, travelling west. */
    expect(waves[1].dir[0]).toBeCloseTo(-1, 9)
    expect(waves[1].omega).toBeCloseTo(Math.sqrt(9.81 * waves[1].k), 12)
  })
})

describe('what the preview says over itself', () => {
  it('always the watermark; clouds illustrative when drawn; the water height when not known', async () => {
    const { previewNote, WATERMARK } = await import('../lib/preflight/play.ts')
    const mask = { url: 'data:', halfM: 6000 }
    const base = { sea: { heightM: 1, periodS: 8, fromDeg: 90, windMps: 5, windFromDeg: 200 }, waterLevelM: 0.2, cover: null, visibilityKm: null, seaMask: mask, seed: 1 }
    expect(previewNote(null, false)).toBe(WATERMARK)
    expect(previewNote(base, true)).toBe(`${WATERMARK} · Clouds illustrative`)
    expect(previewNote({ ...base, waterLevelM: null }, false)).toBe(`${WATERMARK} · Water height not known`)
    /* No sea drawn, nothing to say about its height. */
    expect(previewNote({ ...base, waterLevelM: null, seaMask: null }, false)).toBe(WATERMARK)
  })
})
