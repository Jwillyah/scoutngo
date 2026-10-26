import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from '../core/kit.ts'
import { lensEnds, standForLineUp } from './standRequest.ts'

describe('stand here', () => {
  it('zooms between the lens ends from the kit; a drone camera or an unknown lens is fixed', () => {
    const zoom = DEFAULT_KIT.lenses.find((l) => l.minFocalLength < l.maxFocalLength)
    if (zoom === undefined) throw new Error('the default kit has no zoom lens')
    expect(lensEnds(DEFAULT_KIT, zoom.id, zoom.minFocalLength + 1)).toEqual([zoom.minFocalLength, zoom.maxFocalLength])
    expect(lensEnds(DEFAULT_KIT, 'air3s-wide', 24)).toEqual([24, 24])
  })

  it('the line-up stands at its first point, on foot, facing the target, on the longest end', () => {
    const at = new Date('2026-10-25T21:45:00Z')
    const target = { lat: 36.85, lon: -75.975 }
    const req = standForLineUp({ stand: { lat: 36.849, lon: -75.976 }, at, altitude: 2 }, target, { id: 'sony-70-200', minFocalLength: 70, maxFocalLength: 200 }, 'fullFrame', 7)
    expect(req).toMatchObject({ aimAt: target, droneFeet: null, focal: 200, lensMin: 70, lensMax: 200, bearing: null, tick: 7 })
    expect(req.label).toContain('2°')
  })
})
