import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { barSpan, type WindHour } from '../core/layerTimeline.ts'
import { WindBar } from './WindBar.tsx'

/* Wind_Bar_7: an hour a bar, a white cap on each gust, an arrow every sixth hour, the now marker, the limit. */
const NY = 'America/New_York'
const NOW = new Date('2026-11-19T22:00:00Z')
const span = { ...barSpan(NOW, NY, 1), hours: 24 }
const KT = 1 / 1.9438444924406
const hours = (kts: (number | null)[], gust = 4): WindHour[] => kts.map((k) => ({ mps: k === null ? null : k * KT, gustMps: k === null ? null : (k + gust) * KT, fromDeg: 20 }))
const draw = (h: WindHour[], extra: object = {}) => renderToStaticMarkup(<WindBar hours={h} span={span} timeZone={NY} unit="kt" now={NOW} {...extra} />)

describe('the one wind bar', () => {
  it('draws an hour a bar with a gust cap on each', () => {
    const h = draw(hours(Array.from({ length: 24 }, (_, i) => 6 + (i % 8))))
    expect(h.match(/wbar7__bar /g)).toHaveLength(24)
    expect(h.match(/wbar7__cap/g)).toHaveLength(24)
  })
  it('colours by the map’s bands: under 7 kt, 12 to 17 kt, over 25', () => {
    const h = draw(hours([5, 14, 30, ...Array.from({ length: 21 }, () => 5)]))
    expect(h).toContain('wbar7__bar--b0')
    expect(h).toContain('wbar7__bar--b2')
    expect(h).toContain('wbar7__bar--b4')
  })
  it('an hour the forecast did not say has no bar, not a zero bar', () => {
    const h = draw(hours([8, null, 8, ...Array.from({ length: 21 }, () => 8)]))
    expect(h.match(/wbar7__bar /g)).toHaveLength(23)
  })
  it('no hours at all says so', () => {
    const h = draw([])
    expect(h).toContain('has not said')
    expect(h).not.toContain('<svg')
  })
  it('arrows on every sixth hour, only when asked', () => {
    expect(draw(hours(Array.from({ length: 24 }, () => 8))).match(/data-wind-arrow/g)!.length).toBeGreaterThanOrEqual(4)
    expect(draw(hours(Array.from({ length: 24 }, () => 8)), { arrows: false })).not.toContain('data-wind-arrow')
  })
  it('the drone limit, in the user’s unit, only when there is one', () => {
    const rated = draw(hours(Array.from({ length: 24 }, () => 8)), { limitMps: 23 * KT })
    expect(rated).toContain('drone limit 23')
    expect(draw(hours(Array.from({ length: 24 }, () => 8)))).not.toContain('data-wind-limit')
  })
  it('the now marker is inside the bar and the axis is on the clock', () => {
    const h = draw(hours(Array.from({ length: 24 }, () => 8)))
    expect(h).toContain('wbar7__now')
    expect(h).toContain('tcurve__tick')
  })
})
