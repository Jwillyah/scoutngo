import { describe, expect, it } from 'vitest'
import { openCoastFirst, type NearestStation } from '../src/core/tide.ts'

/* Batch MAP2, Section 2: the stations round the Virginia Beach pier as NOAA lists them (9 Nov), nearest first. */
const st = (id: string, name: string, km: number): NearestStation => ({ station: { id, name, at: { lat: 0, lon: 0 } } as NearestStation['station'], distanceKm: km, proximity: 'local' as NearestStation['proximity'] })
const VB = [st('8639207', 'Rudee Inlet, interior channel', 0.9), st('8639168', 'Virginia Beach', 1.0), st('8639214', 'Rudee Heights, Lake Wesley', 2.1), st('8638999', 'Cape Henry', 10.1)]

describe('the tide station on the open coast', () => {
  it('puts the coast station before the inlet\'s interior channel and the lake', () => {
    expect(openCoastFirst(VB).map((c) => c.station.id)).toEqual(['8639168', '8639207', '8639214', '8638999'])
  })
  it('never reaches past the slack for a coast station: a creek spot keeps its creek', () => {
    const creek = [st('1', 'Long Creek', 0.5), st('2', 'Broad Bay Canal', 1.2), st('3', 'Chesapeake Bay Bridge Tunnel', 7.2)]
    expect(openCoastFirst(creek)[0].station.id).toBe('1')
  })
})
