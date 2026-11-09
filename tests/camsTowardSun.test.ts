import { describe, expect, it } from 'vitest'
import { getPosition } from 'suncalc'
import { CAM_FACING_DEG, CAM_MAX_KM, camsFacingWaterOrSun, camsForEvent, camsTowardSun, type FacingCam } from '../src/core/skyCams.ts'
import { destinationPoint } from '../src/core/geo.ts'
import { COAST_CAMS } from '../src/data/coastCams.ts'
import { VDOT_CAMS } from '../src/data/vdotCams.ts'

/* Batch M, Section 4: "Look WSW now" offered I-264 traffic cams 9-15 km inland that looked the wrong way. */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const cam = (id: string, km: number, bearing: number, facing: number | null, extra: Partial<FacingCam> = {}): FacingCam => ({
  id,
  name: id,
  operator: 'x',
  at: destinationPoint(PIER, bearing, km * 1000),
  facing,
  url: `https://${id}.example/`,
  access: 'free',
  ...extra,
})

describe('camsTowardSun: a recorded facing within 45° of the sun, within 15 km', () => {
  it('holds the rule at its edges', () => {
    expect(CAM_MAX_KM).toBe(15)
    expect(CAM_FACING_DEG).toBe(45)
    const cams = [cam('near-on', 3, 0, 250), cam('edge-angle', 4, 90, 250 + 45), cam('past-angle', 5, 90, 250 + 46), cam('edge-km', 14.9, 0, 250), cam('past-km', 15.2, 0, 250)]
    expect(camsTowardSun(PIER, 250, cams, 10).map((c) => c.cam.id)).toEqual(['near-on', 'edge-angle', 'edge-km'])
  })

  it('an unknown facing is never shown', () => {
    expect(camsTowardSun(PIER, 250, [cam('unknown', 1, 0, null)])).toEqual([])
  })

  it('the I-264 case: inland road cams whose label is the lanes, not the lens, are hidden', () => {
    /* 8 Nov 2026 sunset at the pier, WSW. */
    const sunset = new Date('2026-11-08T21:52:00Z')
    const az = getPosition(sunset, PIER.lat, PIER.lon).azimuth
    const i264 = VDOT_CAMS.filter((c) => c.name.startsWith('I-264'))
    /* Before Batch M these passed: labelled WB (270), within 25° of the sun. */
    expect(i264.some((c) => c.facing === 270)).toBe(true)
    expect(camsTowardSun(PIER, az, i264, 50)).toEqual([])
    /* A recorded facing the wrong way, 12 km inland: hidden. */
    expect(camsTowardSun(PIER, az, [cam('i264-wrong-way', 12, 270, 90)])).toEqual([])
    /* The whole row: no beach cam here looks WSW, so the row is hidden. */
    const row = camsForEvent(PIER, sunset, [...COAST_CAMS, ...VDOT_CAMS])
    expect(row.look).toBe('Look WSW now')
    expect(row.cams).toEqual([])
  })

  it('sunrise at the pier still offers the beach cams that face it, all within 15 km', () => {
    const rise = camsForEvent(PIER, new Date('2026-11-08T11:40:00Z'), [...COAST_CAMS, ...VDOT_CAMS])
    expect(rise.cams.length).toBeGreaterThan(0)
    for (const c of rise.cams) {
      expect(c.km).toBeLessThanOrEqual(CAM_MAX_KM)
      expect(c.cam.operator).not.toBe('VDOT')
    }
  })
})

describe('camsFacingWaterOrSun: the home Cams row', () => {
  it('offers a cam that faces the sea or the sun line, within 15 km; unknown facing excluded', () => {
    const cams = [cam('sea', 2, 0, 100), cam('sun', 3, 0, 245), cam('inland-road', 5, 0, 0), cam('unknown', 1, 0, null), cam('lanes', 1, 0, 245, { facingIs: 'lanes' }), cam('far', 20, 0, 100)]
    expect(camsFacingWaterOrSun(PIER, 245, 100, cams, 10).map((c) => c.cam.id)).toEqual(['sea', 'sun'])
    /* No sea facing (an inland venue): the sun line alone. */
    expect(camsFacingWaterOrSun(PIER, 245, null, cams, 10).map((c) => c.cam.id)).toEqual(['sun'])
    /* No line at all: no row. */
    expect(camsFacingWaterOrSun(PIER, null, null, cams, 10)).toEqual([])
  })

  it('at the pier at sunset, the beach cams that face the water, never a VDOT cam', () => {
    const got = camsFacingWaterOrSun(PIER, 243, 100, [...COAST_CAMS, ...VDOT_CAMS], 10)
    expect(got.length).toBeGreaterThan(0)
    for (const c of got) {
      expect(c.cam.operator).not.toBe('VDOT')
      expect(c.km).toBeLessThanOrEqual(CAM_MAX_KM)
    }
  })
})
