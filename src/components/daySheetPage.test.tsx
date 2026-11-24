import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_UNITS } from '../lib/units.ts'
import { drawSheet, pictureHeight, type SheetPicture } from '../lib/daySheetImage.ts'
import { fetchDayForecast } from '../lib/daySheetData.ts'
import { fetchBriefWind } from '../lib/tideSheetData.ts'
import { weatherSent } from '../lib/weatherStore.ts'

vi.mock('react-dom', async (orig) => ({ ...(await orig<object>()), createPortal: (node: unknown) => node }))
vi.stubGlobal('document', { body: {} })
const { DaySheetPage } = await import('./DaySheetPage.tsx')

const HERE = { id: 'here', name: 'Atlantic Park Surf', lat: 36.851, lon: -75.98 }
const NOW = new Date('2026-11-21T14:20:00Z')
const html = (fogAt?: (s: typeof HERE, h: Date) => boolean | null) =>
  renderToStaticMarkup(<DaySheetPage here={HERE} units={DEFAULT_UNITS} onBack={() => {}} onAddPositions={() => {}} fogAt={fogAt} clock={() => NOW} />)

describe('the Day sheet page', () => {
  const h = html()
  it('is titled, with the spot and the day under it', () => {
    expect(h).toContain('>Day sheet<')
    expect(h).toContain('Atlantic Park Surf · Sat, Nov 21')
  })
  it('has the twelve hour rows from first light to last light, the current one marked', () => {
    const hours = [...h.matchAll(/data-hour="([^"]+)"/g)].map((m) => m[1])
    expect(hours).toEqual(['6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p'])
    expect(h.match(/aria-current="time"/g)).toHaveLength(1)
    expect(h).toMatch(/data-hour="9a" aria-current="time"/)
  })
  it('a row the forecast has not answered shows dashes, never zeros', () => {
    expect(h).not.toMatch(/>0%</)
    expect(h).toContain('>—<')
  })
  it('has the strip with a now line, the two buttons, and no fog mark without a fog input', () => {
    expect(h).toContain('data-strip')
    expect(h).toContain('data-now')
    expect(h).toContain('Share as image')
    expect(h).toContain('Add positions ›')
    expect(h).not.toContain('data-fog')
  })
  it('the fog seam: an hour with high risk gets the mark and the line says so', () => {
    const f = html((_s, hour) => hour.getTime() === Date.parse('2026-11-21T12:00:00Z'))
    expect(f).toContain('data-fog')
    expect(f).toContain('Fog risk is high at 7a')
  })
})

describe('the picture', () => {
  const pic: SheetPicture = {
    title: 'Day sheet',
    sub: 'Atlantic Park Surf · Sat, Nov 21',
    head: ['Time', 'Sun', 'Light', 'Cloud', 'Wind kt', 'Rain'],
    rows: [{ cells: ['9a', '20°', 'Side', '60%', '7 ENE', '5%'], current: true, band: 'side' }],
    warning: 'Rain chance 60% at 4p',
    age: 'from 9:12 AM',
  }
  it('is drawn on a canvas on the phone: a background, the title, each row, the warning and the source line', () => {
    const texts: string[] = []
    const ctx = new Proxy({ measureText: () => ({ width: 10 }), fillText: (t: string) => texts.push(t) } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : () => {}),
      set: () => true,
    })
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    drawSheet(ctx as unknown as CanvasRenderingContext2D, pic)
    expect(texts).toContain('Day sheet')
    expect(texts).toContain('Atlantic Park Surf · Sat, Nov 21')
    expect(texts).toContain('7 ENE')
    expect(texts.some((t) => t.startsWith('Rain chance'))).toBe(true)
    expect(texts.some((t) => t.includes('forecast from 9:12 AM'))).toBe(true)
    expect(pictureHeight(pic)).toBeGreaterThan(pictureHeight({ ...pic, warning: null }))
  })
})

describe('the forecast', () => {
  it('is the briefing\'s own request: the same URL, so the shared store answers both', async () => {
    const urls: string[] = []
    const answer = { hourly: { time: ['2026-11-21T14:00'], wind_speed_10m: [4], cloud_cover: [50], precipitation_probability: [10], wind_direction_10m: [40] } }
    vi.stubGlobal('document', { body: {} })
    vi.stubGlobal('fetch', async (u: string) => {
      urls.push(u)
      return new Response(JSON.stringify(answer), { status: 200 })
    })
    const got = await fetchDayForecast({ lat: 36.851, lon: -75.98 })
    expect(got).not.toBeNull()
    expect(got?.fetchedAt).toBeGreaterThan(0)
    const brief = await fetchBriefWind({ lat: 36.851, lon: -75.98 })
    expect(brief).not.toBeNull()
    /* One request served both. */
    expect(weatherSent().length).toBeLessThanOrEqual(1)
    expect(urls.length).toBeLessThanOrEqual(1)
  })
})
