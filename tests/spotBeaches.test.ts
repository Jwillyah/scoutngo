import { describe, expect, it } from 'vitest'
import { surfEstimate } from '../src/core/surf.ts'
import { inlandWaterName, openCoastFirst } from '../src/core/tide.ts'
import { SURF_SPOTS } from '../src/data/surfSpots.ts'

/*
 * EVERY SPOT ON ITS OCEAN BEACH (Batch Beach, Section 1; Rodanthe, 10 Nov:
 * 44095 at 3.0 ft, 12 s from the E became "≈ 0.0 ft at this beach", the
 * beach faced the sound). A buoy of 2 ft or more with its swell inside the
 * beach's window (within SWELL_WINDOW_DEG of the facing) never gives under
 * 1 ft at any spot we list.
 */
const SWELL_WINDOW_DEG = 60
const FT = 3.28084

describe('every spot sees its own swell', () => {
  for (const s of SURF_SPOTS) {
    it(`${s.name} (faces ${s.facing}°): 2 ft and more inside the window is never under 1 ft`, () => {
      for (const ft of [2, 3, 5]) {
        for (const period of [7, 10, 12, 16]) {
          for (const off of [-SWELL_WINDOW_DEG, -30, 0, 30, SWELL_WINDOW_DEG]) {
            const face = surfEstimate(ft / FT, period, (s.facing + off + 360) % 360, s.facing).faceFt
            expect(face, `${ft} ft ${period} s from ${(s.facing + off + 360) % 360}°`).toBeGreaterThanOrEqual(1)
          }
        }
      }
    })
  }
  it('the Rodanthe case: 3.0 ft, 12 s from the E at S-Turns is a real wave, not 0.0', () => {
    const sTurns = SURF_SPOTS.find((x) => x.id === 's-turns')
    expect(sTurns).toBeDefined()
    expect(surfEstimate(3 / FT, 12, 90, sTurns!.facing).faceFt).toBeGreaterThan(2.5)
    /* The sound-facing beach of the old pin: nothing. */
    expect(surfEstimate(3 / FT, 12, 90, 270).faceFt).toBe(0)
  })
  it('a sound station goes after the ocean one within reach', () => {
    expect(inlandWaterName('Rodanthe, Pamlico Sound')).toBe(true)
    const st = (id: string, name: string, km: number) => ({ station: { id, name, at: { lat: 0, lon: 0 }, type: 'R' }, distanceKm: km, proximity: 'near' }) as never
    expect(openCoastFirst([st('a', 'Rodanthe, Pamlico Sound', 0.6), st('b', 'Rodanthe Ocean Pier', 1.2)]).map((c: { station: { id: string } }) => c.station.id)).toEqual(['b', 'a'])
  })
})
