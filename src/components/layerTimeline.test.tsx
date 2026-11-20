import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { barSpan, KT_PER_MPS, type WindHour } from '../core/layerTimeline.ts'
import { LayerMarker } from './LayerMarker.tsx'
import { LayerTimeline } from './LayerTimeline.tsx'

/* Batch DRONE, Section 3 (boards Wind_Bar_7, Map_Timeline_Wind, Map_Timeline_Tide): one bar for every layer, one marker. */
const TZ = 'America/New_York'
const NOW = new Date('2026-11-16T16:05:00Z')
const span = barSpan(NOW, TZ)
const SPOT = { lat: 36.8222, lon: -75.9743 }
const noop = () => {}
const hours: WindHour[] = Array.from({ length: span.hours }, (_, i) => ({ mps: (8 + (i % 24 === 14 ? 6 : 0)) / KT_PER_MPS, gustMps: 13 / KT_PER_MPS, fromDeg: 337.5 }))

const wind = (limitMps: number | null) =>
  renderToStaticMarkup(
    <LayerTimeline
      layer="wind"
      span={span}
      at={NOW}
      now={NOW}
      timeZone={TZ}
      lat={SPOT.lat}
      lon={SPOT.lon}
      onAt={noop}
      onHold={noop}
      onPick={noop}
      wind={{ hours, unit: 'kt', limitMps, levelFt: 0, onLevel: noop, model: 'blend', onModel: noop }}
    />,
  )

describe('the timeline bar, wind', () => {
  const html = wind(23 / KT_PER_MPS)
  it('the row: play, the time, now, the layer chips', () => {
    expect(html).toContain('aria-label="Play the wind"')
    expect(html).toMatch(/class="ltl__time"[^>]*>Mon 11:05 AM</)
    expect(html).toContain('<span class="ltl__now">now</span>')
  })
  /* Batch SIMPLE-2, Section 5 (board Wind_Map): Wind · Radar · Clouds as one pill, the one on in white; ⋯ for the height, the model, the tide and Layers off. */
  it('the chips: Wind · Radar · Clouds in that order, Wind on, and ⋯ with the height', () => {
    const chips = [...html.matchAll(/data-layer-pick="(\w+)"[^>]*>(\w+)</g)].map((m) => `${m[1]}:${m[2]}`)
    expect(chips).toEqual(['wind:Wind', 'radar:Radar', 'clouds:Clouds'])
    expect(html).toMatch(/aria-checked="true" class="ltl__chip ltl__chip--on" data-layer-pick="wind"/)
    expect(html.match(/ltl__chip--on/g)?.length).toBe(1)
    expect(html).toMatch(/data-layer-more[^>]*data-level-chip[^>]*aria-label="More: height surface, model Blend, other layers"/)
    /* The menu is closed until ⋯ is tapped: no tide or off in the row. */
    expect(html).not.toContain('data-wind-off')
  })
  it('a day strip Mon to Fri, a slider, the yellow flag on the thumb', () => {
    const days = [...html.matchAll(/class="ltl__day"[^>]*>(\w+)</g)].map((m) => m[1])
    expect(days).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    expect(html).toContain('role="slider"')
    expect(html).toMatch(/data-time-flag[^>]*>11 AM</)
    expect(html).toContain('data-timeline-thumb')
  })
  it('arrows every 6 h, bars by band, gust caps, the drone limit, the daily peaks, the legend', () => {
    expect(html.match(/class="ltl__arrow"/g)?.length).toBe(20)
    expect(html.match(/class="ltl__bar ltl__bar--b1"/g)?.length).toBe(115)
    expect(html.match(/class="ltl__bar ltl__bar--b2"/g)?.length).toBe(5)
    /* No cap where the gust said is under the wind (the 14 kt hours against 13). */
    expect(html.match(/class="ltl__cap"/g)?.length).toBe(115)
    expect(html).toContain('class="ltl__limit"')
    expect(html).toMatch(/data-drone-limit[^>]*>drone limit 23</)
    /* Batch FIX 2.4: the limit's words at the left end take the first two days' "14" (their boxes would touch it on a 350 px bar); the other three stay. */
    expect(html.match(/data-wind-peak/g)?.length).toBe(3)
    expect(html).toContain('arrows = where it blows · bars = wind (kt) · caps = gusts')
  })
  it('no limit line without a drone with a rating, and then every day keeps its peak', () => {
    const h = wind(null)
    expect(h).not.toContain('ltl__limit')
    expect(h).not.toContain('drone limit')
    expect(h.match(/data-wind-peak/g)?.length).toBe(5)
  })
  it('the colours are tokens, never a literal', () => {
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i)
  })
})

describe('the timeline bar, tide', () => {
  const high0 = Date.parse('2026-11-16T13:12:00Z')
  const curve = Array.from({ length: 6 * 24 * 10 }, (_, i) => {
    const t = span.from.getTime() - 12 * 3_600_000 + i * 6 * 60_000
    return { at: new Date(t), feet: 1.75 + 1.25 * Math.cos(((t - high0) / (12.42 * 3_600_000)) * 2 * Math.PI) }
  })
  const extremes = [
    { at: new Date('2026-11-16T13:12:00Z'), feet: 3.0, kind: 'high' as const },
    { at: new Date('2026-11-16T19:24:00Z'), feet: 0.5, kind: 'low' as const },
  ]
  const html = renderToStaticMarkup(<LayerTimeline layer="tide" span={span} at={NOW} now={NOW} timeZone={TZ} lat={SPOT.lat} lon={SPOT.lon} onAt={noop} onHold={noop} onPick={noop} tide={{ curve, extremes, problem: null }} />)
  it('a filled curve, the nights shaded, the day’s high and low under it', () => {
    expect(html).toContain('class="ltl__water"')
    expect(html).toContain('class="ltl__waterline"')
    expect(html.match(/class="ltl__night"/g)?.length).toBe(6)
    expect(html).toContain('High 3.0 ft 8:12a · Low 0.5 ft 2:24p · shaded = night')
    /* The tide is under ⋯: none of the three chips is on, and ⋯ has no height (the tide has none). */
    expect(html).not.toContain('ltl__chip--on')
    expect(html).toContain('aria-label="More layers"')
    expect(html).not.toContain('Surface')
  })
  it('says why when there is no curve', () => {
    const h = renderToStaticMarkup(<LayerTimeline layer="tide" span={span} at={NOW} now={NOW} timeZone={TZ} lat={SPOT.lat} lon={SPOT.lon} onAt={noop} onHold={noop} onPick={noop} tide={{ curve: [], extremes: [], problem: 'No tide station near here' }} />)
    expect(h).toContain('No tide station near here')
  })
})

describe('the timeline bar, clouds', () => {
  it('the same bar with a % band', () => {
    const html = renderToStaticMarkup(<LayerTimeline layer="clouds" span={span} at={new Date(NOW.getTime() + 3 * 3_600_000)} now={NOW} timeZone={TZ} lat={SPOT.lat} lon={SPOT.lon} onAt={noop} onHold={noop} onPick={noop} percent={Array.from({ length: 120 }, (_, i) => (i % 3 === 0 ? null : 40))} />)
    expect(html.match(/class="ltl__pct"/g)?.length).toBe(80)
    expect(html).toContain('bars = cloud cover %')
    /* Away from now: "now" is a button back to it, 44 px (timeline.css). */
    expect(html).toContain('aria-label="Back to now"')
  })
})

describe('the one marker', () => {
  it('a ring at the point and its readout beside it', () => {
    const html = renderToStaticMarkup(<LayerMarker map={null} at={SPOT} lines={['9 kt NNW · g13', 'swell 0.7 ft 12 s ENE', 'KNTU 13 kt N · 1 h ago']} layer="wind" atSpot />)
    expect(html).toContain('data-layer-marker="wind"')
    expect(html).toContain('data-marker-readout="wind"')
    expect(html).toContain('<p class="lmark__line lmark__line--value">9 kt NNW · g13</p>')
    expect(html).toContain('lmark__line--second">swell 0.7 ft 12 s ENE')
    expect(html).toContain('lmark__line--third">KNTU 13 kt N · 1 h ago')
  })
  it('nothing without a point', () => {
    expect(renderToStaticMarkup(<LayerMarker map={null} at={null} lines={['x']} layer="tide" atSpot={false} />)).toBe('')
  })
})
