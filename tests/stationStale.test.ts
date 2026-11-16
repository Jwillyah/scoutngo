import { describe, expect, it } from 'vitest'
import { NWS_STALE_MS, stationSky } from '../src/lib/skyFireData.ts'

/*
 * WEATHER.GOV RUNS BEHIND FOR KNTU (Batch CORE, Section 0.1). At 14:47Z on
 * 16 Nov its newest KNTU observation was 12:56Z; aviationweather.gov had
 * 13:56Z. The app took weather.gov's answer however old, so Sky Now said "no
 * station report in the last 75 minutes" with a fresh METAR to be had.
 */
const now = new Date('2026-11-16T14:47:00Z')
const fake = (nwsRaw: string | null, nwsAt: string, metar: string | null) => {
  const asked: string[] = []
  const f = (async (input: RequestInfo | URL) => {
    const u = String(input)
    asked.push(u.includes('weather.gov') ? 'nws' : 'metar')
    if (u.includes('weather.gov')) return Response.json({ properties: { rawMessage: nwsRaw, timestamp: nwsAt } })
    return metar === null ? new Response('', { status: 502 }) : Response.json({ metar })
  }) as typeof fetch
  return { f, asked }
}

describe('a station report weather.gov holds back', () => {
  it('older than 75 minutes: the METAR source is asked, and its newer report kept', async () => {
    const { f, asked } = fake('KNTU 161256Z 03008KT 10SM SCT037 08/02 A3043', '2026-11-16T12:56:00+00:00', 'METAR KNTU 161356Z 03010KT 10SM FEW028 BKN035 09/02 A3046')
    const st = await stationSky('KNTU', f, now)
    expect(asked).toEqual(['nws', 'metar'])
    expect(st?.at).toBe('2026-11-16T13:56:00.000Z')
    expect(st?.sky.groups.map((g) => g.amount)).toEqual(['FEW', 'BKN'])
    /* Batch DRONE, Section 0.1: the screen says who answered ("KNTU 8:56 AM · aviationweather.gov"). */
    expect(st?.via).toBe('aviationweather.gov')
    expect(now.getTime() - Date.parse(st!.at)).toBeLessThanOrEqual(NWS_STALE_MS)
  })
  it('fresh from weather.gov: taken, nothing else asked', async () => {
    const { f, asked } = fake('KNTU 161356Z 03010KT 10SM FEW028 BKN035 09/02 A3046', '2026-11-16T13:56:00+00:00', null)
    const st = await stationSky('KNTU', f, now)
    expect(st?.at).toBe('2026-11-16T13:56:00+00:00')
    expect(st?.via).toBe('weather.gov')
    expect(asked).toEqual(['nws'])
  })
  it('old from weather.gov and the METAR source down: the old one, which the screens then call old', async () => {
    const { f } = fake('KNTU 161256Z 03008KT 10SM SCT037 08/02 A3043', '2026-11-16T12:56:00+00:00', null)
    expect((await stationSky('KNTU', f, now))?.at).toBe('2026-11-16T12:56:00+00:00')
  })
})
