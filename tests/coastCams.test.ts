import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { distanceMeters } from '../src/core/geo.ts'
import { CAM_MAX_KM, camsNear } from '../src/core/skyCams.ts'
import { COAST_CAMS } from '../src/data/coastCams.ts'

/* The cams sheet's list (src/data/coastCams.ts, CamsSheet.tsx), field test 30 Oct: Wrightsville showed Ocracoke, Hatteras and Avon. */
const near = (at: { lat: number; lon: number }) => camsNear(at, 'all', COAST_CAMS, null, null)

describe('the coast cam index', () => {
  it('every entry has its fields, an https page, and a unique id', () => {
    expect(COAST_CAMS.length).toBeGreaterThan(200)
    for (const c of COAST_CAMS) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/)
      expect(c.url).toMatch(/^https:\/\//)
      expect(c.state).toMatch(/^[A-Z]{2}$/)
      expect(['free', 'paid']).toContain(c.access)
      expect(c.facing === null || (c.facing >= 0 && c.facing < 360)).toBe(true)
    }
    expect(new Set(COAST_CAMS.map((c) => c.id)).size).toBe(COAST_CAMS.length)
  })

  it('Wrightsville Beach gets its own cams, all within 15 km, nearest first, and no Outer Banks', () => {
    const at = { lat: 34.2104, lon: -77.7964 }
    const got = near(at)
    expect(got.length).toBeGreaterThan(0)
    expect(got.every((g) => distanceMeters(at, g.cam.at) <= CAM_MAX_KM * 1000)).toBe(true)
    expect(got.map((g) => g.km)).toEqual([...got.map((g) => g.km)].sort((a, b) => a - b))
    expect(got.some((g) => /Ocracoke|Hatteras|Avon/.test(g.cam.name))).toBe(false)
    expect(got[0].cam.name).toMatch(/Wrightsville/)
  })

  it('far from any cam, none: the sheet says "No cam within 15 km."', () => {
    expect(near({ lat: 38.5246, lon: -78.4405 })).toEqual([])
    expect(readFileSync('src/components/CamsSheet.tsx', 'utf8')).toContain("'No cam within 15 km.'")
  })

  it('is links only: the cams sheet draws them as links and nothing fetches them', () => {
    const src = readFileSync('src/components/CamsSheet.tsx', 'utf8')
    expect(src).toMatch(/href=\{c\.cam\.url\} target="_blank" rel="noopener noreferrer"/)
    expect(src).not.toMatch(/<iframe|fetch\(cam/)
  })
})
