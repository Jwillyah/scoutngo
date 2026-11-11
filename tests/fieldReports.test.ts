import { describe, expect, it } from 'vitest'
import { shareText, SPOT_FACTOR_MIN_REPORTS, SPOT_FACTOR_RANGE, spotFactor, type FieldReport } from '../src/core/fieldReports.ts'
import { beachFactorAt } from '../src/core/beachFactor.ts'
import { spotKey } from '../src/core/spotSkill.ts'
import { factorHere } from '../src/lib/beachFactorHere.ts'
import { addReport, FIELD_REPORTS_KEY, readReports, removeReport } from '../src/lib/fieldReportStore.ts'

/*
 * FIELD REPORTS (Batch Beach, Section 3): kept on the phone, calibrating the
 * spot; a share says the spot's name, the hour, the size and the rating and
 * nothing else. Fixtures, not reports.
 */
const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}
const r = (over: Partial<FieldReport> = {}): FieldReport => ({ spot: '35.61,-75.47', name: 'S-Turns', at: Date.UTC(2026, 10, 10, 12, 5), size: '3-4', rating: 'Good', buoyFt: 3, ...over })

describe('a spot’s factor from its reports', () => {
  it('none until three reports with a buoy; then the median of seen over buoy', () => {
    const two = [r(), r({ at: 1 })]
    expect(spotFactor(two, '35.61,-75.47')).toBeNull()
    const three = [r(), r({ at: 1, size: '2-3' }), r({ at: 2, size: '4-6' })]
    expect(three.length).toBe(SPOT_FACTOR_MIN_REPORTS)
    expect(spotFactor(three, '35.61,-75.47')).toBeCloseTo(3.5 / 3, 9)
  })
  it('a report without a buoy, or at another spot, does not count', () => {
    const mixed = [r(), r({ at: 1, buoyFt: null }), r({ at: 2, spot: 'elsewhere' }), r({ at: 3, buoyFt: 0.2 })]
    expect(spotFactor(mixed, '35.61,-75.47')).toBeNull()
  })
  it('held within its range: a report corrects the transform, it does not replace it', () => {
    const flat = [r({ size: '0-1' }), r({ at: 1, size: '0-1' }), r({ at: 2, size: '0-1' })].map((x) => ({ ...x, buoyFt: 5 }))
    expect(spotFactor(flat, '35.61,-75.47')).toBe(SPOT_FACTOR_RANGE[0])
  })
})

describe('sharing says only spot, hour, size and rating', () => {
  it('the text', () => {
    expect(shareText(r())).toBe('S-Turns · 2026-11-10T12:00Z · 3–4 ft · Good')
  })
  it('no coordinate, no buoy, no minutes', () => {
    const t = shareText(r())
    expect(t).not.toMatch(/35\.6|-75\.4|:05/)
  })
})

describe('the store: this phone only', () => {
  it('adds, reads back, removes; refuses junk', () => {
    const s = mem()
    addReport(r(), s)
    addReport(r({ at: 5, size: '1-2', rating: 'Poor' }), s)
    expect(readReports(s).map((x) => x.at)).toEqual([5, r().at])
    removeReport(5, r().spot, s)
    expect(readReports(s).length).toBe(1)
    s.setItem(FIELD_REPORTS_KEY, JSON.stringify([{ spot: 1 }, r({ size: '9-9' as never }), r()]))
    expect(readReports(s).length).toBe(1)
    s.setItem(FIELD_REPORTS_KEY, 'not json')
    expect(readReports(s)).toEqual([])
  })
})

describe('the factor here: your reports first, the region’s otherwise', () => {
  it('three reports at S-Turns set its factor; elsewhere in the region the region’s', () => {
    const at = { lat: 35.6085, lon: -75.4655 }
    const k = spotKey(at)
    const mine = [r({ spot: k, size: '1-2' }), r({ spot: k, at: 1, size: '1-2' }), r({ spot: k, at: 2, size: '1-2' })]
    expect(factorHere(at, mine)).toBeCloseTo(1.5 / 3, 9)
    expect(factorHere(at, mine.slice(0, 2))).toBe(beachFactorAt(at))
    expect(factorHere({ lat: 35.9, lon: -75.6 }, mine)).toBe(beachFactorAt({ lat: 35.9, lon: -75.6 }))
  })
})
