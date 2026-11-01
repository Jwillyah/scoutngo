import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { distanceMeters } from '../src/core/geo.ts'
import { CAM_MI, nearestWithin } from '../src/core/surfWords.ts'
import { COAST_CAMS } from '../src/data/coastCams.ts'

/* The Surf page's cams (src/data/coastCams.ts), field test 30 Oct: Wrightsville showed Ocracoke, Hatteras and Avon. */
const near = (at: { lat: number; lon: number }) => nearestWithin(COAST_CAMS, (c) => distanceMeters(at, c.at))

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

  it('Wrightsville Beach gets its own cams, all within 30 mi, nearest first, and no Outer Banks', () => {
    const got = near({ lat: 34.2104, lon: -77.7964 })
    expect(got).toHaveLength(3)
    expect(got.every((g) => g.m <= CAM_MI * 1609.344)).toBe(true)
    expect(got.map((g) => g.m)).toEqual([...got.map((g) => g.m)].sort((a, b) => a - b))
    expect(got.some((g) => /Ocracoke|Hatteras|Avon/.test(g.cam.name))).toBe(false)
    expect(got[0].cam.name).toMatch(/Wrightsville/)
  })

  it('far from any cam, none: the page says "No public cams within 30 mi"', () => {
    expect(near({ lat: 38.5246, lon: -78.4405 })).toEqual([])
    expect(readFileSync('src/components/SurfPage.tsx', 'utf8')).toContain('No public cams within {CAM_MI} mi.')
  })

  it('is links only: the Surf page draws them as links and nothing fetches them', () => {
    const src = readFileSync('src/components/SurfPage.tsx', 'utf8')
    expect(src).toMatch(/href=\{cam\.url\} target="_blank" rel="noreferrer noopener"/)
    expect(src).not.toMatch(/<iframe|fetch\(cam/)
  })
})
