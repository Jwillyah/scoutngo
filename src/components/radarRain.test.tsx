import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HOUR_MS, RAIN_AHEAD_H, RAIN_PAST_H, rainSpan } from '../core/layerTimeline.ts'
import { hoursOnBar } from '../lib/useLayerHours.ts'
import { RadarLegend } from './WeatherLayerCard.tsx'

/*
 * Batch FIX, Section 2.5: radar on the bar. Under the radar's own frames, the
 * chance of rain at the spot by the hour, the past 2 h and the next 24, from
 * the briefing's answer (precipitation_probability) the app already asks.
 */
const NOW = new Date('2026-11-17T12:05:00Z')

describe("radar's rain strip", () => {
  it('spans the past 2 h and the next 24, from the hour, with now along it', () => {
    const { span, nowX } = rainSpan(NOW)
    expect(span.from.toISOString()).toBe('2026-11-17T10:00:00.000Z')
    expect(span.hours).toBe(RAIN_PAST_H + RAIN_AHEAD_H)
    expect(nowX).toBeCloseTo((2 * 60 + 5) / (26 * 60))
  })

  it('a bar for each hour the forecast said, none where it did not, never a zero for a gap', () => {
    const { span, nowX } = rainSpan(NOW)
    /* The briefing's hours from midnight GMT; 40% from 11:00, nothing said at 13:00. */
    const times = Array.from({ length: 48 }, (_, i) => Date.parse('2026-11-17T00:00:00Z') + i * HOUR_MS)
    const pp = times.map((t) => (t === Date.parse('2026-11-17T13:00:00Z') ? null : t >= Date.parse('2026-11-17T11:00:00Z') ? 40 : 10))
    const values = hoursOnBar({ times, values: { precipitation_probability: pp } }, 'precipitation_probability', span)
    expect(values.slice(0, 4)).toEqual([10, 40, 40, null])
    const html = renderToStaticMarkup(<RadarLegend scanAt={null} calls={[]} strikes={[]} timeZone="America/New_York" rain={{ values, span, nowX }} />)
    expect(html).toContain('data-rain-band="25"')
    expect(html).toContain('Rain up to 40%')
    expect(html).toContain('class="wlay__rainnow"')
    expect(html).not.toMatch(/safe|clear/i)
  })

  it('says so when the forecast said nothing, and shows no strip before the answer', () => {
    const { span, nowX } = rainSpan(NOW)
    const html = renderToStaticMarkup(<RadarLegend scanAt={null} calls={[]} strikes={[]} timeZone="America/New_York" rain={{ values: Array.from({ length: span.hours }, () => null), span, nowX }} />)
    expect(html).toContain('data-rain-band="0"')
    expect(html).toContain('Rain —')
    expect(html).toContain('the forecast did not say')
    expect(renderToStaticMarkup(<RadarLegend scanAt={null} calls={[]} strikes={[]} timeZone="America/New_York" />)).not.toContain('wlay__rain')
  })
})
