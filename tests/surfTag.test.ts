import { describe, expect, it } from 'vitest'
import { SURF_FIRING_FT, SURF_FUN_FT, surfTag } from '../src/core/briefing.ts'
import { MESSY_ONSHORE_MPS, surfShape } from '../src/core/surf.ts'
import { GLASSY_MPS } from '../src/core/coastFacing.ts'

/* Batch M, Section 4: on 8 Nov 0-1 ft, ankle to knee, was tagged Fun. One scale, src/core/briefing.ts surfTag. */
describe('the surf tag scale', () => {
  it('ankle to knee is Flat, whatever the wind', () => {
    expect(surfTag(0.5, 'Clean')).toBe('Flat')
    expect(surfTag(1, 'Clean')).toBe('Flat')
    expect(surfTag(1, null)).toBe('Flat')
  })

  it('Fun from 1.5 ft with clean or light wind; messy onshore drops it to Flat', () => {
    expect(surfTag(2, 'Clean')).toBe('Fun')
    expect(surfTag(2, 'Messy')).toBe('Flat')
  })

  it('Firing from 4 ft and clean; messy onshore drops it to Fun', () => {
    expect(surfTag(5, 'Clean')).toBe('Firing')
    expect(surfTag(5, 'Messy')).toBe('Fun')
    /* Neither clean nor messy, or no wind forecast: never called Firing on a guess. */
    expect(surfTag(5, 'Bumpy')).toBe('Fun')
    expect(surfTag(5, null)).toBe('Fun')
  })

  it('boundaries: 1.5 ft and 4 ft', () => {
    expect(SURF_FUN_FT).toBe(1.5)
    expect(SURF_FIRING_FT).toBe(4)
    expect(surfTag(1.49, 'Clean')).toBe('Flat')
    expect(surfTag(1.5, 'Clean')).toBe('Fun')
    expect(surfTag(1.5, 'Messy')).toBe('Flat')
    expect(surfTag(3.99, 'Clean')).toBe('Fun')
    expect(surfTag(4, 'Clean')).toBe('Firing')
    expect(surfTag(4, 'Messy')).toBe('Fun')
  })

  it('clean and messy are the Surf page shape: light or offshore, onshore at 10 kt or more', () => {
    const facing = 90
    expect(surfShape(GLASSY_MPS - 0.1, 90, facing)).toBe('Clean')
    expect(surfShape(8, 270, facing)).toBe('Clean')
    expect(surfShape(MESSY_ONSHORE_MPS, 90, facing)).toBe('Messy')
    expect(surfShape(MESSY_ONSHORE_MPS - 0.1, 90, facing)).toBe('Bumpy')
    expect(surfTag(2, surfShape(MESSY_ONSHORE_MPS, 90, facing))).toBe('Flat')
  })
})
