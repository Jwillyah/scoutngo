import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AIR_DEFAULTS, openingLayers, sheetSummary, type AirspaceRead } from '../src/core/droneAirRead.ts'
import { heightGrid, heightHeadline, heightSub } from '../src/core/droneHeight.ts'
import { lensFog, lensSunWords, LENS_FOG_SPREAD_F, sunAtHeightWords, WARM_CAR_DROP_F, WARM_CAR_F } from '../src/core/dronePlan.ts'

/*
 * THE DRONE PAGES, SLIMMED (Batch FIX, Section 6; boards Drone_Slim_1 to 4).
 * The words are src/core's; the views' own tests are in
 * src/components/droneViews.test.tsx; one airspace read per point is
 * tests/droneAirOne.test.ts; Kp is tests/kpRead.test.ts.
 */
const KT = 0.514444
const kt = (mps: number) => `${Math.round(mps / KT)} kt`
const at = (iso: string) => new Date(iso)
const span = (a: Date, b: Date) => `${a.getUTCHours()}–${b.getUTCHours()}`
const F = (f: number) => (f - 32) / 1.8

describe('By height: a short headline (6.3)', () => {
  const sunset = at('2026-11-17T21:53:00Z')
  const first = at('2026-11-17T12:00:00Z')
  const all = { kind: 'calm' as const, span: { from: first, to: sunset } }
  it('"Calm all day" when the calm runs from the first hour to sunset', () => {
    expect(heightHeadline(all, first, sunset, true, false, span, kt)).toBe('Calm all day')
    expect(heightHeadline(all, first, sunset, false, true, span, kt)).toBe('Calm all day tomorrow')
    expect(heightHeadline(all, first, sunset, false, false, span, kt)).toBe('Calm until sunset')
  })
  it('"Best 3–4:50 PM" for a window inside the day', () => {
    expect(heightHeadline({ kind: 'calm', span: { from: at('2026-11-17T20:00:00Z'), to: sunset } }, first, sunset, true, false, span, kt)).toBe('Best 20–21')
  })
  it('short words for the rest, never "safe" or "clear"', () => {
    const others = [
      heightHeadline({ kind: 'windy', overMps: 14 * KT, allDay: true }, first, sunset, true, false, span, kt),
      heightHeadline({ kind: 'no-rating' }, first, sunset, true, false, span, kt),
      heightHeadline({ kind: 'dark' }, first, sunset, true, false, span, kt),
      heightHeadline({ kind: 'unknown' }, first, sunset, true, false, span, kt),
    ]
    expect(others).toEqual(['Over 14 kt all day', 'No wind limit set', 'Sun down', 'Wind at 400 ft not forecast'])
    for (const h of others) expect(h.length).toBeLessThanOrEqual(28)
  })
  it('one line under it, from the grid’s own cells: "6–9 kt from NNE at every height · limit 23"', () => {
    const hours = Array.from({ length: 8 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 17, 12 + i)), mps10: 6 * KT, mps120: 9 * KT }))
    const g = heightGrid(hours, 23 * KT, 100, sunset)
    expect(heightSub(g, 23 * KT, 'NNE', (m) => m / KT, 'kt')).toBe('6–9 kt from NNE at every height · limit 23')
    expect(heightSub(null, 23 * KT, 'NNE', (m) => m / KT, 'kt')).toBe('The forecast did not give the wind by height.')
  })
  it("the grid has no cards and no buttons of its own: it sits under the Wind tab, and the buttons are Preflight's (Batch SIMPLE-1, Section 1)", () => {
    const page = readFileSync('src/components/DronePage.tsx', 'utf8')
    expect(page).toContain('<DroneHeightView data={heightData} />')
    expect(page).toContain("{tab === 'preflight' ? (")
    expect(page).not.toContain("tab === 'now'")
  })
})

describe('Airspace: the sheet in two lines (6.4)', () => {
  const read: AirspaceRead = { cls: 'C', ceilingFt: 100, icao: 'KORF', facility: 'Norfolk Intl', controlled: true, laanc: true, headline: 'Class C · max 100 ft here', row: { big: 'Class C · 100 ft', small: 'KORF' } }
  it('"Norfolk Intl grid · LAANC needed · 0 TFRs here · Remote ID needed"', () => {
    expect(sheetSummary(read, 0, false)).toBe('Norfolk Intl grid · LAANC needed · 0 TFRs here · Remote ID needed')
    expect(sheetSummary(read, 1, true)).toBe('Norfolk Intl grid · LAANC needed · 1 TFR here · In a FRIA')
  })
  it("says what it does not have: TFRs couldn't be checked (never 0); nothing about Remote ID before the FRIA layer", () => {
    expect(sheetSummary(read, null, 'unknown')).toBe("Norfolk Intl grid · LAANC needed · TFRs: couldn't check")
    expect(sheetSummary(read, 'checking', 'unknown')).toBe('Norfolk Intl grid · LAANC needed · TFRs: checking')
    expect(sheetSummary({ ...read, laanc: false, facility: null }, 0, false)).toBe('FAA authorization needed · 0 TFRs here · Remote ID needed')
    expect(sheetSummary(null, 0, false)).toMatch(/Reading/)
  })
  it('never says clear or safe', () => {
    for (const s of [sheetSummary(read, 0, false), sheetSummary({ ...read, controlled: false, cls: null }, 0, true)]) expect(s).not.toMatch(/\b(clear|safe)\b/i)
  })
  it('opens collapsed, with one disclaimer line and a swipe up for the details', () => {
    const sheet = readFileSync('src/components/DroneAirspace.tsx', 'utf8')
    expect(sheet).toContain('const [compact, setCompact] = useState(true)')
    expect(sheet).toContain('onTouchEnd=')
    expect(sheet).toContain('data-marker-sum')
  })
})

describe('Airspace: the layers (6.4)', () => {
  it('no-fly/security and TFRs are on by default, and on again at every opening', () => {
    expect(AIR_DEFAULTS.nofly).toBe(true)
    expect(AIR_DEFAULTS.tfr).toBe(true)
    expect(openingLayers(null)).toEqual(AIR_DEFAULTS)
    const kept = openingLayers({ nofly: false, tfr: false, sua: true, grid: false })
    expect(kept.nofly).toBe(true)
    expect(kept.tfr).toBe(true)
    expect(kept.sua).toBe(true)
    expect(kept.grid).toBe(false)
    expect(openingLayers({ nofly: 'x' as unknown as boolean }).nofly).toBe(true)
  })
  it('a half sheet over the map, not full screen; the map above it closes it', () => {
    const css = readFileSync('src/styles/drone.css', 'utf8')
    const rule = /\.drp__layers \{[^}]*\}/.exec(css)?.[0] ?? ''
    const max = Number(/max-height: (\d+)%/.exec(rule)?.[1] ?? 100)
    expect(max).toBeGreaterThanOrEqual(40)
    expect(max).toBeLessThanOrEqual(60)
    expect(readFileSync('src/components/DroneAirspace.tsx', 'utf8')).toContain('aria-label="Close map layers"')
  })
  it('Chart, Satellite and 3D show drawn thumbnails from the tokens: no image, no host', () => {
    const css = readFileSync('src/styles/drone.css', 'utf8')
    for (const b of ['chart', 'satellite', '3d']) {
      const rule = new RegExp(`\\.drp__thumb--${b} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''
      expect(rule).toMatch(/gradient\(/)
      expect(rule).not.toMatch(/url\(|#[0-9a-f]{3,8}\b|rgb\(/i)
    }
    expect(readFileSync('src/components/DroneAirspace.tsx', 'utf8')).toContain('drp__thumb drp__thumb--${b}')
  })
})

describe('Plan: lens fog in two words (6.8)', () => {
  it('"Possible" within 5 °F of the dew point', () => {
    expect(LENS_FOG_SPREAD_F).toBe(5)
    expect(lensFog(F(60), F(55))).toEqual({ word: 'Possible', why: 'dew' })
    expect(lensFog(F(60), F(54.9)).word).toBe('Low')
  })
  it('"Possible" from a warm car into air 15 °F colder (the car taken as 70 °F)', () => {
    expect(WARM_CAR_F).toBe(70)
    expect(WARM_CAR_DROP_F).toBe(15)
    expect(lensFog(F(55), F(40))).toEqual({ word: 'Possible', why: 'car' })
    expect(lensFog(F(55.1), F(40)).word).toBe('Low')
    /* The board's morning: 46 °F, dew 40 °F. */
    expect(lensFog(F(46), F(40))).toEqual({ word: 'Possible', why: 'car' })
  })
  it('"Low" otherwise, and only those two words', () => {
    expect(lensFog(F(75), F(50))).toEqual({ word: 'Low', why: null })
    for (const t of [30, 50, 70, 90]) for (const d of [10, 30, 50]) expect(['Possible', 'Low']).toContain(lensFog(F(t), F(Math.min(t, d))).word)
  })
})

describe('Plan: the other rows (6.5)', () => {
  const clock = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  it('Sun at 400 ft: "Sets 21:55" and "+2 min"', () => {
    expect(sunAtHeightWords(at('2026-11-17T21:55:00Z'), at('2026-11-17T21:53:00Z'), clock)).toEqual({ big: 'Sets 21:55', small: '+2 min' })
    expect(sunAtHeightWords(null, null, clock).big).toBe('No sunset')
  })
  it('Sun in lens: where the sun sits low and until when, as a fact (no instruction)', () => {
    const low = { from: at('2026-11-17T11:43:00Z'), to: at('2026-11-17T14:29:00Z'), fromDeg: 100, toDeg: 150, midDeg: 135, part: 'morning' as const }
    const w = lensSunWords(low, () => 'SE', clock)
    expect(w).toEqual({ big: 'Low sun SE', small: 'until 14:29' })
    expect(lensSunWords({ ...low, part: 'evening' }, () => 'SW', clock)).toEqual({ big: 'Low sun SW', small: 'from 11:43' })
    expect(w.big).not.toMatch(/avoid|don.t|never/i)
  })
})
