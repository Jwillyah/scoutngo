import { describe, expect, it } from 'vitest'
import { AT_KM, bundledPlaceName, nearestNamed, NEAR_KM } from '../src/core/nearestPlace.ts'
import { shortVenueLabel, venueLabel } from '../src/core/venueName.ts'
import { reverseUrl } from '../src/lib/search.ts'
import { bundledPlaces } from '../src/lib/useBundledPlaceName.ts'

/*
 * E9: the map's title read "36.6623" (the coordinate, cut at its comma) while
 * the venue had no name. Now a spot or town from bundled data names it, and
 * the coordinate is never cut in half.
 */
describe('a name for a pin from bundled data', () => {
  it('names a pin south of Sandbridge from the bundled spots and towns, with no request', async () => {
    const { spots, towns } = await bundledPlaces()
    expect(spots.length).toBeGreaterThan(200)
    expect(towns.length).toBeGreaterThan(2000)
    const name = bundledPlaceName({ lat: 36.6623, lon: -75.9269 }, spots, towns)
    expect(name).not.toBeNull()
    expect(name).toMatch(/^near /)
    expect(name).not.toMatch(/\d/)
  })

  it('says the spot itself on top of it, "near" further out, nothing past NEAR_KM', () => {
    const spots = [{ name: 'Sandbridge Beach', at: { lat: 36.73, lon: -75.94 } }]
    const towns = [{ name: 'Virginia Beach', at: { lat: 36.85, lon: -75.98 } }]
    expect(bundledPlaceName({ lat: 36.73, lon: -75.94 }, spots, towns)).toBe('Sandbridge Beach')
    expect(bundledPlaceName({ lat: 36.70, lon: -75.93 }, spots, towns)).toBe('near Sandbridge Beach')
    expect(bundledPlaceName({ lat: 38.5, lon: -78.0 }, spots, towns)).toBeNull()
    expect(nearestNamed({ lat: 36.73, lon: -75.94 + 0.01 }, spots)?.km).toBeLessThan(AT_KM)
    expect(NEAR_KM).toBeLessThanOrEqual(25)
  })

  it('puts the bundled name in the title before the coordinate, and never cuts a coordinate at its comma', () => {
    const unknown = { kind: 'unknown' as const }
    expect(shortVenueLabel(unknown, '36.6623', '-75.9269', 'near Sandbridge')).toBe('near Sandbridge')
    expect(venueLabel({ kind: 'looking' }, '36.6623', '-75.9269', 'near Sandbridge')).toBe('near Sandbridge')
    expect(shortVenueLabel(unknown, '36.6623', '-75.9269')).toBe('36.6623, -75.9269')
    /* A resolved name still wins over the bundled one. */
    expect(shortVenueLabel({ kind: 'name', name: 'Little Island Park, Virginia Beach' }, '36.6623', '-75.9269', 'near Sandbridge')).toBe('Little Island Park')
  })

  it('sends the reverse lookup no more than the coordinate rounded to 2 decimals', () => {
    const u = new URL(reverseUrl({ lat: 36.662345, lon: -75.926912 }))
    expect(u.searchParams.get('lat')).toBe('36.66')
    expect(u.searchParams.get('lon')).toBe('-75.93')
  })
})
