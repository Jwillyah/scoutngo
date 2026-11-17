import { describe, expect, it } from 'vitest'
import { BOUNDARY_FT, callBand, surfBand } from '../src/core/surfCall.ts'
import { rangeWords } from '../src/core/surfRange.ts'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { recordedDay, seaAt, spotPlace, TZ, VB } from './surfReplay.ts'

/*
 * BOUNDARY ROUNDING (Batch FIX, Section 3.2): 14 Nov 4:30 PM read 0.97 ft and
 * said 0-1 while the beach had 1-2. Within BOUNDARY_FT under a whole foot the
 * likely range's top picks: the band above when it reaches that foot.
 * measurements/2026-11-17-surf-fix.md has every day before and after.
 */
const stats = spotStats([], 0)

describe('the band at a boundary', () => {
  it('0.97 with a top of 1.99 is 1-2; 0.89 stays 0-1; a top short of the foot keeps the centre’s band', () => {
    expect(BOUNDARY_FT).toBe(0.1)
    expect(callBand(0.97, 1.99)).toEqual([1, 2])
    expect(callBand(0.9, 1.9)).toEqual([1, 2])
    expect(callBand(0.89, 1.89)).toEqual([0, 1])
    expect(callBand(0.97, 0.99)).toEqual([0, 1])
    expect(callBand(1.02, 2.02)).toEqual([1, 2])
    expect(callBand(3.95, 4.95)).toEqual([4, 6])
    /* No range: the centre alone, as before. */
    expect(callBand(0.97)).toEqual(surfBand(0.97))
  })

  it('the words say the same band (rangeWords reads callBand)', () => {
    expect(rangeWords({ lowFt: 0, highFt: 1.99, centerFt: 0.97 })).toBe('1–2 ft')
  })

  it('14 Nov 4:30 PM, VB: 0.97 ft, now 1-2 (the beach had 1-2)', () => {
    const d = recordedDay('tests/data/surf-2026-11-12-14')
    const t = new Date('2026-11-14T21:30:00Z')
    const r = surfNowFrom(seaAt(d, VB, t), stats, t, TZ)
    expect(r.now?.centerFt).toBeCloseTo(0.97, 2)
    expect(r.week[0].call?.words).toBe('1–2 ft')
  })

  /*
   * 13 NOV 12:30 PM, CHECKED WITH THE SAME RULE, AND STILL A MISS. Truth Flat
   * (fixtures/truth/2026-11-13-vb.json). The centre is 0.92 ft, so the size
   * tag is Small (Flat is under 0.6 ft; the rule picks bands, not tags), and
   * the band, 0-1 before, is now 1-2: the likely range is always more than a
   * foot wide, so its top always reaches the next foot, and every centre
   * within 0.1 ft under one goes up. Pinned here as what it says, not as right.
   */
  it('13 Nov 12:30 PM, VB: Small, and the band goes from 0-1 to 1-2 against a truth of Flat (a miss, reported)', () => {
    const d = recordedDay('tests/data/surf-2026-11-12-14')
    const t = new Date('2026-11-13T17:30:00Z')
    const r = surfNowFrom(seaAt(d, VB, t), stats, t, TZ)
    expect(r.now?.centerFt).toBeCloseTo(0.92, 2)
    expect(r.week[0].call?.size).toBe('Small')
    expect(r.week[0].call?.words).toBe('1–2 ft')
  })

  it('16 Nov 10:50 AM, 1st St Jetty: 1.97 ft goes to 2-3 against knee to thigh (a miss the rule makes, reported)', () => {
    const d = recordedDay('tests/data/surf-2026-11-16')
    const t = new Date('2026-11-16T15:50:00Z')
    const r = surfNowFrom(seaAt(d, spotPlace('vb-1st-street-jetty'), t), stats, t, TZ)
    expect(r.now?.centerFt).toBeCloseTo(1.97, 2)
    expect(r.week[0].call?.words).toBe('2–3 ft')
  })
})
