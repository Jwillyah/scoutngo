import { describe, expect, it } from 'vitest'
import { placeOf, shownGroups, specialName } from '../src/lib/placeGroups.ts'

/* Coast or inland decides Water or Land; Settings can override each (field test, 30 Oct). */
describe('Water or Land', () => {
  it('the place decides: within 2 km of the sea is the coast, none in reach is inland, not asked is neither', () => {
    expect(placeOf(0)).toBe('coast')
    expect(placeOf(1950)).toBe('coast')
    expect(placeOf(2050)).toBe('inland')
    expect(placeOf(null)).toBe('inland')
    expect(placeOf(undefined)).toBe('unknown')
  })

  it('Auto follows the place, Always and Off override it, and not known yet offers neither', () => {
    const auto = { water: 'auto', land: 'auto' } as const
    expect(shownGroups(auto, 'coast')).toEqual({ water: true, land: false })
    expect(shownGroups(auto, 'inland')).toEqual({ water: false, land: true })
    expect(shownGroups(auto, 'unknown')).toEqual({ water: false, land: false })
    expect(shownGroups({ water: 'always', land: 'off' }, 'inland')).toEqual({ water: true, land: false })
    expect(shownGroups({ water: 'off', land: 'always' }, 'coast')).toEqual({ water: false, land: true })
  })

  it('inland, fog is valley fog; at the coast it is fog', () => {
    expect(specialName('fog', 'inland')).toBe('Valley fog')
    expect(specialName('fog', 'coast')).toBe('Fog')
    expect(specialName('glass', 'coast')).toBe('Glassy water')
  })
})
