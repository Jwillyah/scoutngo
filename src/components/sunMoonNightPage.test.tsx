import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { setClockHours } from '../core/timezone.ts'
import { MiniCompass, MoonView, NightView, SunView } from './SunMoonNightPage.tsx'

const VB = { lat: 36.85, lon: -75.98 }
const TZ = 'America/New_York'
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
/* 16 Nov 2026, 4:58 PM EST, five minutes after sunset; and 10:30 PM. */
const DUSK = new Date('2026-11-16T21:58:00Z')
const LATE = new Date('2026-11-17T03:30:00Z')
setClockHours(12)

describe('Sun · Moon · Night, drawn', () => {
  it('Sun: the light now, tonight’s edges in order, the Milky Way line and the next sunrise', () => {
    const html = renderToStaticMarkup(<SunView venue={VB} timeZone={TZ} now={DUSK} sunsetCall="color possible" sunriseCall={null} />)
    const t = text(html)
    expect(t).toContain('Afterglow')
    expect(t).toContain('15 min left · sunrise 6:44 AM in the ESE')
    expect(t).toContain('Sun 1° down')
    expect(t).toContain('color possible')
    expect(t.indexOf('4:17 PM Golden light')).toBeLessThan(t.indexOf('4:53 PM Sunset'))
    expect(t.indexOf('4:53 PM Sunset')).toBeLessThan(t.indexOf('5:13 PM Blue hour'))
    expect(t).toContain('5:24 PM Dark')
    expect(t).toMatch(/Milky Way: (not tonight|\d)/)
    expect(t).toContain('Sunrise 6:44 AM · ESE')
    expect(html).toContain('smn__row--now')
    expect(html).toContain('smn__strip')
  })

  it('Moon: up now, its set, the fortnight, the darkest nights and the next big moonrise with Plan', () => {
    let planned = 0
    const html = renderToStaticMarkup(<MoonView venue={VB} timeZone={TZ} now={DUSK} onPlanMoonrise={() => (planned += 1)} />)
    const t = text(html)
    expect(t).toContain('Up now')
    expect(t).toContain('Sets 11:08 PM')
    expect(t).toContain('Highest')
    expect((html.match(/smn__phaseday/g) ?? []).length).toBe(14)
    expect(t).toContain('Darkest nights Dec 4–12')
    expect(t).toContain('Tue 24 Nov · full moon')
    expect(html).toContain('smn__plan')
    expect(planned).toBe(0)
  })

  it('Moon: no Plan button with nowhere to plan it', () => {
    expect(renderToStaticMarkup(<MoonView venue={VB} timeZone={TZ} now={DUSK} />)).not.toContain('smn__plan')
  })

  it('Night: the moon now, the facts, the next shower', () => {
    const t = text(renderToStaticMarkup(<NightView venue={VB} timeZone={TZ} now={LATE} />))
    expect(t).toContain('Now · 10:30 PM')
    expect(t).toMatch(/Moon up, \d+%/)
    expect(t).toContain('Next Moonset 11:08 PM')
    expect(t).toContain('Milky Way no, not tonight')
    expect(t).toContain('Darkest 11:08 PM–5:14 AM, moon down')
    expect(t).toMatch(/North Star N, 3\d° up/)
    expect(t).toContain('Leonids')
    expect(t).toContain('Next golden: 6:44 AM')
  })

  it('never says clear or safe, on any tab', () => {
    for (const now of [DUSK, LATE]) {
      const all = [
        renderToStaticMarkup(<SunView venue={VB} timeZone={TZ} now={now} sunsetCall={null} sunriseCall={null} />),
        renderToStaticMarkup(<MoonView venue={VB} timeZone={TZ} now={now} />),
        renderToStaticMarkup(<NightView venue={VB} timeZone={TZ} now={now} />),
      ].map(text)
      for (const t of all) {
        expect(t.length).toBeGreaterThan(100)
        expect(t).not.toMatch(/\b(clear|safe)\b/i)
      }
    }
  })

  it('the compass needle points along the bearing', () => {
    const html = renderToStaticMarkup(<MiniCompass bearing={90} kind="sun" />)
    expect(html).toContain('x2="23"')
    expect(html).toContain('toward the E')
  })
})
