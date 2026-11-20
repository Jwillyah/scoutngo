import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PreflightRow } from '../core/dronePreflight.ts'
import { preflightHeadline, preflightTapRows } from '../lib/dronePreflightRows.ts'
import { WEATHER_PAGE_OLD_FIRST, DRONE_PAGE_OLD_LAYOUT } from '../config/flags.ts'

vi.mock('react-dom', async (orig) => ({ ...(await orig<object>()), createPortal: (node: unknown) => node }))
vi.stubGlobal('document', { body: {} })
const { TapInPage } = await import('./TapInPage.tsx')
const { WeatherChart } = await import('./WeatherChart.tsx')

/* Batch SIMPLE-2, Section 4: Weather and Drone Preflight as the tap-in skeleton. */
const PF: PreflightRow[] = [
  ['airspace', 'amber', 'Class C · ceiling 100 ft · LAANC needed'],
  ['wind', 'green', '8 kt against your 23 kt limit'],
  ['gusts', 'green', '12 kt against your 23 kt limit'],
  ['battery', 'green', '~37 min · 40 min rated · 46°F'],
  ['sunset', 'green', 'Sunset 4:52 PM · 3 h 1 min away'],
  ['tfr', 'green', '0 TFRs within 20 mi'],
  ['remoteid', 'amber', 'Broadcast needed here'],
  ['kp', 'green', 'Kp 2 · quiet'],
].map(([key, tone, line]) => ({ key, label: key, tone, line }) as PreflightRow)
const TABS = [{ id: 'preflight', label: 'Preflight' }, { id: 'wind', label: 'Wind' }, { id: 'airspace', label: 'Airspace' }]
const drone = (tab: string, extra: Partial<Parameters<typeof TapInPage>[0]> = {}) =>
  renderToStaticMarkup(
    <TapInPage
      title="Drone"
      spot="Chic’s Beach · Air 3S"
      ground="day"
      kind="drpage"
      onBack={() => {}}
      how={<p>how</p>}
      safety={tab === 'airspace' ? null : 'Not official FAA · check LAANC'}
      tabs={TABS}
      initialTab="preflight"
      tab={tab}
      maxRows={8}
      {...(tab === 'preflight' ? { hero: preflightHeadline(PF), rows: preflightTapRows(PF, () => {}) } : {})}
      actions={tab === 'preflight' ? [{ label: 'Get LAANC', onClick: () => {}, href: 'https://www.faa.gov/uas/getting_started/laanc', primary: true }, { label: 'Plan a shoot', onClick: () => {} }] : []}
      {...extra}
    />,
  )

describe('Drone Preflight on the skeleton', () => {
  it('opens on Preflight: tabs Preflight · Wind · Airspace, "2 to check", eight rows', () => {
    const h = drone('preflight')
    expect([...h.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Preflight', 'Wind', 'Airspace'])
    expect(h).toMatch(/role="tab" aria-selected="true"[^>]*>Preflight</)
    expect(h).toContain('2 to check')
    expect(h).toContain('Airspace · Remote ID need a look')
    expect((h.match(/class="tipage__row/g) ?? []).length).toBe(8)
    expect((h.match(/tipage__dot--caution/g) ?? []).length).toBe(2)
    expect((h.match(/tipage__dot--good/g) ?? []).length).toBe(6)
  })
  it('Airspace and Wind rows are buttons that open their tab', () => {
    const h = drone('preflight')
    expect((h.match(/tipage__row tipage__row--tap/g) ?? []).length).toBe(2)
    expect(h).toMatch(/<button[^>]*tipage__row--tap[^>]*>.*?Airspace.*?›/)
  })
  it('"Get LAANC ›" is the FAA link in a new tab, "Plan a shoot ›" a button', () => {
    const h = drone('preflight')
    expect(h).toMatch(/<a class="tipage__btn tipage__btn--primary" href="https:\/\/www\.faa\.gov\/uas\/getting_started\/laanc" target="_blank" rel="noopener noreferrer">Get LAANC ›/)
    expect(h).toMatch(/<button type="button" class="tipage__btn">Plan a shoot ›/)
  })
  it('the foot says "Not official FAA · check LAANC"; the Airspace tab has none, and no hero, rows or buttons', () => {
    expect(drone('preflight')).toContain('Not official FAA · check LAANC')
    const a = drone('airspace')
    expect(a).not.toContain('Not official FAA')
    expect(a).not.toContain('tipage__hero')
    expect(a).not.toContain('tipage__rows')
    expect(a).not.toContain('tipage__btn')
  })
  it('no word says safe, clear, legal or go', () => {
    expect(drone('preflight').replace(/<[^>]+>/g, ' ')).not.toMatch(/\b(safe|clear|legal)\b/i)
  })
  it('the Labs row rides under the buttons through `after`', () => {
    expect(drone('preflight', { after: <div className="drp__labsrow">Plan the flight</div> })).toMatch(/tipage__actions.*drp__labsrow/s)
  })
})

describe('the Weather chart card', () => {
  const hours = Array.from({ length: 19 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 19, 21 + i)), tempC: 14 - Math.sin(i / 3) * 4, rain: i === 4 ? 0.3 : null }))
  it('one line, one rain bar, the axis from now', () => {
    const h = renderToStaticMarkup(<WeatherChart hours={hours} timeZone="America/New_York" />)
    expect((h.match(/wchart__line/g) ?? []).length).toBe(1)
    expect((h.match(/wchart__bar/g) ?? []).length).toBe(1)
    expect(h).toContain('>now<')
    expect(h).toContain('next 18 h · rain bars')
  })
  it('with no temperature it says so, rather than drawing a flat line', () => {
    const h = renderToStaticMarkup(<WeatherChart hours={hours.map((x) => ({ ...x, tempC: null }))} timeZone="UTC" />)
    expect(h).not.toContain('wchart__line')
    expect(h).toContain('did not give the temperatures')
  })
})

describe('the flags', () => {
  it('the old pages stay behind flags, off', () => {
    expect(WEATHER_PAGE_OLD_FIRST).toBe(false)
    expect(DRONE_PAGE_OLD_LAYOUT).toBe(false)
  })
})
