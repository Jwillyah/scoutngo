import { describe, expect, it } from 'vitest'
import { shootPreset } from './shootPreset.ts'

/*
 * THE CHIPS, AND THEY MAKE NO NETWORK CALL.
 *
 * The box they replaced sent prose to a model to extract a date, a window and
 * a platform. These numbers come out of src/core/shootWindow.ts, which is
 * suncalc and arithmetic, so the common case needs no key at all.
 */
const VB = { lat: 36.8529, lon: -75.978 }
const ZONE = 'America/New_York'

describe('the sunrise chip at Virginia Beach', () => {
  const preset = shootPreset('sunrise', VB, '2026-10-15', ZONE)

  it('sets a window that starts in the dark', () => {
    expect(preset).not.toBeNull()
    if (preset === null) return
    expect(preset.startTime).toBe('06:13')
    expect(preset.endTime).toBe('07:45')
  })

  /*
   * AND POINTS AT THE PEAK. Measured on rewind cameras that morning, the best
   * light was at 06:49 and gone before the sun appeared at 07:11.
   */
  it('names the peak, its times, and when to be standing there', () => {
    if (preset === null) throw new Error('expected a preset')
    expect(preset.line).toContain('6:13–7:45 AM')
    expect(preset.line).toContain('blue hour peak')
    expect(preset.line).toContain('6:43–6:53 AM')
    expect(preset.line).toContain('Be set up by 6:38 AM')
    expect(preset.peak?.band).toBe('blue-hour')
  })

  /*
   * IT DOES NOT PROMISE. One morning with a high thin deck is one cloud
   * setup, not a law, so the wording is where light USUALLY concentrates.
   */
  it('says usually, and claims nothing about this particular morning', () => {
    if (preset === null) throw new Error('expected a preset')
    expect(preset.line).toContain('usually')
    for (const word of ['will be', 'guaranteed', 'best light', 'perfect', 'definitely']) {
      expect(preset.line.toLowerCase()).not.toContain(word)
    }
  })
})

describe('the other two chips', () => {
  it('sets an evening window for sunset', () => {
    const preset = shootPreset('sunset', VB, '2026-10-15', ZONE)
    expect(preset).not.toBeNull()
    if (preset === null) return
    expect(Number(preset.startTime.slice(0, 2))).toBeGreaterThan(15)
    expect(preset.line).toContain('blue hour peak')
  })

  /* Daytime nominates no peak, so its line does not pretend to. */
  it('sets a daylight window and names no peak', () => {
    const preset = shootPreset('daytime', VB, '2026-10-15', ZONE)
    expect(preset).not.toBeNull()
    if (preset === null) return
    expect(preset.peak).toBeNull()
    expect(preset.line).not.toContain('usually')
    expect(preset.line).toContain('Window set to')
  })
})

describe('when it cannot be computed', () => {
  it('returns null for a date the form has not filled in', () => {
    expect(shootPreset('sunrise', VB, '', ZONE)).toBeNull()
  })

  /*
   * NO SUNRISE INSIDE THE ARCTIC CIRCLE IN DECEMBER, which is a real answer
   * and not a failure. The caller says so rather than setting a window it
   * invented.
   */
  it('returns null where the day never reaches those bands', () => {
    const svalbard = { lat: 78.22, lon: 15.63 }
    expect(shootPreset('daytime', svalbard, '2026-12-21', 'Arctic/Longyearbyen')).toBeNull()
  })

  it('still works at a latitude where the sun barely sets', () => {
    const svalbard = { lat: 78.22, lon: 15.63 }
    expect(shootPreset('daytime', svalbard, '2026-06-21', 'Arctic/Longyearbyen')).not.toBeNull()
  })
})
