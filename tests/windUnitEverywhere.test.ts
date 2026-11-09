import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flyUnits, hudWind } from '../src/lib/fly/hudUnits.ts'

/*
 * E11: the home read wind in kt and the drone view's compass "Wind 19 mph".
 * Every wind on screen is in Settings' wind unit (src/lib/units.ts, kt by
 * default). The fly HUD's own speeds (the drone's H.S and V.S) stay in its
 * distance system; the WIND does not.
 */
const src = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8')

describe('one wind unit everywhere', () => {
  it('the fly compass reads the Settings wind unit', () => {
    expect(hudWind(8.5, flyUnits('ft', 'kt'))).toBe('Wind 17 kt')
    expect(hudWind(8.5, flyUnits('ft', 'mph'))).toBe('Wind 19 mph')
    const fly = src('components/FlyControls.tsx')
    expect(fly).toContain('{hudWind(wind.mps, units)}')
    expect(fly).not.toContain('Wind {hudSpeed')
    expect(src('components/Clay3D.tsx')).toContain('flyUnits(fly.units, fly.windUnit)')
    expect(src('components/PlanMode.tsx')).toContain('windUnit: units.wind,')
  })

  it('no wind readout hard-codes kts, m/s or knots()', () => {
    const panel = src('components/WeatherPanel.tsx')
    expect(panel).not.toMatch(/\bkts\b/)
    expect(panel).not.toMatch(/knots\(/)
    expect(src('components/CamList.tsx')).toContain('formatWind(wind.speedMps, units.wind)')
  })
})
