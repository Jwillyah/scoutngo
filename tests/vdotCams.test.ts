import { describe, expect, it } from 'vitest'
import { VDOT_CAMS, VDOT_CAMS_SOURCE } from '../src/data/vdotCams.ts'
import { camsTowardSun } from '../src/core/skyCams.ts'

describe('VDOT coastal cams (Batch K, Section 7)', () => {
  it('records its source and the day it was read', () => {
    expect(VDOT_CAMS_SOURCE.url).toMatch(/^https:\/\/511\.vdot\.virginia\.gov\//)
    expect(VDOT_CAMS_SOURCE.read).toMatch(/^\d{4}-\d\d-\d\d$/)
    expect(VDOT_CAMS.length).toBeGreaterThan(100)
  })
  it('a direction is VDOT’s own label or unknown, never guessed', () => {
    const FACING: Record<string, number> = { NB: 0, N: 0, Northbound: 0, NE: 45, EB: 90, E: 90, Eastbound: 90, SE: 135, SB: 180, S: 180, Southbound: 180, SW: 225, WB: 270, W: 270, Westbound: 270, NW: 315 }
    for (const c of VDOT_CAMS) expect(c.facing, c.id).toBe(FACING[c.label] ?? null)
    expect(VDOT_CAMS.some((c) => c.facing === null)).toBe(true)
  })
  it('links out to the cam’s own still, https, and ids are unique', () => {
    for (const c of VDOT_CAMS) expect(c.url, c.id).toMatch(/^https:\/\/[a-z0-9.-]*vdotcameras\.com\//)
    expect(new Set(VDOT_CAMS.map((c) => c.id)).size).toBe(VDOT_CAMS.length)
  })
  it('a lane label is not where the lens looks: no VDOT cam is offered for "Look west" (Batch M)', () => {
    const venue = { lat: 36.85, lon: -76.1 }
    for (const c of VDOT_CAMS) expect(c.facingIs, c.id).toBe('lanes')
    expect(camsTowardSun(venue, 260, VDOT_CAMS, 50)).toEqual([])
    expect(camsTowardSun(venue, 90, VDOT_CAMS, 50)).toEqual([])
  })
})
