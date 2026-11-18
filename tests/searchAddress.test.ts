import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { distanceMeters } from '../src/core/geo.ts'
import { addressParts, geoAsk, parseQuery, rankResults, sameHouse, type GeoRow } from '../src/core/spotSearch.ts'
import { markNominatim } from '../src/lib/search.ts'
import { geocodeAddress } from '../src/lib/spotSearchData.ts'
import { insidePolygons, replayFetch, runPicker, type AddressFixture } from './searchAddressRun.ts'

/*
 * Batch SIMPLE-1, Section 2. "Pub, 425 E Pinner St, Suffolk, VA 23434" and
 * "425 E Pinner St, Suffolk" said "Nothing found by that name" though both
 * gazetteers answered with the house. The saved answers here were recorded
 * from Photon and Nominatim by scripts/measure-search-address.mjs --record;
 * each truth is a local government's address point or a published boundary,
 * not OpenStreetMap (measurements/2026-11-18-search-address.md). The search
 * runs through the spot picker's own path (tests/searchAddressRun.ts).
 */
const fixture = JSON.parse(readFileSync(new URL('./fixtures/search-address.json', import.meta.url), 'utf8')) as AddressFixture
const addresses = fixture.cases.filter((c) => c.kind === 'address')
const places = fixture.cases.filter((c) => c.kind === 'place')
const asked: string[] = []
const realFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = replayFetch(fixture.cases, asked)
})
afterAll(() => {
  globalThis.fetch = realFetch
})

/** Run one saved query; the Nominatim clock starts clear, so a query waits only on its own requests. */
async function run(query: string) {
  markNominatim(0)
  asked.length = 0
  const got = await runPicker(query)
  return { ...got, asked: [...asked] }
}

describe('the saved run (a check that looked at something)', () => {
  it('holds ten or more addresses across the five towns, five place names, and both strings from the report', () => {
    expect(addresses.length).toBeGreaterThanOrEqual(10)
    expect(places.length).toBe(5)
    const towns = ['Virginia Beach', 'Suffolk', 'Norfolk', 'Wilmington', 'Salisbury']
    for (const t of towns) expect(addresses.filter((c) => c.query.includes(t)).length, t).toBeGreaterThanOrEqual(2)
    const queries = fixture.cases.map((c) => c.query)
    expect(queries).toContain('Pub, 425 E Pinner St, Suffolk, VA 23434')
    expect(queries).toContain('425 E Pinner St, Suffolk')
    for (const c of addresses) expect(c.truth.at, c.query).toBeDefined()
    for (const c of places) expect(c.truth.polygons?.length ?? 0, c.query).toBeGreaterThan(0)
  })
})

describe('addresses: the right house first', () => {
  for (const c of addresses) {
    it(`"${c.query}" within ${fixture.toleranceMeters} m of ${c.truth.source}`, async () => {
      const got = await run(c.query)
      expect(got.status).toBe('ok')
      expect(got.asked.length).toBeGreaterThan(0)
      const top = got.results[0]
      expect(top, 'a first result').toBeDefined()
      expect(top.group).toBe('address')
      expect(distanceMeters(top.at, c.truth.at!)).toBeLessThanOrEqual(fixture.toleranceMeters)
    })
  }

  it('the two strings from the report find 425 E Pinner St, the pub by its name', async () => {
    const pub = await run('Pub, 425 E Pinner St, Suffolk, VA 23434')
    expect(pub.results[0].name).toBe("Derl'z Restaurant & Pub")
    expect(pub.results[0].where).toBe('425 Pinner Street, Suffolk')
    const bare = await run('425 E Pinner St, Suffolk')
    expect(bare.results[0].name).toBe('425 Pinner Street')
    expect(bare.results[0].where).toBe('Suffolk, VA')
    /* The building and the pub in it are one pin: one address row. */
    expect(bare.results.filter((r) => r.group === 'address')).toHaveLength(1)
    /* Photon first, and it had the house: nothing else was asked. */
    expect(bare.asked).toEqual(['https://photon.komoot.io/api/?q=425+E+Pinner+St%2C+Suffolk&limit=20'])
  })

  it('a name in front that finds nothing is dropped: Photon, Nominatim, then both again without it', async () => {
    const got = await run('Blue Heron Coffee Roasters, 102 N 3rd St, Wilmington, NC')
    expect(got.asked.map((u) => `${new URL(u).hostname} ${new URL(u).searchParams.get('q')}`)).toEqual([
      'photon.komoot.io Blue Heron Coffee Roasters, 102 N 3rd St, Wilmington, NC',
      'nominatim.openstreetmap.org Blue Heron Coffee Roasters, 102 N 3rd St, Wilmington, NC',
      'photon.komoot.io 102 N 3rd St, Wilmington, NC',
      'nominatim.openstreetmap.org 102 N 3rd St, Wilmington, NC',
    ])
    expect(got.results[0].name).toBe('102 North 3rd Street')
  })

  it('only the typed words leave: no position, box or bias on any request', async () => {
    let looked = 0
    for (const c of fixture.cases) {
      const got = await run(c.query)
      for (const u of got.asked) {
        const url = new URL(u)
        looked += 1
        expect(['photon.komoot.io', 'nominatim.openstreetmap.org']).toContain(url.hostname)
        for (const p of ['lat', 'lon', 'viewbox', 'bounded', 'bbox', 'location_bias_scale', 'zoom']) expect(url.searchParams.has(p), `${p} in ${u}`).toBe(false)
        const q = url.searchParams.get('q') ?? ''
        /* Every word sent was typed (case and punctuation aside). */
        const typed = new Set(c.query.toLowerCase().split(/[^a-z0-9']+/))
        for (const w of q.toLowerCase().split(/[^a-z0-9']+/).filter((x) => x !== '')) expect(typed.has(w), `"${w}" in ${u}`).toBe(true)
      }
    }
    expect(looked).toBeGreaterThanOrEqual(fixture.cases.length)
  })
})

describe('place names: inside the place first', () => {
  for (const c of places) {
    it(`"${c.query}" inside ${c.truth.source}`, async () => {
      const got = await run(c.query)
      const top = got.results[0]
      expect(top, 'a first result').toBeDefined()
      expect(insidePolygons(top.at, c.truth.polygons!)).toBe(true)
    })
  }
})

describe('what is an address', () => {
  it('a house number and a street, a name before it dropped for the second try', () => {
    expect(addressParts('Pub, 425 E Pinner St, Suffolk, VA 23434')).toEqual({ full: 'Pub, 425 E Pinner St, Suffolk, VA 23434', bare: '425 E Pinner St, Suffolk, VA 23434', number: '425', street: ['pinner'] })
    expect(addressParts('425  E Pinner St ,Suffolk')).toEqual({ full: '425 E Pinner St, Suffolk', bare: null, number: '425', street: ['pinner'] })
    expect(addressParts('102 N 3rd St')?.street).toEqual(['3rd'])
    expect(addressParts('2 Mile Beach, NC')?.number).toBe('2')
  })

  it('names with a number in them are not addresses', () => {
    for (const q of ['first st outer banks', '1st St', '7 Eleven', '17th Street Park', '2 Mile Beach', 'Virginia Beach', 'Pub']) expect(addressParts(q), q).toBeNull()
  })

  it('the same house: its number and a street word in common', () => {
    const a = addressParts('425 E Pinner St, Suffolk')!
    expect(sameHouse(a, '425', 'East Pinner Street')).toBe(true)
    expect(sameHouse(a, '425', 'Pinner Street')).toBe(true)
    expect(sameHouse(a, '427', 'East Pinner Street')).toBe(false)
    expect(sameHouse(a, '425', 'Washington Street')).toBe(false)
  })

  it('a spot of ours that matches keeps the search by words', () => {
    expect(geoAsk('425 E Pinner St, Suffolk', false)?.kind).toBe('address')
    expect(geoAsk('425 E Pinner St, Suffolk', true)).toEqual({ kind: 'words', text: '425 e pinner st suffolk' })
    expect(geoAsk('wrightsville beach', false)).toEqual({ kind: 'words', text: 'wrightsville beach' })
  })
})

describe('the ranking', () => {
  const row = (id: string, name: string, osmKey: string, osmValue: string, lat = 36.905, lon = -76.2): GeoRow => ({ id, name, where: 'Norfolk, Virginia', at: { lat, lon }, osmKey, osmValue })

  it('a garden named by every word is a place; a road with the words is not', () => {
    const q = parseQuery('norfolk botanical garden')
    const got = rankResults(q, [], [row('g', 'Norfolk Botanical Garden', 'leisure', 'garden'), row('r', 'Botanical Garden Norfolk Road', 'highway', 'residential', 36.9, -76.21)], null)
    expect(got.map((r) => [r.name, r.group])).toEqual([['Norfolk Botanical Garden', 'place']])
  })

  it('addresses first, and the same building said again by the words search is dropped', () => {
    const house: GeoRow = { id: 'h', name: '425 Pinner Street', where: 'Suffolk, VA', at: { lat: 36.736712, lon: -76.5699301 }, osmKey: 'building', osmValue: 'yes' }
    const pub: GeoRow = { id: 'p', name: "Derl'z Restaurant & Pub", where: 'Suffolk, Virginia', at: { lat: 36.736712, lon: -76.56993 }, osmKey: 'amenity', osmValue: 'restaurant' }
    const got = rankResults(parseQuery("derl'z pub"), [], [pub], null, [house])
    expect(got.map((r) => r.id)).toEqual(['h'])
  })
})

describe('when the services do not answer', () => {
  it('says it failed, not that nothing was found', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new TypeError('offline')
    }) as typeof fetch
    try {
      markNominatim(0)
      const a = addressParts('425 E Pinner St, Suffolk')!
      expect(await geocodeAddress(a, '425 e pinner st suffolk')).toEqual({ status: 'failed' })
    } finally {
      globalThis.fetch = saved
    }
  })
})
