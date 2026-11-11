import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blockUrl, parseBlock } from '../src/lib/useWindViewport.ts'

/* Batch MAP2, Section 3: the Batch MAP leftovers, read from the source where the wiring is the thing (docs/failure-modes.md, B). */
const src = (p: string) => readFileSync(p, 'utf8')

describe('Batch MAP leftovers', () => {
  it('the place pill opens the spot search; the + is "Plan a shoot", there only when Shoot is picked (Batch Flow)', () => {
    expect(src('src/components/PlanMode.tsx')).toMatch(/className="pill-venue" onClick=\{onSearch\} aria-label="Find a spot"/)
    const app = src('src/App.tsx')
    expect(app).toMatch(/onSearch=\{\(\) => setSpotPickOpen\(true\)\}/)
    expect(app).toMatch(/onShootSetup=\{\(\) => setMode\('setup'\)\}/)
    expect(src('src/components/PlanMode.tsx')).toMatch(/addLabel=\{onShootSetup === undefined \? undefined : 'Plan a shoot'\}/)
    /* Batch Polish, Section 2: on the map (with its Back to the home) the top bar is back · spot · locate; "Plan a shoot" is in the Map sheet's tools. */
    expect(src('src/components/PlanMode.tsx')).toMatch(/addHidden=\{planShoot === false \|\| onHome !== undefined\}/)
    expect(src('src/components/PlanMode.tsx')).toMatch(/menuHidden=\{onHome !== undefined\}/)
    expect(src('src/components/PlanMode.tsx')).toMatch(/label: 'Plan a shoot', icon: featIcon/)
  })

  it('Map style is Satellite · Map · 3D, Map the plain vector map that hides the satellite', () => {
    expect(src('src/components/FeaturesSheet.tsx')).toMatch(/\{ id: 'map', label: 'Map' \}/)
    const mv = src('src/components/MapView.tsx')
    expect(mv).toMatch(/m\.addSource\('ofm-base', \{ type: 'vector', tiles: \[viaProtocol\(VECTOR_TEMPLATE\)\]/)
    expect(mv).toMatch(/for \(const id of \['esri', UNDERLAY_LAYER\]\) if \(m\.getLayer\(id\) !== undefined\) m\.setLayoutProperty\(id, 'visibility', vectorBase \? 'none' : 'visible'\)/)
  })

  it('the drone\'s 400 ft asks the 120 m level and draws in the new wind look (no old streaks)', () => {
    const u = new URL(blockUrl([{ lat: 36, lon: -75.75 }], 'blend', 3, '120m'))
    expect(u.searchParams.get('hourly')).toBe('wind_speed_120m,wind_direction_120m')
    const series = parseBlock({ hourly: { time: ['2026-11-09T12:00'], wind_speed_120m: [9], wind_direction_120m: [270] } }, [{ lat: 36, lon: -75.75 }], '120m')
    expect(series[0].speed[0]).toBe(9)
    expect(series[0].gust[0]).toBeNull()
    expect(src('src/components/MapView.tsx')).not.toMatch(/WindStreaks/)
  })
})
