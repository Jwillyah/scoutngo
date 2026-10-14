import { describe, expect, it } from 'vitest'
import {
  DEBOUNCE_MS,
  MIN_QUERY_CHARS,
  newSessionToken,
  parseRetrieved,
  parseSuggestions,
} from './mapboxSearch.ts'

describe('session tokens', () => {
  /*
   * Mapbox bills per SESSION, so one token has to cover a whole typed query.
   * Two concurrent searches must not share one, or the billing collides.
   */
  it('is unique each time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newSessionToken()))
    expect(tokens.size).toBe(50)
  })

  it('is non-empty', () => {
    expect(newSessionToken().length).toBeGreaterThan(8)
  })
})

describe('the typing contract', () => {
  /* It has to feel like a map app, not like waiting out a rate limit. */
  it('debounces fast enough to read as instant', () => {
    expect(DEBOUNCE_MS).toBeLessThanOrEqual(300)
    expect(MIN_QUERY_CHARS).toBe(3)
  })
})

describe('parseSuggestions', () => {
  const payload = {
    suggestions: [
      {
        name: 'First Street Jetty',
        mapbox_id: 'dXJuOm1ieHBvaTox',
        place_formatted: 'Virginia Beach, Virginia, United States',
        feature_type: 'poi',
      },
      { name: 'No id here', place_formatted: 'Nowhere' },
      { mapbox_id: 'dXJuOm1ieHBvaToy' },
    ],
  }

  it('reads name and place into one label', () => {
    const out = parseSuggestions(payload)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('dXJuOm1ieHBvaTox')
    expect(out[0].label).toBe('First Street Jetty, Virginia Beach, Virginia, United States')
  })

  /* An entry with no id cannot be retrieved, so it cannot be offered. */
  it('drops anything without both an id and a name', () => {
    expect(parseSuggestions(payload).map((s) => s.id)).toEqual(['dXJuOm1ieHBvaTox'])
  })

  it('survives junk', () => {
    expect(parseSuggestions(null)).toEqual([])
    expect(parseSuggestions({ suggestions: 'nope' })).toEqual([])
    expect(parseSuggestions({})).toEqual([])
  })
})

describe('parseRetrieved', () => {
  const feature = (over: Record<string, unknown> = {}) => ({
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-75.9767, 36.8466] },
        properties: {
          name: 'First Street Jetty',
          mapbox_id: 'dXJuOm1ieHBvaTox',
          place_formatted: 'Virginia Beach, Virginia',
          ...over,
        },
      },
    ],
  })

  /* GeoJSON is [lon, lat]. Reversed would put every venue in the wrong hemisphere. */
  it('reads lon lat in that order', () => {
    const hit = parseRetrieved(feature(), 'x')!
    expect(hit.lat).toBeCloseTo(36.8466, 4)
    expect(hit.lon).toBeCloseTo(-75.9767, 4)
  })

  /* The provider id is what stops two saved spots for one place. */
  it('keeps the mapbox id as the place id', () => {
    expect(parseRetrieved(feature(), 'x')!.placeId).toBe('dXJuOm1ieHBvaTox')
    expect(parseRetrieved(feature(), 'x')!.source).toBe('mapbox')
  })

  it('falls back to the suggestion label when the feature has no name', () => {
    const hit = parseRetrieved(feature({ name: undefined }), 'Typed label')!
    expect(hit.label).toContain('Typed label')
  })

  it('refuses a coordinate off the globe rather than placing a pin there', () => {
    const bad = {
      features: [{ geometry: { coordinates: [-999, 91] }, properties: {} }],
    }
    expect(parseRetrieved(bad, 'x')).toBeNull()
  })

  it('survives junk', () => {
    expect(parseRetrieved(null, 'x')).toBeNull()
    expect(parseRetrieved({ features: [] }, 'x')).toBeNull()
    expect(parseRetrieved({ features: [{ geometry: null }] }, 'x')).toBeNull()
  })
})
