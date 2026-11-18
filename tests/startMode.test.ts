import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { startMode } from '../src/lib/mode.ts'

/*
 * Batch SIMPLE-1, Section 0: the planner never opens by itself. A link or a
 * reload with a place starts on the map; only with no place yet is it setup,
 * where the pin goes. The five ways onto the map are walked in a browser by
 * scripts/audit-clean-map.mjs; these pin the code that decides it.
 */
const app = readFileSync('src/App.tsx', 'utf8')
const plan = readFileSync('src/components/PlanMode.tsx', 'utf8')

describe('the mode the app starts in', () => {
  it('is the map whenever there is a place', () => {
    expect(startMode(true)).toBe('plan')
  })
  it('is setup only with no place yet', () => {
    expect(startMode(false)).toBe('setup')
  })
  it('is what App starts in, not a fixed setup', () => {
    expect(app).toMatch(/useState<Mode>\(\(\) => startMode\(/)
    expect(app).not.toMatch(/useState<Mode>\('setup'\)/)
  })
})

describe('leaving a mode clears it', () => {
  it('a loaded spot does not move to the planner by itself', () => {
    const load = app.slice(app.indexOf('const loadSpot'), app.indexOf('USE MY LOCATION'))
    expect(load.length).toBeGreaterThan(100)
    expect(load).not.toContain("setMode('setup')")
  })
  it('a card or drawer request is spent when its mode is left, so a remount does not replay it', () => {
    expect(app).toContain("if (mode !== 'plan') setCardRequest((r) => (r.tick === 0 ? r : { ...r, tick: 0 }))")
    expect(app).toContain("if (mode !== 'setup') setDrawerRequest((r) => (r.tick === 0 ? r : { ...r, tick: 0 }))")
  })
  it('the map uncovered by the home is back to the time bar: no card, sheet down, no 3D or Fly', () => {
    const reset = plan.slice(plan.indexOf('const wasCovered'), plan.indexOf('}, [covered])'))
    for (const s of ['setCard(HOME)', "setSheet('peek')", 'setPendingFly(false)', 'setFlySession(null)', 'setThreeD(false)']) expect(reset).toContain(s)
  })
})
