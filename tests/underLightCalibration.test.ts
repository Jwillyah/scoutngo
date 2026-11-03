import { describe, expect, it } from 'vitest'
import { getPosition, getTimes } from 'suncalc'
import { CALIBRATION_MIN, underLitWindow } from '../src/core/underLight.ts'

/* Truth case #5: the 2 Nov 2026 sunset at Chix Beach, a mid deck at 12k ft, the gap's edge 188 km out (the Batch J replay). */
const CHIX = { lat: 36.92, lon: -76.07 }
const SUNSET = getTimes(new Date('2026-11-02T17:00:00Z'), CHIX.lat, CHIX.lon).sunset as Date
const alt = (t: Date) => getPosition(t, CHIX.lat, CHIX.lon).altitude
const hhmm = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })

describe('truth case #5 calibration (Batch K, Section 7)', () => {
  it('is one constant, 0 until the photo timestamps come', () => {
    expect(CALIBRATION_MIN).toBe(0)
  })
  it('with it at 0 the window is the replay’s', () => {
    const w = underLitWindow('sunset', SUNSET, 12_000 * 0.3048, 188, alt)
    expect(w).not.toBeNull()
    expect(`${hhmm(w!.from)}–${hhmm(w!.to)}`).toMatch(/^(4:59|5:0\d) PM–5:1\d PM$/)
  })
  it('moves the whole window by its minutes and nothing else', () => {
    const a = underLitWindow('sunset', SUNSET, 3658, 188, alt, 0)!
    const b = underLitWindow('sunset', SUNSET, 3658, 188, alt, 7)!
    for (const k of ['from', 'peak', 'to'] as const) expect(b[k].getTime() - a[k].getTime()).toBe(7 * 60_000)
    expect(b.slotDeg).toBe(a.slotDeg)
    expect(b.untilDeg).toBe(a.untilDeg)
  })
})
