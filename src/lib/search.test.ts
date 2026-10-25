import { describe, expect, it, vi } from 'vitest'
import {
  markNominatim,
  MIN_INTERVAL_MS,
  msUntilNominatim,
  parsePhotonFeatures,
  parseReverse,
  parseSearchRows,
  photonUrl,
  PINNED_PLACEHOLDER,
  reverseGeocode,
  reverseUrl,
  searchUrl,
} from './search.ts'

const BIAS = { centre: { lat: 36.85, lon: -75.98 }, halfSpanMeters: 25_000 }

describe('searchUrl', () => {
  it('hits Nominatim with a JSON format and an encoded query', () => {
    const url = searchUrl('Brew River Dock Bar, Salisbury MD')
    expect(url).toContain('https://nominatim.openstreetmap.org/search')
    expect(url).toContain('format=json')
    expect(url).toContain('Brew+River+Dock+Bar%2C+Salisbury+MD')
  })

  /*
   * THE REPORTED BUG. "atlantic park virginia beach" returned one inland
   * neighbourhood and the pin landed on it. Biasing to what the user is looking
   * at is the cheap half of the fix.
   */
  it('biases to the current view when one is given', () => {
    const url = searchUrl('atlantic park', BIAS)
    expect(url).toContain('viewbox=')
    // PREFER, not restrict. A bounded search would hide a venue just outside
    // the box, which is worse than ranking it second.
    expect(url).toContain('bounded=0')
  })

  it('asks for nothing extra when there is no view to bias to', () => {
    expect(searchUrl('atlantic park')).not.toContain('viewbox')
  })
})

describe('photonUrl', () => {
  it('is Photon, and carries the query', () => {
    expect(photonUrl('atlantic park')).toContain('https://photon.komoot.io/api/')
    expect(photonUrl('atlantic park')).toContain('q=atlantic+park')
  })

  /* Photon takes a point, not a box, so the bias has to be translated. */
  it('biases with a lat lon point rather than a viewbox', () => {
    const url = photonUrl('atlantic park', BIAS)
    expect(url).toContain('lat=36.85')
    expect(url).toContain('lon=-75.98')
    expect(url).not.toContain('viewbox')
  })
})

describe('parseSearchRows', () => {
  const row = { place_id: 1, display_name: 'Brew River, Salisbury', lat: '38.36', lon: '-75.60' }

  it('reads the rows Nominatim returns, and says where they came from', () => {
    expect(parseSearchRows([row])).toEqual([
      { id: '1', label: 'Brew River, Salisbury', lat: 38.36, lon: -75.6, source: 'osm', kind: 'other' },
    ])
  })

  it('says what kind of place a row is, from its class and type', () => {
    const area = { ...row, class: 'place', type: 'neighbourhood' }
    const venue = { ...row, class: 'amenity', type: 'bar' }
    expect(parseSearchRows([area])[0].kind).toBe('area')
    expect(parseSearchRows([venue])[0].kind).toBe('venue')
  })

  it('drops rows with unusable coordinates', () => {
    expect(parseSearchRows([{ ...row, lat: 'nope' }])).toEqual([])
    expect(parseSearchRows([{ ...row, display_name: 42 }])).toEqual([])
  })

  it('caps the list and survives junk', () => {
    expect(parseSearchRows(Array.from({ length: 20 }, () => row))).toHaveLength(6)
    expect(parseSearchRows(null)).toEqual([])
    expect(parseSearchRows({ error: 'nope' })).toEqual([])
  })
})

/*
 * Photon returns GeoJSON, so the coordinates arrive as [lon, lat] and the label
 * has to be assembled from name plus city. Getting that pair the wrong way round
 * would put every Photon result in the wrong hemisphere.
 */
describe('parsePhotonFeatures', () => {
  const feature = {
    properties: { osm_id: 42, name: 'Atlantic Park Surf', city: 'Virginia Beach', state: 'Virginia' },
    geometry: { type: 'Point', coordinates: [-75.9767, 36.8466] },
  }

  it('reads lon lat in that order, as GeoJSON specifies', () => {
    const [hit] = parsePhotonFeatures({ features: [feature] })
    expect(hit.lat).toBeCloseTo(36.8466, 4)
    expect(hit.lon).toBeCloseTo(-75.9767, 4)
  })

  it('builds a label a person can tell apart from its neighbours', () => {
    const [hit] = parsePhotonFeatures({ features: [feature] })
    expect(hit.label).toContain('Atlantic Park Surf')
    expect(hit.label).toContain('Virginia Beach')
    expect(hit.source).toBe('photon')
  })

  it('drops features with no name or no point', () => {
    expect(
      parsePhotonFeatures({ features: [{ ...feature, properties: { osm_id: 1 } }] }),
    ).toEqual([])
    expect(parsePhotonFeatures({ features: [{ ...feature, geometry: null }] })).toEqual([])
  })

  it('survives junk, because a free service is allowed a bad day', () => {
    expect(parsePhotonFeatures(null)).toEqual([])
    expect(parsePhotonFeatures({ features: 'nope' })).toEqual([])
  })
})

describe('rate limit', () => {
  it('is at least one second, which is their published policy', () => {
    expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1000)
  })
})

describe('reverse geocoding a dropped pin', () => {
  it('asks Nominatim for one point, with address detail', () => {
    const url = reverseUrl({ lat: 38.364236, lon: -75.605912 })
    expect(url).toContain('https://nominatim.openstreetmap.org/reverse')
    expect(url).toContain('lat=38.364236')
    expect(url).toContain('lon=-75.605912')
    expect(url).toContain('addressdetails=1')
  })

  it('names the feature and its town, not the whole address', () => {
    expect(
      parseReverse({
        name: 'Brew River',
        display_name: 'Brew River, 502, West Main Street, Salisbury, Wicomico County, Maryland',
        address: { house_number: '502', road: 'West Main Street', city: 'Salisbury' },
      }),
    ).toBe('Brew River, Salisbury')
  })

  it('falls back to the street address when the spot has no name', () => {
    expect(
      parseReverse({ name: '', address: { house_number: '12', road: 'Dock St', town: 'Oxford' } }),
    ).toBe('12 Dock St, Oxford')
  })

  it('returns null on nothing usable, so the placeholder stands', () => {
    expect(parseReverse(null)).toBeNull()
    expect(parseReverse({ error: 'Unable to geocode' })).toBeNull()
    expect(PINNED_PLACEHOLDER).not.toBe('')
  })

  it('never throws and never hangs, whatever the network does', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('offline')))
    vi.stubGlobal('fetch', fetchMock)
    await expect(reverseGeocode({ lat: 0, lon: 0 })).resolves.toBeNull()
    /* A request that never answers, aborted the way a browser aborts one. */
    vi.stubGlobal(
      'fetch',
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted'))),
        ),
    )
    await expect(reverseGeocode({ lat: 0, lon: 0 }, undefined, 10)).resolves.toBeNull()
    vi.unstubAllGlobals()
  })
})

/* Search and reverse geocoding share one clock, so together they stay under the cap. */
describe('the Nominatim clock', () => {
  it('waits out the remainder of a second after the last request', () => {
    markNominatim(10_000)
    expect(msUntilNominatim(10_000)).toBe(MIN_INTERVAL_MS)
    expect(msUntilNominatim(10_400)).toBe(MIN_INTERVAL_MS - 400)
    expect(msUntilNominatim(11_500)).toBe(0)
  })
})
