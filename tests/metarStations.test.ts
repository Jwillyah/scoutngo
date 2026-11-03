import { describe, expect, it } from 'vitest'
import { MAX_STATIONS, stationsOf } from '../api/metar.ts'

/* Batch J, Section 2: the gap watch asks for the stations along the sun's line by id, never a coordinate. */
describe('/api/metar with a station list', () => {
  it('takes valid ids only, each once, at most twelve', () => {
    expect(stationsOf({ stations: ['ksfq', 'KFKN', 'KFKN', 'bad id', 36.9] })).toEqual(['KSFQ', 'KFKN'])
    expect(stationsOf({ stations: Array.from({ length: 20 }, (_, i) => `K${String(i).padStart(3, 'A')}`) })).toHaveLength(MAX_STATIONS)
    expect(stationsOf({ station: 'KNTU' })).toBeNull()
    expect(stationsOf({ stations: [{ lat: 36.9, lon: -76.1 }] })).toBeNull()
  })
})
