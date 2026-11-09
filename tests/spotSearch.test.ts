import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeSameSpots, nearSpots, sameSpot, searchKnownSpots, type KnownSpot } from '../src/core/knownSpots.ts'
import { COAST_CAMS } from '../src/data/coastCams.ts'
import { markNominatim, searchPlacesUs } from '../src/lib/search.ts'

/*
 * E7: "Wrightsville beach" in the spot picker said "Nothing found by that
 * name." The known spots are searched on the phone first, then any US place
 * by the typed text alone, and a geocoder that did not answer is said as
 * that, never as "nothing found".
 *
 * Photon's answers recorded 8 Nov 2026, one request per query, from the shell
 * (tests/data/photon/*.json). Nothing here reaches a live host.
 */
const KNOWN: KnownSpot[] = COAST_CAMS.map((c) => ({ id: c.id, name: c.name, at: c.at, facing: c.facing, state: c.state }))
const PHOTON = (name: string) => JSON.parse(readFileSync(join(__dirname, 'data', 'photon', `${name}.json`), 'utf8')) as unknown

describe('the known spots, by name, on the phone', () => {
  it('finds every spot the bug report named', () => {
    const first = (q: string) => searchKnownSpots(q, KNOWN)[0]
    expect(first('Wrightsville beach')?.name).toBe('Wrightsville Beach')
    expect(first('wrightsville')?.name).toBe('Wrightsville Beach')
    expect(first('Sandbridge')?.name).toMatch(/^Sandbridge/)
    expect(searchKnownSpots('Cape Hatteras', KNOWN).map((s) => s.name)).toContain('Buxton, Cape Hatteras Lighthouse')
    const oc = searchKnownSpots('Ocean City MD', KNOWN)
    expect(oc.length).toBeGreaterThan(0)
    expect(oc.every((s) => s.state === 'MD')).toBe(true)
    expect(first('Huntington Beach')?.name).toMatch(/^Huntington Beach/)
  })

  it('finds nothing for a place it does not know, and nothing for nothing typed', () => {
    expect(searchKnownSpots('Denver', KNOWN)).toEqual([])
    expect(searchKnownSpots('  ', KNOWN)).toEqual([])
  })

  it('shows Sandbridge and Sandbridge Beach as one row, in search and near Virginia Beach', () => {
    const both = KNOWN.filter((s) => /^Sandbridge/.test(s.name))
    expect(both.length).toBeGreaterThanOrEqual(2)
    expect(sameSpot(both[0], both[1])).toBe(true)
    expect(searchKnownSpots('Sandbridge', KNOWN).filter((s) => /^Sandbridge/.test(s.name))).toHaveLength(1)
    const near = nearSpots({ lat: 36.73, lon: -75.95 }, KNOWN)
    expect(near.filter((s) => /^Sandbridge/.test(s.spot.name))).toHaveLength(1)
  })

  it('keeps different breaks on one beach apart, and one name far away apart', () => {
    const c = KNOWN.find((s) => s.name === 'Wrightsville Beach, C Street') as KnownSpot
    const crystal = KNOWN.find((s) => s.name === 'Wrightsville Beach, Crystal Pier') as KnownSpot
    expect(sameSpot(c, crystal)).toBe(false)
    expect(sameSpot({ name: 'Ocean City', at: { lat: 38.36, lon: -75.07 } }, { name: 'Ocean City', at: { lat: 39.28, lon: -74.57 } })).toBe(false)
    expect(mergeSameSpots([{ name: 'Sandbridge', at: { lat: 36.727, lon: -75.94 } }, { name: 'Sandbridge Beach', at: { lat: 36.73, lon: -75.94 } }])).toHaveLength(1)
  })
})

describe('the geocoder fallback', () => {
  const realFetch = globalThis.fetch
  let asked: string[] = []
  const serve = (photon: unknown, nominatim: 'fail' | 'empty' | 'throw') => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      asked.push(href)
      const u = new URL(href)
      if (u.hostname === 'photon.komoot.io') {
        if (photon === 'throw') throw new TypeError('offline')
        return new Response(JSON.stringify(photon), { status: 200 })
      }
      if (u.hostname === 'nominatim.openstreetmap.org') {
        if (nominatim === 'throw') throw new TypeError('offline')
        return nominatim === 'fail' ? new Response('Too Many Requests', { status: 429 }) : new Response('[]', { status: 200 })
      }
      throw new TypeError(`unexpected host ${u.hostname}`)
    }) as typeof fetch
  }
  beforeEach(() => {
    asked = []
    markNominatim(0)
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('finds each place from the recorded answers, even with Nominatim refusing', async () => {
    const cases: [string, string, RegExp][] = [
      ['Wrightsville beach', 'photon-wrightsville-beach', /^Wrightsville Beach, .*North Carolina/],
      ['wrightsville', 'photon-wrightsville', /^Wrightsville, /],
      ['Sandbridge', 'photon-sandbridge', /^Sandbridge/],
      ['Cape Hatteras', 'photon-cape-hatteras', /^Cape Hatteras/],
      ['Ocean City MD', 'photon-ocean-city-md', /^Ocean City, .*Maryland/],
      ['Huntington Beach', 'photon-huntington-beach', /^Huntington Beach/],
    ]
    for (const [q, file, want] of cases) {
      markNominatim(0)
      serve(PHOTON(file), 'fail')
      const r = await searchPlacesUs(q)
      expect(r.status, q).toBe('ok')
      if (r.status !== 'ok') continue
      expect(r.hits.length, q).toBeGreaterThan(0)
      expect(r.hits.some((h) => want.test(h.label)), `${q}: ${r.hits.map((h) => h.label).join(' | ')}`).toBe(true)
    }
    expect(asked.length).toBe(12)
  })

  it('keeps to the US: the Sandbridge in British Columbia is not offered', async () => {
    serve(PHOTON('photon-sandbridge'), 'empty')
    const r = await searchPlacesUs('Sandbridge')
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.hits.some((h) => /British Columbia/.test(h.label))).toBe(false)
  })

  it('sends the typed text and nothing about where you are', async () => {
    serve(PHOTON('photon-wrightsville-beach'), 'empty')
    await searchPlacesUs('Wrightsville beach')
    expect(asked).toHaveLength(2)
    for (const href of asked) {
      const u = new URL(href)
      expect(u.searchParams.get('q')).toBe('Wrightsville beach')
      for (const k of ['lat', 'lon', 'viewbox', 'location_bias_scale', 'bbox']) expect(u.searchParams.has(k), `${u.hostname} ${k}`).toBe(false)
    }
    expect(new URL(asked.find((h) => h.includes('nominatim')) as string).searchParams.get('countrycodes')).toBe('us')
  })

  it('says it could not look when neither answered, which is not "nothing found"', async () => {
    serve('throw', 'throw')
    expect(await searchPlacesUs('Wrightsville beach')).toEqual({ status: 'failed' })
    serve({ type: 'FeatureCollection', features: [] }, 'empty')
    expect(await searchPlacesUs('Qqqzzx')).toEqual({ status: 'ok', hits: [] })
  })

  it('says nothing for a search cancelled by the next keystroke', async () => {
    serve(PHOTON('photon-wrightsville'), 'empty')
    const ctl = new AbortController()
    ctl.abort()
    expect(await searchPlacesUs('wrightsville', ctl.signal)).toEqual({ status: 'aborted' })
  })
})
