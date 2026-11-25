import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { moonNightTab } from '../core/moonNights.ts'
import { skyPicture } from '../core/skyPicture.ts'
import { formatClock, setClockHours } from '../core/timezone.ts'
import { SkyNightMoments, SkyNightStrip } from './SkyNightTab.tsx'
import { SkyPicture } from './SkyPicture.tsx'

/*
 * Batch SIMPLE-2, Section 4: Sky › Night's pictures and Tonight's drawn sky,
 * rendered. Chic's Beach, Thu 19 Nov 2026, 8 PM EST: full moon Tue 24 Nov
 * (USNO, measurements/2026-11-19-moon-fixture.md).
 */
const TZ = 'America/New_York'
const NOW = new Date('2026-11-20T01:00:00Z')
const night = moonNightTab(NOW, 36.92, -76.1, TZ)
const clock = (d: Date) => formatClock(d, TZ)
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
setClockHours(12)

describe('Sky › Night', () => {
  it('fourteen nights from tonight, FULL on the 24th', () => {
    const html = renderToStaticMarkup(<SkyNightStrip night={night} />)
    expect((html.match(/<li class="snight__day/g) ?? []).length).toBe(14)
    expect(html).toMatch(/data-mark="full"[^>]*>[\s\S]*?24<\/span><span class="snight__mark">FULL/)
    expect(text(html).startsWith('Next 2 weeks Thu')).toBe(true)
  })

  it('the moments, soonest first, each with Plan › that hands back its time', () => {
    const planned: Date[] = []
    const html = renderToStaticMarkup(<SkyNightMoments night={night} clock={clock} onPlan={(at) => planned.push(at)} />)
    const t = text(html)
    expect(t).toContain('Moonset at sunrise · TUE 24')
    expect(t).toContain('Big moonrise · TUE 24')
    expect(t.indexOf('Moonset at sunrise')).toBeLessThan(t.indexOf('Big moonrise'))
    expect(t).toMatch(/Moonrise 4:3\d PM ENE/)
    expect((html.match(/snight__plan/g) ?? []).length).toBe(2)
  })

  /* Batch SIMPLE-3 (the home moon card's rule, src/core/moonMoment.ts AT_SUN_MINUTES): 24 Nov the moon rises 4:38 PM, 12 min before the 4:50 sunset: "at sunset", as the home says, never "12 min before sunset". */
  it('the big moonrise within 15 minutes of sunset reads "at sunset", the home card\'s words', () => {
    const t = text(renderToStaticMarkup(<SkyNightMoments night={night} clock={clock} />))
    expect(t).toMatch(/Moonrise 4:3\d PM ENE at sunset · 100% lit/)
    expect(t).not.toMatch(/min before sunset/)
  })

  it('no Plan button with nowhere to plan it', () => {
    expect(renderToStaticMarkup(<SkyNightMoments night={night} clock={clock} />)).not.toContain('snight__plan')
  })
})

describe('Tonight’s drawn sky', () => {
  it('is an SVG from the state: the deck, the gap and the sun, no image of any kind', () => {
    const pic = skyPicture({ sunAzDeg: 247, sunAltDeg: -0.8, deck: { baseFt: 5500, lit: true, by: null }, gap: 'open' })
    const html = renderToStaticMarkup(<SkyPicture pic={pic} label="x" />)
    expect(html).toContain('<svg')
    expect(html).toContain('data-deck')
    expect(html).toContain('data-gap')
    expect(text(html)).toContain('deck 5,500 ft · lit from below')
    expect(text(html)).toContain('gap WSW')
    expect(html).not.toMatch(/<img|<image|href=/)
  })
  it('says why there is no picture rather than drawing a guess', () => {
    expect(text(renderToStaticMarkup(<SkyPicture pic={null} label="x" />))).toBe('No sun position for this event, so nothing to draw.')
  })
})
