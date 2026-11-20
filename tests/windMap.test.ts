import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WIND_PAGE_OLD_FIRST } from '../src/config/flags.ts'

/*
 * Batch SIMPLE-2, Section 5: Wind = the map. The wiring the browser audits
 * (scripts/audit-wind.mjs, audit-map-layers.mjs) replay, held here too, so a
 * refactor that drops a link fails in the unit tests first.
 */
const map = readFileSync(new URL('../src/components/MapView.tsx', import.meta.url), 'utf8')
const plan = readFileSync(new URL('../src/components/PlanMode.tsx', import.meta.url), 'utf8')

describe('the sun and moon lines step aside for a weather layer (5.4)', () => {
  it('the dashed axis through the pin has no azimuth without the lines (it ignored the Sun switch and stayed over the radar)', () => {
    expect(map).toMatch(/const lineAzimuth = !sunLines \? null :/)
  })
  it('the rays, pills and labels read showSun and showArc gated by the same rule', () => {
    expect(map).toMatch(/const showSun = showSunIn && sunLines/)
    expect(map).toMatch(/const showArc = showArcIn && sunLines/)
  })
  it('the plan hands the map the rule for its weather layer, not a copy of it', () => {
    expect(plan).toMatch(/sunLines=\{sunMoonLinesShown\(weatherLayer\)\}/)
    expect(plan).not.toMatch(/showSun=\{showSun && weatherLayer/)
  })
})

describe('Wind opens the map (5.1, 5.2)', () => {
  it('the old Wind page is not what Wind opens (flag off: hidden, not deleted)', () => {
    expect(WIND_PAGE_OLD_FIRST).toBe(false)
  })
  it('the wind request is not a page request (a page request keeps the map off screen until a page opens)', () => {
    expect(plan).toMatch(/\.\.\.\(WIND_PAGE_OLD_FIRST \? \['wind'\] : \[\]\)/)
  })
  it('the request opens the wind view on the map', () => {
    expect(plan).toMatch(/cardRequest\.kind === 'wind' && !WIND_PAGE_OLD_FIRST\) \{\s*\/\*[^*]*\*\/\s*openWind\('map'\)/)
  })
  it('opening the wind view: the wind layer, now, the marker on the spot, the sheet down, no page, no 3D', () => {
    const body = plan.slice(plan.indexOf('openWindNow.current = (v) => {'), plan.indexOf('const openWind = useCallback'))
    for (const step of ["pickWeather('wind')", 'scrubTo(new Date())', 'setMarkerAt(null)', "setSheet('peek')", 'setPage(null)', 'setThreeD(false)', 'setCard(HOME)']) expect(body).toContain(step)
  })
  it('Map | Charts only switches the view: no planner, no shoot setup in its handlers', () => {
    const top = plan.slice(plan.indexOf('<div className="windtop"'), plan.indexOf('THE PILL NAMES THE PLACE'))
    expect(top).toContain('onClick={() => setWindView(t.id)}')
    expect(top).not.toMatch(/openPlanner|onShootSetup|setup/i)
    const charts = plan.slice(plan.indexOf('<WindCharts'), plan.indexOf('/>', plan.indexOf('<WindCharts')))
    expect(charts).toContain("onMap={() => setWindView('map')}")
    expect(charts).not.toMatch(/openPlanner|onShootSetup/)
  })
})
