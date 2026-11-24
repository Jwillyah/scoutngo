import { afterEach, describe, expect, it, vi } from 'vitest'
import { briefWindUrl, fetchBriefQuarters, fetchBriefWind } from '../src/lib/tideSheetData.ts'
import { weatherSent } from '../src/lib/weatherStore.ts'
// @ts-expect-error a .mjs script without types
import { fakeAnswer, requestShape } from '../scripts/openMeteoFake.mjs'

/*
 * BATCH SIMPLE-3, SECTIONS 1 AND 1b: the fog and rain nowcasts' numbers ride
 * in the brief's one request (the dew point, the visibility, minutely_15
 * precipitation), the gate's Open-Meteo stand-in answers all of them, and
 * the hours and the quarter hours come from one request, not two.
 */
afterEach(() => vi.unstubAllGlobals())

describe('the brief asks once for the fog and the rain', () => {
  const at = { lat: 36.851, lon: -75.98 }
  it('names the dew point, the visibility and minutely_15 precipitation', () => {
    const u = new URL(briefWindUrl(at))
    expect(u.searchParams.get('hourly')?.split(',')).toEqual(expect.arrayContaining(['dew_point_2m', 'visibility', 'temperature_2m', 'cloud_cover_low', 'cloud_cover_mid', 'precipitation']))
    expect(u.searchParams.get('minutely_15')).toBe('precipitation')
    /* Billed as Open-Meteo bills it: 17 variables over 10 is 1.7 calls. */
    expect(requestShape(u.href).weight).toBeCloseTo(1.7, 5)
  })
  it('one request answers the hours and the quarter hours, from the gate\'s stand-in', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      urls.push(u)
      return new Response(JSON.stringify(fakeAnswer(u, new Date('2026-11-24T04:00:00Z'))), { status: 200 })
    })
    const hours = await fetchBriefWind(at)
    const quarters = await fetchBriefQuarters(at)
    expect(urls).toHaveLength(1)
    expect(weatherSent()).toHaveLength(1)
    expect(hours?.values.dew_point_2m.some((v) => v !== null)).toBe(true)
    expect(hours?.values.visibility.some((v) => v !== null)).toBe(true)
    expect(quarters?.length).toBe(7 * 96)
    expect(quarters?.every((q) => q.mm === 0)).toBe(true)
  })
})
