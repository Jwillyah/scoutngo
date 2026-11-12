import { describe, expect, it } from 'vitest'
import { ASOS_STATIONS } from '../src/data/asosStations.ts'
import { COOPS_MET } from '../src/data/coopsMet.ts'
import { agoWords, freshest, MAX_AGE_MS, nearStations, nearWind, parseCoopsWind, parseMetarReading } from '../src/lib/nearWind.ts'

/*
 * THE WIND AT THE STATIONS NEAR THE SPOT (Batch TRUTH, Section 3). 12 Nov 7:24 AM at
 * the Virginia Beach pier: the Wind page said "Station KNTU 3 kt S · 5:56 AM",
 * 88 minutes old (fixtures/truth/2026-11-12-vb.json), while weather.gov's
 * "latest" ran an hour behind aviationweather.gov's.
 */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const NOW = new Date('2026-11-12T12:24:00Z')

describe('the nearest three, airports and NOAA\'s coastal stations alike', () => {
  it('at the pier: KNTU, Cape Henry (CO-OPS 8638999, NDBC CHYV2), KORF', () => {
    const near = nearStations(PIER, ASOS_STATIONS, COOPS_MET)
    expect(near.map((s) => s.label)).toEqual(['KNTU', 'Cape Henry', 'KORF'])
    expect(near[1]).toMatchObject({ kind: 'coastal', id: '8638999' })
  })
  it('the Bay Bridge Tunnel is CO-OPS 8638901, NDBC CHBV2 (8638863 is its water level, no wind)', () => {
    expect(COOPS_MET.find((s) => s[0] === '8638901')?.[1]).toBe('CHBV2')
    expect(COOPS_MET.find((s) => s[0] === '8638863')).toBeUndefined()
  })
})

describe('the freshest of them, never older than 75 minutes', () => {
  const st = (label: string, km: number) => ({ kind: 'airport' as const, id: label, label, name: label, km })
  it('KNTU 5:56 (10:56Z) at 7:24 is too old; a 7:20 coastal reading wins', () => {
    const kntu = parseMetarReading('KNTU 121056Z 19003KT 10SM SCT120 BKN150 13/12 A2958', st('KNTU', 6), NOW)
    expect(NOW.getTime() - kntu!.at.getTime()).toBeGreaterThan(MAX_AGE_MS)
    const cape = parseCoopsWind({ data: [{ t: '2026-11-12 12:18', s: '7.8', d: '221.0', dr: 'SW', g: '11.3', f: '0,0' }] }, { ...st('Cape Henry', 10.1), kind: 'coastal' })
    expect(freshest([kntu, cape], NOW)?.station.label).toBe('Cape Henry')
    expect(freshest([kntu], NOW)).toBeNull()
    expect(agoWords(cape!.at, NOW)).toBe('6 min ago')
  })
  it('of an airport\'s two sources, the newer report', async () => {
    const fake = async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/stations/KNTU/observations/latest')) return new Response(JSON.stringify({ properties: { rawMessage: 'KNTU 121056Z 19003KT 10SM SCT120 BKN150 13/12 A2958' } }))
      if (u === '/api/metar') return new Response(JSON.stringify({ metar: 'KNTU 121156Z 22004KT 10SM BKN120 13/12 A2957' }))
      if (u.includes('tidesandcurrents')) return new Response(JSON.stringify({ error: { message: 'No data' } }))
      return new Response('{}', { status: 404 })
    }
    const got = await nearWind(PIER, NOW, fake as typeof fetch)
    expect(got.best?.station.label).toBe('KNTU')
    expect(got.best?.at.toISOString()).toBe('2026-11-12T11:56:00.000Z')
    expect(got.best?.kt).toBe(4)
  })
})

describe('the home drone card says its height (Batch TRUTH, Section 3)', () => {
  it('"at 400 ft" beside the number, so it is not read against the ground wind', async () => {
    const { readFileSync } = await import('node:fs')
    const home = readFileSync('src/components/Home.tsx', 'utf8')
    expect(home).toMatch(/\{speed\(w\.highMps\)\} \{unit\}\s*<span className="hcard__at"> at 400 ft<\/span>/)
  })
  it('the Wind page names the station and its age, and hides a reading older than 75 minutes', async () => {
    const { readFileSync } = await import('node:fs')
    const page = readFileSync('src/components/WindPageV2.tsx', 'utf8')
    expect(page).toContain('<p className="dcard__label dwind__nearlabel">Nearest station</p>')
    expect(page).toMatch(/now\.getTime\(\) - near\.at\.getTime\(\) <= MAX_AGE_MS/)
    expect(MAX_AGE_MS).toBe(75 * 60_000)
  })
})
