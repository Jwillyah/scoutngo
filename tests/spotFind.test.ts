import { describe, expect, it } from 'vitest'
import { damerau, findLocal, matchName, tokens } from '../src/core/spotFind.ts'
import { localPool, ownSpots, parseQuery, rankResults, type GeoRow } from '../src/core/spotSearch.ts'
import { SEARCH_CASES } from './searchCases.ts'

/*
 * Batch 3D, Section 2. 17 Nov, on the phone: "Chics beach" and "Backdeck"
 * found "Nothing found by that name." Nothing here asks the network.
 */
const top = (text: string, saved: { id: string; name: string; at: { lat: number; lon: number } }[] = []) => ownSpots(parseQuery(text), null, undefined, localPool(saved, []))

describe('local spot search', () => {
  it.each(SEARCH_CASES)('"$query" finds $id first', ({ query, id }) => {
    expect(top(query)[0]?.id).toBe(id)
  })

  it('is deterministic: the same answer every time, in the same order', () => {
    const a = top('beach').map((r) => r.id)
    expect(top('beach').map((r) => r.id)).toEqual(a)
    expect(a.length).toBeGreaterThan(3)
  })

  it('normalises case, apostrophes, spaces, plurals and the ways to say street', () => {
    expect(tokens("Chic's Beach")).toEqual(['chic', 'beach'])
    expect(matchName('CHICS   BEACH', "Chic's Beach")).toBe(0)
    expect(matchName('backdeck', 'The Back Deck')).toBe(0)
    expect(matchName('first street jetty', '1st St Jetty')).toBe(0)
  })

  it('Damerau-Levenshtein: a swapped pair is one edit, two typos are allowed and three are not', () => {
    expect(damerau('peir', 'pier')).toBe(1)
    expect(damerau('croaton', 'croatan')).toBe(1)
    expect(matchName('sandbrdge', 'Sandbridge')).not.toBeNull()
    expect(matchName('sandbxxxdge', 'Sandbridge')).toBeNull()
    expect(matchName('rudee', 'Zzzzz')).toBeNull()
  })

  it('does not call a different place the same: "Back Bay" is not "Back Deck"', () => {
    expect(top('back bay')[0].id).toBe('back-bay')
    expect(top('back bay').map((r) => r.id)).not.toContain('back-deck')
    expect(top('backdeck').map((r) => r.id)).not.toContain('back-bay')
  })

  it('your own saved spot ranks above the same match from our lists', () => {
    const got = top('sandbridge', [{ id: 'mine', name: 'Sandbridge', at: { lat: 36.724, lon: -75.934 } }])
    expect(got[0].id).toBe('saved-mine')
    /* ...and the surf spot and the starter list's Sandbridge are one place, not two. */
    expect(got.filter((r) => r.name === 'Sandbridge')).toHaveLength(1)
  })

  it('finds a map spot already cached on the phone', () => {
    const osm = [{ id: 'osm-1', name: 'Lesner Point Overlook', at: { lat: 36.91, lon: -76.09 }, facing: null, openDeg: 60, water: true, silhouette: null, kind: 'viewpoint' as const }]
    const got = ownSpots(parseQuery('lesner overlok'), null, undefined, localPool([], osm))
    expect(got[0]?.id).toBe('osm-1')
    expect(got[0]?.note).toBe('viewpoint')
  })

  it('ties go to the nearer spot', () => {
    const near = { id: 'a', name: 'Pier A', aliases: [], where: '', at: { lat: 36.84, lon: -75.97 }, note: null, source: 'osm' as const }
    const far = { id: 'b', name: 'Pier B', aliases: [], where: '', at: { lat: 35.9, lon: -75.6 }, note: null, source: 'osm' as const }
    expect(findLocal('pier', [far, near], { lat: 36.85, lon: -75.97 }).map((f) => f.candidate.id)).toEqual(['a', 'b'])
  })
})

describe('businesses on a name search', () => {
  const CAFE: GeoRow = { id: 'c', name: "Chick's Oyster Bar", where: 'Virginia Beach, Virginia', at: { lat: 36.9, lon: -76.12 }, osmKey: 'amenity', osmValue: 'restaurant' }
  const OTHER: GeoRow = { id: 'd', name: 'Sunrise Diner', where: 'Chick Beach Rd, Virginia Beach', at: { lat: 36.9, lon: -76.12 }, osmKey: 'amenity', osmValue: 'restaurant' }
  it('a business whose name matches is returned, below our own spots', () => {
    const q = parseQuery('chicks')
    const got = rankResults(q, ownSpots(q, null, undefined, localPool([], [])), [CAFE, OTHER], null)
    expect(got.map((r) => r.name)).toEqual(["Chick's Beach", "Chick's Oyster Bar"])
    expect(got[1].group).toBe('business')
  })
})
