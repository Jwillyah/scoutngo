import { describe, expect, it } from 'vitest'
import {
  coordinateLabel,
  placeKey,
  shortVenueLabel,
  venueLabel,
  venueNameFor,
} from './venueName.ts'

const SALISBURY = { lat: '38.364236', lon: '-75.605912' }
const SHENANDOAH = { lat: '38.745', lon: '-78.29' }
const CACHED = { key: placeKey(SALISBURY.lat, SALISBURY.lon), name: 'Brew River Dock Bar, Salisbury MD' }

describe('the name belongs to a coordinate', () => {
  it('returns the name at the place it was resolved for', () => {
    const got = venueNameFor(CACHED, SALISBURY.lat, SALISBURY.lon, false)
    expect(got).toEqual({ kind: 'name', name: 'Brew River Dock Bar, Salisbury MD' })
  })

  it('DOES NOT return it anywhere else, which is the whole bug', () => {
    /*
     * The reported failure: drag the pin to Shenandoah, header still reads
     * "Brew River Dock Bar". The cache is still there; it simply is not the
     * name of this place, so it is not returned as one.
     */
    const got = venueNameFor(CACHED, SHENANDOAH.lat, SHENANDOAH.lon, false)
    expect(got.kind).toBe('unknown')
    expect(JSON.stringify(got)).not.toContain('Brew River')
  })

  it('misses on ANY move, with no threshold to tune', () => {
    const nudged = venueNameFor(CACHED, '38.364237', SALISBURY.lon, false)
    expect(nudged.kind).toBe('unknown')
  })

  it('says it is looking while a lookup is in flight', () => {
    expect(venueNameFor(CACHED, SHENANDOAH.lat, SHENANDOAH.lon, true).kind).toBe('looking')
    expect(venueNameFor(null, SHENANDOAH.lat, SHENANDOAH.lon, true).kind).toBe('looking')
  })

  it('says unknown rather than keeping the old one when a lookup fails', () => {
    /* Failure is modelled as "not looking and nothing cached for here". */
    const got = venueNameFor(CACHED, SHENANDOAH.lat, SHENANDOAH.lon, false)
    expect(got.kind).toBe('unknown')
    /* The coordinate, never the old name and never "Name unknown". */
    expect(venueLabel(got, SHENANDOAH.lat, SHENANDOAH.lon)).toBe(coordinateLabel(SHENANDOAH.lat, SHENANDOAH.lon))
    expect(venueLabel(got, SHENANDOAH.lat, SHENANDOAH.lon)).not.toBe(CACHED.name)
  })

  it('treats an empty cached name as nothing, not as a name', () => {
    const blank = { key: placeKey(SALISBURY.lat, SALISBURY.lon), name: '   ' }
    expect(venueNameFor(blank, SALISBURY.lat, SALISBURY.lon, false).kind).toBe('unknown')
  })

  it('tolerates no cache at all', () => {
    expect(venueNameFor(null, SALISBURY.lat, SALISBURY.lon, false).kind).toBe('unknown')
    expect(venueNameFor(undefined, SALISBURY.lat, SALISBURY.lon, false).kind).toBe('unknown')
  })
})

describe('what is shown', () => {
  it('shows the coordinate while looking, because that is what is known', () => {
    const looking = venueNameFor(null, SHENANDOAH.lat, SHENANDOAH.lon, true)
    expect(venueLabel(looking, SHENANDOAH.lat, SHENANDOAH.lon)).toBe('38.7450, -78.2900')
  })

  it('never shows a stale name in any state', () => {
    for (const looking of [true, false]) {
      const state = venueNameFor(CACHED, SHENANDOAH.lat, SHENANDOAH.lon, looking)
      expect(venueLabel(state, SHENANDOAH.lat, SHENANDOAH.lon)).not.toContain('Brew River')
    }
  })

  it('shortens to the part before the first comma', () => {
    const state = venueNameFor(CACHED, SALISBURY.lat, SALISBURY.lon, false)
    expect(shortVenueLabel(state, SALISBURY.lat, SALISBURY.lon)).toBe('Brew River Dock Bar')
  })

  it('does not pretend a non-numeric coordinate is a place', () => {
    expect(coordinateLabel('', '')).toBe('—')
    expect(coordinateLabel('abc', '12')).toBe('—')
  })
})

describe('the key', () => {
  it('is the coordinate text, so it changes exactly when the pin does', () => {
    expect(placeKey('38.1', '-75.2')).toBe('38.1|-75.2')
    expect(placeKey(' 38.1 ', ' -75.2 ')).toBe('38.1|-75.2')
    expect(placeKey('38.1', '-75.2')).not.toBe(placeKey('38.10001', '-75.2'))
  })
})
