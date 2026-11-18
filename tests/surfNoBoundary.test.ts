import { describe, expect, it } from 'vitest'
import * as surfCall from '../src/core/surfCall.ts'
import { rangeWords } from '../src/core/surfRange.ts'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { recordedDay, seaAt, spotPlace, TZ, VB } from './surfReplay.ts'

/*
 * THE BOUNDARY RULE IS GONE (Batch 3D, Section 3.1, Jwilly approved). Batch
 * FIX 3.2 lifted a centre within 0.1 ft under a whole foot to the band above;
 * it put 13 Nov 12:30 (truth Flat) at 1-2. The band is the centre's own again
 * (surfBand). measurements/2026-11-17-surf-noboundary.md has the table.
 */
const stats = spotStats([], 0)

describe('the band is the centre’s own', () => {
  it('no boundary rule is exported, and 0.97 ft is 0-1 whatever the range', () => {
    expect('callBand' in surfCall).toBe(false)
    expect('BOUNDARY_FT' in surfCall).toBe(false)
    expect(surfCall.surfBand(0.97)).toEqual([0, 1])
    expect(rangeWords({ lowFt: 0, highFt: 1.99, centerFt: 0.97 })).toBe('0–1 ft')
  })

  it('13 Nov 12:30 PM, VB and Croatan: back to 0-1 (truth Flat)', () => {
    const d = recordedDay('tests/data/surf-2026-11-12-14')
    const t = new Date('2026-11-13T17:30:00Z')
    for (const place of [VB, spotPlace('vb-croatan')]) {
      const r = surfNowFrom(seaAt(d, place, t), stats, t, TZ)
      expect(r.now?.centerFt).toBeCloseTo(0.92, 2)
      expect(r.week[0].call?.words).toBe('0–1 ft')
    }
  })

  it('16 Nov 10:50 AM, 1st St Jetty: 1.97 ft is 1-2 again (truth knee to thigh)', () => {
    const d = recordedDay('tests/data/surf-2026-11-16')
    const t = new Date('2026-11-16T15:50:00Z')
    const r = surfNowFrom(seaAt(d, spotPlace('vb-1st-street-jetty'), t), stats, t, TZ)
    expect(r.now?.centerFt).toBeCloseTo(1.97, 2)
    expect(r.week[0].call?.words).toBe('1–2 ft')
  })
})
