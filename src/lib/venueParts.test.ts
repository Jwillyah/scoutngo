import { describe, expect, it } from 'vitest'
import { shortVenueLabel, venueLabel } from '../core/venueName.ts'
import { venueTown } from './venueParts.ts'

const SALISBURY = { lat: '38.3642', lon: '-75.6059' }
const named = { kind: 'name', name: 'Brew River Dock Bar, Salisbury MD' } as const

describe('the town the venue bar does not show', () => {
  /*
   * THE TWO HALVES COME FROM ONE BOUNDARY. core decides where the name ends;
   * this takes the rest. Asserted together, from core's real output, because
   * the whole point of deriving it is that the two cannot disagree.
   */
  it('is whatever core’s short label left behind', () => {
    const full = venueLabel(named, SALISBURY.lat, SALISBURY.lon)
    const short = shortVenueLabel(named, SALISBURY.lat, SALISBURY.lon)
    expect(short).toBe('Brew River Dock Bar')
    expect(venueTown(full, short)).toBe('Salisbury MD')
    /* And the two halves put the line back together. */
    expect(`${short}, ${venueTown(full, short)}`).toBe(full)
  })

  it('keeps every comma after the first, whatever core decides about them', () => {
    expect(venueTown('Sandbridge Beach, Virginia Beach, VA', 'Sandbridge Beach')).toBe(
      'Virginia Beach, VA',
    )
  })

  /* A venue with no town is the common case and is not a missing value. */
  it('is null when there is nothing after the name', () => {
    expect(venueTown('Big Meadow', 'Big Meadow')).toBeNull()
    expect(venueTown('Big Meadow,', 'Big Meadow')).toBeNull()
    expect(venueTown('Big Meadow,   ', 'Big Meadow')).toBeNull()
  })

  /*
   * AND IT REFUSES RATHER THAN GUESSES when the short label is not a prefix
   * of the full one. That cannot happen today; if core ever changes how it
   * shortens, a null here is a missing town and a bad slice would be a
   * confident wrong one.
   */
  it('refuses when the short name is not the start of the full one', () => {
    expect(venueTown('Brew River Dock Bar, Salisbury MD', 'Salisbury MD')).toBeNull()
    expect(venueTown('36.7260, -75.9180', 'Name unknown')).toBeNull()
  })
})
