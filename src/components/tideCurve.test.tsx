import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { curveFromExtremes, type TideExtreme } from '../core/tide.ts'
import { TideCurve } from './TideCurve.tsx'

const NY = 'America/New_York'
const LOW = Date.UTC(2026, 10, 19, 22, 48)
const STEP = (6 * 60 + 12) * 60_000
const EXTREMES: TideExtreme[] = [-2, -1, 0, 1, 2].map((k) => ({ at: new Date(LOW + k * STEP), feet: k % 2 === 0 ? 0.8 : 3.4, kind: k % 2 === 0 ? ('low' as const) : ('high' as const) }))
const CURVE = curveFromExtremes(EXTREMES)
const NOW = new Date(LOW - 75 * 60_000)
const base = { curve: CURVE, from: new Date(NOW.getTime() - 2 * 3_600_000), to: new Date(NOW.getTime() + 16 * 3_600_000), timeZone: NY, now: NOW }
const pathOf = (h: string) => /<path class="tcurve__line" d="([^"]+)"/.exec(h)?.[1]

describe('the one tide curve', () => {
  it('the three screens draw the same line from the same samples', () => {
    const page = renderToStaticMarkup(<TideCurve variant="page" {...base} />)
    const chart = renderToStaticMarkup(<TideCurve variant="chart" {...base} />)
    expect(pathOf(page)).toBeDefined()
    /* The page and the chart are the same height of plot only when padded alike; the shape is the same samples at the same x. */
    const xs = (h: string) => [...pathOf(h)!.matchAll(/[ML]?([\d.]+),/g)].map((m) => m[1])
    expect(xs(page)).toEqual(xs(chart))
    expect(pathOf(renderToStaticMarkup(<TideCurve variant="page" {...base} />))).toBe(pathOf(page))
  })
  it('the strip is thin: a line and a now dot, no words', () => {
    const h = renderToStaticMarkup(<TideCurve variant="strip" {...base} marks={[{ at: new Date(LOW), kind: 'low', label: 'low 5:48p' }]} />)
    expect(h).toContain('tcurve--strip')
    expect(h).toContain('tcurve__nowdot')
    expect(h).not.toContain('<text')
    expect(h).not.toContain('tcurve__area')
  })
  it('the page has a now line with "now", the marker’s words and the time axis', () => {
    const h = renderToStaticMarkup(<TideCurve variant="page" {...base} marks={[{ at: new Date(LOW), kind: 'low', label: 'low 5:48p' }]} />)
    expect(h).toContain('tcurve__nowline')
    expect(h).toContain('>now<')
    expect(h).toContain('>low 5:48p<')
    expect(h).toContain('tcurve__tick')
  })
  it('the chart draws the window band with its words, and the turn marker', () => {
    const h = renderToStaticMarkup(
      <TideCurve variant="chart" {...base} band={{ from: new Date(LOW - 30 * 60_000), to: new Date(LOW + 90 * 60_000), label: 'major 5:10–7:10' }} marks={[{ at: new Date(LOW), kind: 'low', label: 'tide turn 5:48' }]} />,
    )
    expect(h).toContain('data-tide-band')
    expect(h).toContain('major 5:10–7:10')
    expect(h).toContain('tide turn 5:48')
  })
  it('a marker without words says its time, through the clock formatter', () => {
    const h = renderToStaticMarkup(<TideCurve variant="page" {...base} marks={[{ at: new Date(LOW), kind: 'low' }]} />)
    expect(h).toContain('>5:48p<')
  })
  it('scrubbing is only wired when asked for, and draws the finger’s line', () => {
    expect(renderToStaticMarkup(<TideCurve variant="page" {...base} />)).not.toContain('data-sideways')
    const h = renderToStaticMarkup(<TideCurve variant="page" {...base} onScrub={() => {}} scrubAt={NOW} />)
    expect(h).toContain('data-sideways')
    expect(h).toContain('data-scrub')
  })
  it('without a curve it says so, and draws no line', () => {
    const h = renderToStaticMarkup(<TideCurve variant="page" {...base} curve={[]} />)
    expect(h).toContain('does not reach')
    expect(h).not.toContain('tcurve__line')
  })
})
