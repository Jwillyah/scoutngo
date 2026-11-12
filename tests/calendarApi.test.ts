import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../api/calendar.ts'

/*
 * THE CALENDAR FEED, END TO END (Batch H, Section 4): the function, with
 * Open-Meteo answered by the 2 Nov sunrise kept in tests/data. It refuses a
 * fine coordinate, asks with rounded points only, and returns an .ics.
 */
const FIRE = JSON.parse(readFileSync('tests/data/sky-fire-2026-11-02-sunrise.json', 'utf8')) as { payload: unknown }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('api/calendar', () => {
  it('refuses a coordinate finer than two decimals', async () => {
    const r = await GET(new Request('http://x/api/calendar?lat=36.8435575&lon=-75.9713104'))
    expect(r.status).toBe(400)
  })

  it('answers a calendar, asking Open-Meteo with rounded points only', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'))
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      return new Response(JSON.stringify(FIRE.payload), { status: 200 })
    })
    const r = await GET(new Request('http://x/api/calendar?lat=36.84&lon=-75.97'))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toMatch(/text\/calendar/)
    const ics = await r.text()
    expect(ics).toMatch(/^BEGIN:VCALENDAR/)
    expect(ics).toContain('SUMMARY:Sunrise Maybe')
    expect(ics).not.toContain('SUMMARY:Sunrise Go')
    /* Open-Meteo gets rounded points; the stations (asked in the three hours before, Batch TRUTH) get ids only. */
    for (const u of asked.filter((x) => x.includes('open-meteo'))) {
      for (const v of (new URL(u).searchParams.get('latitude') ?? '').split(',')) expect(v).toMatch(/^-?\d+\.\d{2}$/)
    }
    for (const u of asked.filter((x) => !x.includes('open-meteo'))) expect(u).not.toMatch(/36\.8|75\.9|lat|lon|bbox/)
  })
})
