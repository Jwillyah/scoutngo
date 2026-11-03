import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseStorms, pwsFor, ripLine, stormsNear, surfZoneFor, tropicsLine, ugcCodes } from '../src/core/coastWx.ts'

const SRF = readFileSync(new URL('./data/coast-2026-11-03/SRFMFL.txt', import.meta.url), 'utf8')

describe('coast and tropics (Batch K, Section 5)', () => {
  it('expands UGC zone lists', () => {
    expect(ugcCodes('FLZ168-172>174-040000-')).toEqual(['FLZ168', 'FLZ172', 'FLZ173', 'FLZ174'])
    expect(ugcCodes('VAZ098-NCZ102-040000-')).toEqual(['VAZ098', 'NCZ102'])
  })
  it('reads the rip current risk for the beach’s zone from a real surf zone forecast (NWS Miami, 3 Nov 2026)', () => {
    const s = surfZoneFor(SRF, 'FLZ168')
    expect(s?.area).toBe('Coastal Palm Beach')
    expect(s?.rip).toBe('High')
    expect(s?.surf).toBe('3 to 5 feet')
    expect(ripLine(s!, 'Miami')).toBe('Rip current risk today high (NWS Miami surf zone forecast)')
  })
  it('a zone the product does not cover is null, not "low"', () => {
    expect(surfZoneFor(SRF, 'VAZ098')).toBeNull()
  })
  it('the line is a fact, never advice', () => {
    expect(ripLine(surfZoneFor(SRF, 'FLZ172')!, 'Miami')).not.toMatch(/swim|stay|avoid|do not|don't/i)
  })
  it('active storms within 1000 km, nearest first', () => {
    const storms = parseStorms({ activeStorms: [
      { name: 'Erin', classification: 'HU', latitudeNumeric: 32.1, longitudeNumeric: -74.0, intensity: '85', movementDir: 0, movementSpeed: '13', windSpeedProbabilities: { url: 'https://www.nhc.noaa.gov/text/MIATCMAT5.shtml' } },
      { name: 'Far', classification: 'TS', latitudeNumeric: 15, longitudeNumeric: -40, intensity: 40 },
    ] })
    const near = stormsNear({ lat: 36.85, lon: -75.98 }, storms)
    expect(near.map((s) => s.name)).toEqual(['Erin'])
    expect(tropicsLine(near[0], 'mi')).toMatch(/^Hurricane Erin 3\d\d mi SSE · moving N 13 kt · 85 kt winds \(NHC\)$/)
  })
  it('wind-speed probabilities for the nearest listed place', () => {
    const pws = [
      'NORFOLK NAS    34  X   2( 2)  10(12)   9(21)   1(22)   X(22)   X(22)',
      'NORFOLK NAS    50  X   X( X)   2( 2)   3( 5)   X( 5)   X( 5)   X( 5)',
      'NORFOLK NAS    64  X   X( X)   X( X)   1( 1)   X( 1)   X( 1)   X( 1)',
      'CAPE HATTERAS  34  X   9( 9)  30(39)   4(43)   X(43)   X(43)   X(43)',
    ].join('\n')
    const p = pwsFor(pws, [{ name: 'NORFOLK NAS', at: { lat: 36.94, lon: -76.29 } }, { name: 'CAPE HATTERAS', at: { lat: 35.25, lon: -75.53 } }], { lat: 36.85, lon: -75.98 })
    expect(p).toEqual({ place: 'NORFOLK NAS', km: expect.any(Number), p34: 22, p50: 5, p64: 1 })
  })
})
