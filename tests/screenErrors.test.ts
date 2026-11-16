import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FLY_LOAD_MS } from '../src/lib/clayStatus.ts'

/* Batch CORE, Section 2: the wiring (the log and the card themselves: src/components/screenErrors.test.tsx). */
describe('3D, Fly, the planner and the map say when they did not load', () => {
  it('Fly within 3 s or "Fly didn\'t load"; 3D and Fly failures go to the phone\'s log', () => {
    expect(FLY_LOAD_MS).toBe(3000)
    const clay = readFileSync('src/components/Clay3D.tsx', 'utf8')
    expect(clay).toMatch(/<ScreenFailCard title="Fly didn't load"/)
    expect(clay).toMatch(/recordError\(fly !== null \? 'Fly' : '3D', 'WebGL context lost/)
  })
  it('a boundary round the map and the planner; a 3D crash says which screen over the map', () => {
    const plan = readFileSync('src/components/PlanMode.tsx', 'utf8')
    expect(plan).toMatch(/<ScreenBoundary name="Map"/)
    expect(plan).toMatch(/setScreenFail\(\{ title: `\$\{which\} didn't load`, message \}\)/)
    expect(plan).toMatch(/markScreenOpen\(flySession !== null && threeD \? 'Fly' : threeD \? '3D' : null\)/)
    expect(readFileSync('src/App.tsx', 'utf8')).toMatch(/<ScreenBoundary name="Planner"/)
  })
  it('a tab iOS reloads in 3D or Fly opens on the map, saying so, never the home', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/useState\(\(\) => died === null && shouldOpenBriefing\(/)
    expect(app).toMatch(/<ScreenFailCard title=\{`\$\{died\} didn't load`\}/)
  })
  it('Settings › Debug lists the last errors; a row says how many while any are kept; nothing is sent', () => {
    const settings = readFileSync('src/components/SettingsPage.tsx', 'utf8')
    expect(settings).toMatch(/<LastErrors zone=\{zone\} \/>/)
    expect(settings).toMatch(/<Row label="Last errors" value=\{String\(errorCount\)\}/)
    expect(readFileSync('src/lib/errorLog.ts', 'utf8')).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest/)
  })
})
