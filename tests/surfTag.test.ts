import { describe, expect, it } from 'vitest'
import { SURF_FIRING_FT, SURF_FUN_FT, SURF_SMALL_FT, SURF_TAGS, surfOn, surfTag } from '../src/core/briefing.ts'
import { MESSY_ONSHORE_MPS, surfShape, type SurfShape } from '../src/core/surf.ts'
import { GLASSY_MPS } from '../src/core/coastFacing.ts'

/*
 * ONE SCALE (src/core/surf.ts surfTag). Batch M, Section 4: on 8 Nov 0-1 ft
 * was tagged Fun. Batch QA, Section 0B: on 10 Nov 2-4 ft bumpy onshore was
 * tagged Fun while the cam showed thigh to waist with onshore texture.
 */
describe('the surf tag scale: Flat · Small · Rideable · Fun · Firing', () => {
  it('every size with every wind, the whole table', () => {
    const shapes: (SurfShape | null)[] = ['Clean', 'Bumpy', 'Messy', null]
    const table = Object.fromEntries([1, 2, 3, 5].map((ft) => [ft, shapes.map((s) => surfTag(ft, s))]))
    expect(table).toEqual({
      /*      Clean      Bumpy       Messy       no wind */
      1: ['Flat', 'Flat', 'Flat', 'Flat'],
      2: ['Small', 'Small', 'Flat', 'Small'],
      3: ['Fun', 'Rideable', 'Small', 'Rideable'],
      5: ['Firing', 'Fun', 'Rideable', 'Fun'],
    })
  })

  it('the field case: 2-4 ft (3 ft middle), bumpy onshore, is Rideable, never Fun', () => {
    expect(surfTag(3, 'Bumpy')).toBe('Rideable')
    expect(surfOn(surfTag(3, 'Bumpy'))).toBe(false)
  })

  it('Fun needs size and clean or light wind; only Fun and Firing count as surf', () => {
    for (const ft of [0.5, 1, 1.6, 2.4, 2.6, 3.9, 4, 6]) {
      for (const s of ['Clean', 'Bumpy', 'Messy', null] as const) {
        const tag = surfTag(ft, s)
        expect(SURF_TAGS).toContain(tag)
        if (tag === 'Fun' || tag === 'Firing') expect(s === 'Clean' || ft >= SURF_FIRING_FT).toBe(true)
        if (s !== 'Clean') expect(tag).not.toBe('Firing')
        expect(surfOn(tag)).toBe(tag === 'Fun' || tag === 'Firing')
      }
    }
  })

  it('a worse wind never gives a better tag', () => {
    for (const ft of [0.5, 1.5, 2, 2.5, 3, 4, 5, 8]) {
      const [c, b, m] = (['Clean', 'Bumpy', 'Messy'] as const).map((s) => SURF_TAGS.indexOf(surfTag(ft, s)))
      expect(c).toBeGreaterThanOrEqual(b)
      expect(b).toBeGreaterThanOrEqual(m)
    }
  })

  it('boundaries: 1.5, 2.5 and 4 ft', () => {
    expect([SURF_SMALL_FT, SURF_FUN_FT, SURF_FIRING_FT]).toEqual([1.5, 2.5, 4])
    expect(surfTag(1.49, 'Clean')).toBe('Flat')
    expect(surfTag(1.5, 'Clean')).toBe('Small')
    expect(surfTag(2.49, 'Clean')).toBe('Small')
    expect(surfTag(2.5, 'Clean')).toBe('Fun')
    expect(surfTag(3.99, 'Clean')).toBe('Fun')
    expect(surfTag(4, 'Clean')).toBe('Firing')
  })

  it('clean and messy are the Surf page shape: light or offshore, onshore at 10 kt or more', () => {
    const facing = 90
    expect(surfShape(GLASSY_MPS - 0.1, 90, facing)).toBe('Clean')
    expect(surfShape(8, 270, facing)).toBe('Clean')
    expect(surfShape(MESSY_ONSHORE_MPS, 90, facing)).toBe('Messy')
    expect(surfShape(MESSY_ONSHORE_MPS - 0.1, 90, facing)).toBe('Bumpy')
    expect(surfTag(3, surfShape(MESSY_ONSHORE_MPS, 90, facing))).toBe('Small')
  })
})

describe('the beach cap (Batch QA, Section 0B)', () => {
  it('the field pair: buoy 3.0 ft at 12 s straight in came out 4.8 ft; now never above the buoy, inside what the cam showed', async () => {
    const { surfEstimate } = await import('../src/core/surf.ts')
    const { BEACH_OBSERVATIONS } = await import('../src/data/beachObservations.ts')
    const o = BEACH_OBSERVATIONS[0]
    const face = surfEstimate(o.buoyFt / 3.28084, o.buoyPeriodS, 100, 100).faceFt
    expect(face).toBeLessThanOrEqual(o.buoyFt + 1e-9)
    expect(face).toBeGreaterThanOrEqual(o.seenFt[0])
    expect(face).toBeLessThanOrEqual(o.seenFt[1])
  })
  it('never above the height it was worked from, at any period', async () => {
    const { surfEstimate } = await import('../src/core/surf.ts')
    for (const m of [0.3, 0.6, 1, 1.5, 2.5]) for (const t of [5, 8, 10, 12, 14, 17]) expect(surfEstimate(m, t, 90, 90).faceFt).toBeLessThanOrEqual(m * 3.28084 + 1e-9)
  })
})

describe('the beach factor per region (Batch Beach, Section 2: the Outer Banks break bigger than Virginia Beach for the same buoy)', () => {
  it('each region’s factor is its observations’ middle over the buoy: VB 2.5/3.0, OBX 3.5/3.0; elsewhere BEACH_CAP', async () => {
    const { beachFactorAt, regionOf } = await import('../src/core/beachFactor.ts')
    const { BEACH_CAP } = await import('../src/core/surf.ts')
    const { SURF_SPOTS } = await import('../src/data/surfSpots.ts')
    const at = (id: string) => (SURF_SPOTS.find((s) => s.id === id) as { at: { lat: number; lon: number } }).at
    expect(beachFactorAt({ lat: 36.8436, lon: -75.9713 })).toBeCloseTo(2.5 / 3, 6)
    expect(beachFactorAt(at('sandbridge'))).toBeCloseTo(2.5 / 3, 6)
    for (const id of ['s-turns', 'mirlo-beach', 'kdh-1st-street', 'kitty-hawk-pier', 'cape-point', 'frisco-pier']) {
      expect(regionOf(at(id))?.id).toBe('obx')
      expect(beachFactorAt(at(id))).toBeCloseTo(3.5 / 3, 6)
    }
    expect(beachFactorAt(at('wrightsville-beach'))).toBe(BEACH_CAP)
  })
  it('provisional until three looks (Batch Polish, Section 0): both regions rest on one look each', async () => {
    const { regionEvidence, regionOf, PROVISIONAL_BELOW } = await import('../src/core/beachFactor.ts')
    expect(PROVISIONAL_BELOW).toBe(3)
    expect(regionEvidence(regionOf({ lat: 35.6085, lon: -75.4655 }))).toEqual({ looks: 1, provisional: true })
    expect(regionEvidence(regionOf({ lat: 36.8436, lon: -75.9713 }))).toEqual({ looks: 1, provisional: true })
    expect(regionEvidence(null)).toEqual({ looks: 0, provisional: true })
  })
  it('every observation, worked through the transform at its own spot with its region’s factor, lands inside what was seen', async () => {
    const { surfEstimate } = await import('../src/core/surf.ts')
    const { beachFactorAt } = await import('../src/core/beachFactor.ts')
    const { BEACH_OBSERVATIONS } = await import('../src/data/beachObservations.ts')
    const { SURF_SPOTS } = await import('../src/data/surfSpots.ts')
    const where: Record<string, { at: { lat: number; lon: number }; facing: number; fromDeg: number }> = {
      vb: { at: { lat: 36.8436, lon: -75.9713 }, facing: 100, fromDeg: 100 },
      obx: { ...(SURF_SPOTS.find((s) => s.id === 's-turns') as { at: { lat: number; lon: number }; facing: number }), fromDeg: 90 },
    }
    for (const o of BEACH_OBSERVATIONS) {
      const w = where[o.region]
      const face = surfEstimate(o.buoyFt / 3.28084, o.buoyPeriodS, w.fromDeg, w.facing, beachFactorAt(w.at)).faceFt
      expect(face, o.spot).toBeGreaterThanOrEqual(o.seenFt[0])
      expect(face, o.spot).toBeLessThanOrEqual(o.seenFt[1])
    }
  })
})

describe('the forecast face is worked from the whole sea (Batch Beach, Section 2: Sandbridge, 4% of size words right with swell-only)', () => {
  it('the height is wave_height, the period and direction the swell’s; the swell’s height only where the whole sea’s is missing', async () => {
    const { surfAt } = await import('../src/lib/surfDay.ts')
    const { surfEstimate } = await import('../src/core/surf.ts')
    const t = Date.UTC(2026, 10, 5, 15)
    const m = (wave: number | null) => ({ times: [t], values: { wave_height: [wave], wave_period: [6], wave_direction: [60], swell_wave_height: [0.4], swell_wave_period: [11], swell_wave_direction: [95] } })
    const s = surfAt(m(0.9), new Date(t), 100)
    expect(s?.estimate.faceFt).toBeCloseTo(surfEstimate(0.9, 11, 95, 100).faceFt, 9)
    expect(s?.periodS).toBe(11)
    expect(s?.swellFt).toBeCloseTo(0.4 * 3.28084, 9)
    expect(surfAt(m(null), new Date(t), 100)?.estimate.faceFt).toBeCloseTo(surfEstimate(0.4, 11, 95, 100).faceFt, 9)
  })
})

describe('a week day’s surf (Batch QA, Section 0B: "Surf" on every day while the swell faded)', () => {
  it('days 1-3: Surf only when the peak hour is Fun or better on the scale, else the range', async () => {
    const { weekSurf } = await import('../src/core/homeDay.ts')
    expect(weekSurf([{ faceFt: 1.8, shape: 'Clean' }, { faceFt: 3.1, shape: 'Clean' }], 1)).toEqual({ on: true, words: null })
    expect(weekSurf([{ faceFt: 1.8, shape: 'Bumpy' }, { faceFt: 3.1, shape: 'Bumpy' }], 1)).toEqual({ on: false, words: '2–3 ft' })
    expect(weekSurf([], 1)).toEqual({ on: false, words: null })
  })
  it('a range made by wind waves says so (Batch Polish, Section 4: VB 14 Nov, swell 1.9 ft, wind waves 3.2 ft)', async () => {
    const { weekSurf } = await import('../src/core/homeDay.ts')
    const windy = [{ faceFt: 2.6, shape: 'Messy' as const, swellFt: 1.5, windWaveFt: 2.1 }, { faceFt: 3.7, shape: 'Messy' as const, swellFt: 1.9, windWaveFt: 3.2 }]
    expect(weekSurf(windy, 4).words).toBe('3–4 ft · wind sea · low odds')
    const swell = [{ faceFt: 2.6, shape: 'Bumpy' as const, swellFt: 2.4, windWaveFt: 0.6 }, { faceFt: 3.7, shape: 'Bumpy' as const, swellFt: 3.5, windWaveFt: 0.8 }]
    expect(weekSurf(swell, 4).words).toBe('3–4 ft · low odds')
    expect(weekSurf([{ faceFt: 3.7, shape: 'Bumpy' }], 4).words).toBe('4–5 ft · low odds')
  })
  it('days 4-7: never Fun, the range and the odds', async () => {
    const { weekSurf } = await import('../src/core/homeDay.ts')
    const big = [{ faceFt: 3, shape: 'Clean' as const }, { faceFt: 3.5, shape: 'Clean' as const }]
    expect(weekSurf(big, 3)).toEqual({ on: false, words: '3–4 ft · good odds' })
    expect(weekSurf([{ faceFt: 3, shape: 'Clean' }, { faceFt: 3, shape: 'Bumpy' }, { faceFt: 2, shape: 'Bumpy' }], 5).words).toBe('2–3 ft · some odds')
    expect(weekSurf([{ faceFt: 0.4, shape: 'Clean' }, { faceFt: 0.8, shape: 'Clean' }], 6).words).toBe('0–1 ft · low odds')
    for (const i of [3, 4, 5, 6]) expect(weekSurf(big, i).on).toBe(false)
  })
})
