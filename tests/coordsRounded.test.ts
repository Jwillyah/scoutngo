import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * WEATHER, MARINE AND TIDE LOOKUPS SEND THE PLACE TO 2 DECIMALS, about a
 * kilometre (29 Oct, Batch B privacy). The forecast grids are coarser than
 * that, so nothing is lost; the venue to the metre is not something any of
 * them needs. NOAA's tide requests carry a station number, never a place.
 */
const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('coordinates leave the phone rounded', () => {
  it('to 2 decimals in every Open-Meteo request', () => {
    for (const p of ['src/lib/forecast.ts', 'src/lib/tideSheetData.ts', 'src/lib/skyFireData.ts', 'src/lib/specialLightData.ts']) {
      const lines = code(p).split('\n').filter((l) => /latitude|longitude/.test(l) && /toFixed\(/.test(l))
      expect(lines.length, p).toBeGreaterThan(0)
      for (const l of lines) expect(l, `${p}: ${l.trim()}`).not.toMatch(/toFixed\([3-9]\)/)
    }
  })

  it('and NOAA tides are asked by station, not by place', () => {
    expect(code('src/lib/noaa.ts')).not.toMatch(/lat(itude)?[=:]\s*\$?\{?[a-z.]*lat/i)
  })
})
