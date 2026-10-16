import { describe, expect, it } from 'vitest'
import { boundsKey, buildQuery, parseOverpass, simplify, trimSummary } from './overpass.ts'

const BOUNDS = { west: -75.6074, south: 38.3614, east: -75.6044, north: 38.3664 }

const way = (tags: Record<string, string>, coords: [number, number][]) => ({
  type: 'way',
  id: 1,
  tags,
  geometry: coords.map(([lon, lat]) => ({ lat, lon })),
})

const SQUARE: [number, number][] = [
  [-75.607, 38.363],
  [-75.604, 38.363],
  [-75.604, 38.3645],
  [-75.607, 38.3645],
  [-75.607, 38.363],
]

describe('buildQuery', () => {
  it('asks for water, buildings, piers, roads and parking in the bbox', () => {
    const query = buildQuery(BOUNDS)
    for (const wanted of [
      '"natural"="water"',
      '"waterway"',
      '"building"',
      '"man_made"="pier"',
      '"highway"',
      '"amenity"="parking"',
    ]) {
      expect(query).toContain(wanted)
    }
    expect(query).toContain('38.3614,-75.6074,38.3664,-75.6044')
    // out geom gives coordinates inline, so no second lookup for nodes.
    expect(query).toContain('out geom;')
  })

  it('carries a server side timeout so a slow query is dropped by Overpass too', () => {
    expect(buildQuery(BOUNDS)).toContain('[timeout:20]')
  })
})

describe('boundsKey', () => {
  it('is stable for the same view', () => {
    expect(boundsKey(BOUNDS)).toBe(boundsKey({ ...BOUNDS }))
  })

  it('rounds, so a tiny nudge still hits the cache', () => {
    expect(boundsKey({ ...BOUNDS, west: BOUNDS.west + 0.000001 })).toBe(boundsKey(BOUNDS))
  })

  it('changes when the view really moves', () => {
    expect(boundsKey({ ...BOUNDS, west: BOUNDS.west - 0.01 })).not.toBe(boundsKey(BOUNDS))
  })
})

describe('parseOverpass', () => {
  it('turns a closed water way into a polygon usable for testing points', () => {
    const { land } = parseOverpass({ elements: [way({ natural: 'water' }, SQUARE)] })
    expect(land.water).toHaveLength(1)
    expect(land.water[0][0]).toHaveLength(5)
  })

  it('gives roads a half width from their class', () => {
    const { land } = parseOverpass({
      elements: [
        way({ highway: 'primary' }, [
          [-75.608, 38.3625],
          [-75.603, 38.3625],
        ]),
        way({ highway: 'service' }, [
          [-75.608, 38.3615],
          [-75.603, 38.3615],
        ]),
      ],
    })
    expect(land.roads[0].halfWidthMeters).toBeGreaterThan(land.roads[1].halfWidthMeters)
  })

  it('does not treat a footpath as a roadway', () => {
    const { land } = parseOverpass({
      elements: [
        way({ highway: 'footway' }, [
          [-75.608, 38.3625],
          [-75.603, 38.3625],
        ]),
      ],
    })
    expect(land.roads).toHaveLength(0)
  })

  it('sorts buildings, piers and parking into the model summary', () => {
    const { summary } = parseOverpass({
      elements: [
        way({ building: 'yes' }, SQUARE),
        way({ man_made: 'pier' }, SQUARE),
        way({ amenity: 'parking' }, SQUARE),
      ],
    })
    expect(summary.buildings).toHaveLength(1)
    expect(summary.piers).toHaveLength(1)
    expect(summary.parking).toHaveLength(1)
  })

  it('survives junk without throwing', () => {
    expect(parseOverpass(null).land.water).toEqual([])
    expect(parseOverpass({ elements: 'nope' }).land.roads).toEqual([])
    expect(parseOverpass({ elements: [{ tags: { building: 'yes' } }] }).summary.buildings).toEqual(
      [],
    )
  })
})

describe('simplify and trimSummary', () => {
  it('thins a long way but keeps its ends', () => {
    const long: [number, number][] = Array.from({ length: 500 }, (_, i) => [-75.6 + i / 1e5, 38.36])
    const thin = simplify(long, 12)
    expect(thin.length).toBeLessThanOrEqual(13)
    expect(thin[0]).toEqual(long[0])
    expect(thin[thin.length - 1]).toEqual(long[long.length - 1])
  })

  it('leaves a short way alone', () => {
    const short: [number, number][] = [
      [-75.6, 38.36],
      [-75.5, 38.36],
    ]
    expect(simplify(short, 12)).toEqual(short)
  })

  it('caps every category so a dense city cannot blow the token budget', () => {
    const many = Array.from({ length: 500 }, () => SQUARE)
    const trimmed = trimSummary({
      water: many,
      buildings: many,
      piers: many,
      roads: many,
      parking: many,
    })
    expect(trimmed.water.length).toBeLessThanOrEqual(40)
    expect(trimmed.buildings.length).toBeLessThanOrEqual(60)
    expect(trimmed.roads.length).toBeLessThanOrEqual(60)
  })
})

/*
 * ITEM 6a: WHAT OSM HAS MAPPED OF THE POWER NETWORK.
 *
 * "This site is full of power lines." Transmission is mapped well; local
 * distribution is patchy, which is why these arrive labelled with their source
 * and why nothing anywhere reads an empty list as an answer about the site.
 */
describe('power lines come back as site marks', () => {
  const payload = {
    elements: [
      {
        type: 'way',
        id: 1,
        tags: { power: 'line' },
        geometry: [
          { lat: 37.0869, lon: -76.4746 },
          { lat: 37.0875, lon: -76.474 },
        ],
      },
      {
        type: 'way',
        id: 2,
        tags: { power: 'minor_line' },
        geometry: [
          { lat: 37.086, lon: -76.475 },
          { lat: 37.0865, lon: -76.4744 },
        ],
      },
      { type: 'node', id: 3, tags: { power: 'pole' }, lat: 37.0866, lon: -76.4748 },
      { type: 'node', id: 4, tags: { power: 'tower', height: '28' }, lat: 37.0872, lon: -76.4742 },
    ],
  }
  const { power } = parseOverpass(payload)

  it('reads both line tags and both node tags', () => {
    expect(power).toHaveLength(4)
    expect(power.map((m) => m.note)).toEqual(['Line', 'Line', 'Pole', 'Tower'])
  })

  it('makes a way into a line and a node into a point', () => {
    expect(power[0].shape.kind).toBe('line')
    expect(power[2].shape.kind).toBe('point')
    if (power[2].shape.kind === 'point') {
      expect(power[2].shape.at).toEqual({ lat: 37.0866, lon: -76.4748 })
    }
  })

  it('labels every one of them as coming from OSM', () => {
    for (const mark of power) {
      expect(mark.source).toBe('osm')
      expect(mark.kind).toBe('power-line')
    }
  })

  /*
   * NO INVENTED HEIGHT. OSM almost never carries one for a line, and a default
   * here would put a made-up number into the sightline geometry that decides
   * whether a position is usable.
   */
  it('leaves the height null unless OSM actually carries one', () => {
    expect(power[0].heightMeters).toBeNull()
    expect(power[1].heightMeters).toBeNull()
    expect(power[2].heightMeters).toBeNull()
    expect(power[3].heightMeters).toBe(28)
  })

  it('asks Overpass for all four tags', () => {
    const query = buildQuery({ west: -76.48, south: 37.08, east: -76.47, north: 37.09 })
    expect(query).toContain('way["power"="line"]')
    expect(query).toContain('way["power"="minor_line"]')
    expect(query).toContain('node["power"="tower"]')
    expect(query).toContain('node["power"="pole"]')
  })

  /* A site with none mapped returns an empty list, which is not a statement. */
  it('returns an empty list when nothing is mapped', () => {
    expect(parseOverpass({ elements: [] }).power).toEqual([])
    expect(parseOverpass(null).power).toEqual([])
  })

  /* And power features never leak into the land geometry a position stands on. */
  it('keeps power out of the landcover', () => {
    const { land, summary } = parseOverpass(payload)
    expect(land.structures).toEqual([])
    expect(land.roads).toEqual([])
    expect(summary.buildings).toEqual([])
  })
})
