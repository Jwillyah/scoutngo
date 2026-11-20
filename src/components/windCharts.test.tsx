import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HOUR_MS, KT_PER_MPS } from '../core/layerTimeline.ts'
import { windGrid } from '../core/windCharts.ts'
import { DEFAULT_UNITS } from '../lib/units.ts'

/* The skeleton is PageShell's portal; on the server the portal is its own node. */
vi.mock('react-dom', async (orig) => ({ ...(await orig<object>()), createPortal: (node: unknown) => node }))
vi.stubGlobal('document', { body: {} })
const { WindCharts, WindGridCard } = await import('./WindCharts.tsx')

/* Batch SIMPLE-2, Section 5 (board Wind_Charts): Wind › Charts in the tap-in skeleton. */
const NY = 'America/New_York'
const hourNow = Math.floor(Date.now() / HOUR_MS) * HOUR_MS
const strip = { from: hourNow - 3 * HOUR_MS, mps: Array.from({ length: 40 }, () => 8 / KT_PER_MPS), gust: Array.from({ length: 40 }, () => 12 / KT_PER_MPS), fromDeg: Array.from({ length: 40 }, () => 22.5) }
const page = (s: typeof strip | null) =>
  renderToStaticMarkup(<WindCharts venue={{ lat: 36.92, lon: -76.1 }} placeName="Chic’s Beach" timeZone={NY} units={DEFAULT_UNITS} ground="day" onBack={() => {}} onMap={() => {}} onMore={() => {}} strip={s} />)

describe('Wind › Charts', () => {
  const html = page(strip)
  it('the skeleton: back, "Wind", "<spot> · now", Map | Charts with Charts on', () => {
    expect(html).toContain('aria-label="Back"')
    expect(html).toContain('>Wind<')
    expect(html).toContain('Chic’s Beach · now')
    const tabs = [...html.matchAll(/role="tab" aria-selected="(\w+)"[^>]*>(\w+)</g)].map((m) => `${m[2]}:${m[1]}`)
    expect(tabs).toEqual(['Map:false', 'Charts:true'])
  })
  it('the 24 h bars are the map layer’s own when it is at the spot: one bar an hour, gust caps, the one wind bar', () => {
    expect(html).toContain('data-wind-chart="map"')
    expect(html).toMatch(/data-wind-bar="24"/)
    expect(html.match(/class="wbar7__cap"/g)?.length).toBe(24)
    expect(html).toContain('next 24 h · caps = gusts')
  })
  it('without the map’s strip it waits for the models (no bar, never a zero bar)', () => {
    const h = page(null)
    expect(h).toContain('data-wind-chart="models"')
    expect(h).toContain('data-hours="0"')
    expect(h).toContain('The wind forecast has not said yet.')
  })
  it('the by-height card, then the rows Station and Models, then More details', () => {
    const grid = html.indexOf('wcharts__grid')
    const rows = html.indexOf('tipage__rows')
    expect(html.indexOf('wcharts__bars')).toBeLessThan(grid)
    expect(grid).toBeLessThan(rows)
    const labels = [...html.matchAll(/class="tipage__label">([^<]+)</g)].map((m) => m[1])
    expect(labels).toEqual(['Station', 'Models'])
    expect(html).toContain('More details')
  })
  it('nothing said yet is a dash, never a zero; never "safe" or "clear"', () => {
    expect(html).toMatch(/Station<\/span><span class="tipage__val"><b[^>]*>—</)
    expect(html).not.toMatch(/\b0 kt\b/)
    expect(html).not.toMatch(/\bsafe\b|\bclear\b/i)
  })
  it('the foot: How we got this and the safety line', () => {
    expect(html).toContain('How we got this')
    expect(html).toContain('Forecasts can be wrong · look first')
  })
})

describe('the by-height grid', () => {
  const times = Array.from({ length: 20 }, (_, k) => new Date(hourNow + k * HOUR_MS))
  const g = windGrid(times, times.map(() => ({ median: 6 / KT_PER_MPS, from: 0, gust: null })), times.map(() => ({ median: 20 / KT_PER_MPS, from: 0, gust: null })), new Date(hourNow + 10 * 60_000))
  const html = renderToStaticMarkup(<WindGridCard grid={g} timeZone={NY} unit="kt" />)
  it('four rows, 400 ft to gnd, twelve cells each, in the bars’ band colours', () => {
    expect([...html.matchAll(/class="wcharts__rowk" role="rowheader">([^<]+)</g)].map((m) => m[1])).toEqual(['400 ft', '200', '100', 'gnd'])
    expect(html.match(/role="cell"/g)?.length).toBe(48)
    expect(html.match(/wcharts__cell--b0/g)?.length).toBe(12)
    expect(html.match(/wcharts__cell--b3/g)?.length).toBe(12)
  })
  it('the first column is now', () => {
    expect(html).toMatch(/role="columnheader">now</)
  })
  it('no models yet: says so', () => {
    expect(renderToStaticMarkup(<WindGridCard grid={null} timeZone={NY} unit="kt" />)).toContain('The models have not said yet.')
  })
})
