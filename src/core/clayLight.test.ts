import { describe, expect, it } from 'vitest'
import { CLAY_LIGHT_INTENSITY, clayLight } from './sky3d.ts'

describe('the 3D base light', () => {
  it('lights dawn and dusk as brightly as noon, with no shadows while the sun is down', () => {
    /* Virginia Beach 7:11 AM on 27 Oct: the sun a few degrees under the horizon. */
    expect(clayLight(-3)).toEqual({ intensity: CLAY_LIGHT_INTENSITY, shadows: false })
    expect(clayLight(-18)).toEqual({ intensity: CLAY_LIGHT_INTENSITY, shadows: false })
    expect(clayLight(35)).toEqual({ intensity: CLAY_LIGHT_INTENSITY, shadows: true })
  })

  it('casts shadows from the moment the sun is up', () => {
    expect(clayLight(0).shadows).toBe(false)
    expect(clayLight(0.5).shadows).toBe(true)
  })
})
