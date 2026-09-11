import { describe, expect, it } from 'vitest'
import { BRIEF_DRIFT_METERS, briefHasText, formatDrift, isBriefStale } from './brief.ts'

const BREW_RIVER = { lat: 38.364236, lon: -75.605912 }
/** Atlantic Park, Virginia Beach. About 150km away. */
const ATLANTIC_PARK = { lat: 36.8529, lon: -75.9779 }
const EVENT = 'Boat docking contest on the Wicomico River.'
const OUTCOME = 'Vertical cuts of boats hitting the pilings.'

describe('isBriefStale', () => {
  it('THE ATLANTIC PARK BUG: flags a brief carried to another venue', () => {
    // A shot list about boat docking came back for a beach park because this
    // text silently persisted through a venue change.
    expect(isBriefStale({ at: BREW_RIVER }, ATLANTIC_PARK, EVENT, OUTCOME)).toBe(true)
  })

  it('stays quiet for a small move within the same venue', () => {
    const nudged = { lat: BREW_RIVER.lat + 0.001, lon: BREW_RIVER.lon }
    expect(isBriefStale({ at: BREW_RIVER }, nudged, EVENT, OUTCOME)).toBe(false)
  })

  it('triggers past the threshold and not before it', () => {
    // 0.01 degrees of latitude is about 1.1km, comfortably over 500m.
    const far = { lat: BREW_RIVER.lat + 0.01, lon: BREW_RIVER.lon }
    expect(isBriefStale({ at: BREW_RIVER }, far, EVENT, OUTCOME)).toBe(true)
    expect(BRIEF_DRIFT_METERS).toBe(500)
  })

  it('says nothing when there is no brief to be wrong', () => {
    expect(isBriefStale({ at: BREW_RIVER }, ATLANTIC_PARK, '', '')).toBe(false)
    expect(isBriefStale({ at: BREW_RIVER }, ATLANTIC_PARK, '   ', '  ')).toBe(false)
  })

  it('flags when only one of the two fields has text', () => {
    expect(isBriefStale({ at: BREW_RIVER }, ATLANTIC_PARK, EVENT, '')).toBe(true)
    expect(isBriefStale({ at: BREW_RIVER }, ATLANTIC_PARK, '', OUTCOME)).toBe(true)
  })

  it('says nothing without an anchor or without a venue', () => {
    expect(isBriefStale(null, ATLANTIC_PARK, EVENT, OUTCOME)).toBe(false)
    expect(isBriefStale({ at: BREW_RIVER }, null, EVENT, OUTCOME)).toBe(false)
  })
})

describe('briefHasText', () => {
  it('ignores whitespace only text', () => {
    expect(briefHasText(' ', '\n')).toBe(false)
    expect(briefHasText('a', '')).toBe(true)
  })
})

describe('formatDrift', () => {
  it('reads in metres up close and kilometres far away', () => {
    expect(formatDrift(480)).toBe('480 m')
    expect(formatDrift(1500)).toBe('1.5 km')
  })
})
