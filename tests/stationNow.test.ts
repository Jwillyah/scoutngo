import { describe, expect, it } from 'vitest'
import { chipSky, layersWords, parseMetarSky } from '../src/core/metar.ts'
import { nearNow, stationNow } from '../src/lib/useStationNow.ts'

/*
 * THE STATION IS THE TRUTH NEAR NOW (Batch E, Section 3). 1 Nov, 8:45 AM at
 * the pier: scattered low and mid cumulus and thin cloud by the sun, and the
 * chip said 0·1·3. A saved METAR, never the live service.
 */
const SCT = parseMetarSky('KORF 011251Z 02008KT 10SM SCT035 SCT080 BKN250 12/06 A3021')

describe('the station in words and on the chip', () => {
  it('every layer, low to high', () => {
    expect(SCT).not.toBeNull()
    expect(layersWords(SCT!)).toBe('scattered at 3,500 ft, scattered at 8,000 ft, broken at 25,000 ft')
  })
  it('the lowest layer, short', () => {
    expect(chipSky(SCT!)).toBe('SCT 3.5k')
    expect(chipSky(parseMetarSky('KNTU 011255Z 00000KT 10SM CLR 10/05 A3020')!)).toBe('CLR')
    expect(chipSky(parseMetarSky('KNTU 011255Z 00000KT 10SM BKN250 10/05 A3020')!)).toBe('BKN 25k')
  })
})

describe('near now', () => {
  const now = Date.UTC(2026, 10, 1, 12, 45)
  it('within two hours either side, and not beyond', () => {
    expect(nearNow(new Date(now + 2 * 3_600_000), now)).toBe(true)
    expect(nearNow(new Date(now - 90 * 60_000), now)).toBe(true)
    expect(nearNow(new Date(now + 2 * 3_600_000 + 60_000), now)).toBe(false)
    expect(nearNow(null, now)).toBe(false)
  })

  it('asks the nearest station once for a venue, then keeps it ten minutes', async () => {
    let asks = 0
    const fake = (async (input: string | URL | Request) => {
      const u = String(input)
      asks += 1
      if (u.includes('/points/')) return Response.json({ properties: { observationStations: 'https://api.weather.gov/gridpoints/AKQ/1,1/stations' } })
      if (u.endsWith('/stations')) return Response.json({ features: [{ properties: { stationIdentifier: 'KORF' } }] })
      return Response.json({ properties: { rawMessage: 'KORF 011251Z 02008KT 10SM SCT035 12/06 A3021', timestamp: '2026-11-01T12:51:00+00:00' } })
    }) as typeof fetch
    const pier = { lat: 36.8436, lon: -75.9713 }
    const a = await stationNow(pier, now, fake)
    const b = await stationNow(pier, now + 5 * 60_000, fake)
    expect(a?.sky.station).toBe('KORF')
    expect(b?.sky.station).toBe('KORF')
    expect(asks).toBe(3)
  })
})
