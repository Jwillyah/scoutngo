import { describe, expect, it } from 'vitest'
import { groupOf, missing, ownSpots, parseQuery, rankResults, type GeoRow } from '../src/core/spotSearch.ts'

/*
 * Batch Map, Section 2. 9 Nov: "First st outer banks" found "Outer Banks,
 * Meridian Idaho", a restaurant and a hospital. The geocoders' rows here are
 * the shapes Photon and Nominatim answer, written out: nothing is asked.
 */
const ROANOKE = { lat: 36.9, lon: -76.3 } /* about 70 mi from Kill Devil Hills, as on the board */
const row = (id: string, name: string, where: string, lat: number, lon: number, osmKey: string, osmValue: string): GeoRow => ({ id, name, where, at: { lat, lon }, osmKey, osmValue })
const IDAHO = row('a', 'Outer Banks', 'Meridian, Idaho', 43.6, -116.4, 'place', 'neighbourhood')
const RESTAURANT = row('b', 'First Street Grill', 'Kill Devil Hills, North Carolina', 36.03, -75.67, 'amenity', 'restaurant')
const HOSPITAL = row('c', 'Outer Banks Hospital', 'Nags Head, North Carolina', 35.95, -75.63, 'amenity', 'hospital')
const ACCESS = row('d', 'E 1st St beach access', 'Kill Devil Hills, North Carolina', 36.0288, -75.6655, 'highway', 'footway')
const KH_ACCESS = row('e', '1st St, Kitty Hawk', 'Kitty Hawk, North Carolina', 36.07, -75.69, 'natural', 'beach')
const KDH = row('f', 'Kill Devil Hills', 'North Carolina', 36.03, -75.68, 'place', 'town')

const search = (text: string, rows: GeoRow[], from = ROANOKE) => {
  const q = parseQuery(text)
  return rankResults(q, ownSpots(q, from), rows, from)
}

describe('search v2', () => {
  it('"first st outer banks": 1st Street, Kill Devil Hills first; no Idaho, no restaurant, no hospital', () => {
    const q = parseQuery('first st outer banks')
    expect(q.words).toEqual(['1st', 'st'])
    expect(q.region?.name).toBe('Outer Banks')
    expect(q.geocoderText).toBe('first st')
    const got = search('first st outer banks', [IDAHO, RESTAURANT, HOSPITAL, ACCESS, KH_ACCESS])
    expect(got[0].name).toBe('1st Street')
    expect(got[0].where).toBe('Kill Devil Hills, NC')
    /* Batch Beach, Section 1: the coastline's own facing, 61° (measurements/2026-11-10-spot-facing.md); the hand-set 110 read ESE. */
    expect(got[0].note).toBe('faces ENE')
    expect(got.map((r) => r.name)).not.toContain('Outer Banks')
    expect(got.map((r) => r.name)).not.toContain('First Street Grill')
    expect(got.map((r) => r.name)).not.toContain('Outer Banks Hospital')
    /* The beach accesses after the spots: KDH's own access is within 300 m of the spot, so it is the spot. */
    expect(got.filter((r) => r.group === 'beach').map((r) => r.name)).toEqual(['1st St, Kitty Hawk'])
  })

  it('"jennettes" finds Jennette\'s Pier', () => {
    const got = search('jennettes', [])
    expect(got[0]?.name).toBe("Jennette's Pier")
  })

  it('"wrightsville" finds Wrightsville Beach, NC', () => {
    const got = search('wrightsville', [row('g', 'Wrightsville Beach', 'New Hanover County, North Carolina', 34.2085, -77.7964, 'place', 'town')])
    expect(got[0].name).toBe('Wrightsville Beach')
    expect(got[0].where).toBe('Wrightsville Beach, NC')
    expect(got).toHaveLength(1)
  })

  it('"sandbridge" is one result, not the spot and the village twice', () => {
    const got = search('sandbridge', [row('h', 'Sandbridge', 'Virginia Beach, Virginia', 36.7368, -75.9441, 'place', 'village'), row('i', 'Sandbridge Beach', 'Virginia Beach, Virginia', 36.721, -75.926, 'natural', 'beach')])
    expect(got.map((r) => r.name)).toEqual(['Sandbridge'])
  })

  it('shows businesses only when the words look like one', () => {
    expect(search('first street', [RESTAURANT]).some((r) => r.group === 'business')).toBe(false)
    expect(search('first street grill', [RESTAURANT]).map((r) => r.name)).toEqual(['First Street Grill'])
  })

  it('takes typos and either spelling', () => {
    expect(missing(['jenettes'], "Jennette's Pier")).toBe(0)
    expect(missing(parseQuery('avalon peir').words, 'Avalon Pier')).toBe(0)
    expect(missing(parseQuery('first street').words, '1st St')).toBe(0)
    expect(missing(['zzz'], 'Avalon Pier')).toBe(1)
  })

  it('sorts each group nearest first from the current spot, and towns after beaches', () => {
    const got = search('kill devil hills', [KDH, ACCESS])
    expect(got.map((r) => r.group)).toEqual(['town'])
    expect(groupOf({ osmKey: 'man_made', osmValue: 'pier', name: 'x' })).toBe('beach')
    expect(groupOf({ osmKey: 'amenity', osmValue: 'hospital', name: 'x' })).toBe('business')
  })
})
