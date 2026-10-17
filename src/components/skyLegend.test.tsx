import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { zoomAdvice } from '../core/goes.ts'
import type { SkyState } from '../lib/useSkyFrames.ts'
import { SkyLegend } from './SkyLegend.tsx'

const SATELLITE: SkyState = {
  source: {
    kind: 'satellite',
    frameAt: new Date('2026-10-16T17:00:00Z'),
    far: false,
    offsetMinutes: 0,
  },
  opacity: 0.55,
  forecastProblem: null,
} as SkyState

const render = (zoom: number) =>
  renderToStaticMarkup(
    <SkyLegend
      band="visible"
      advice={zoomAdvice('visible', 38.36, 390, zoom)}
      sky={SATELLITE}
      clock={(at) => at.toISOString().slice(11, 16)}
      boundary={null}
      onZoomOut={() => {}}
      layer="cloud"
      onLayer={() => {}}
      windHeight={{ feet: 200, source: 'position' }}
      ratedWindMps={12}
    />,
  )

/*
 * WHAT WAS REPORTED. "At venue zoom I turn it on and see no change and no
 * explanation." Measured in the browser, the explanation WAS rendered, as the
 * fifth block of a 298px panel under four other paragraphs:
 *
 *   .skykey rendered   true
 *   .skykey__wash      "Too close for the sky layer: one visible pixel covers
 *                       2 screens. Zoom out to see cloud. Zoom 13 or wider."
 *
 * So the bug was not that it was missing. It was that it was last.
 */
describe('at venue zoom the sky key is only the reason it is blank', () => {
  /* 16.5 is the zoom the app opens Plan on. */
  const html = render(16.5)

  it('says there is nothing to show, first', () => {
    expect(html).toContain('Nothing to show at this zoom')
    const head = html.indexOf('Nothing to show')
    expect(head).toBeGreaterThanOrEqual(0)
    /* Nothing precedes it: no band name, no source badge, no colour key. */
    expect(html.slice(0, head)).not.toContain('Satellite')
    expect(html.slice(0, head)).not.toContain('Visible')
  })

  it('still carries the measurement that explains why', () => {
    expect(html).toContain('Too close for the sky layer')
    expect(html).toContain('pixel covers')
  })

  /* And it is actionable, because "nothing happened" is what the map shows. */
  it('offers a button that fixes it, naming the zoom', () => {
    expect(html).toContain('skykey__zoomout')
    expect(html).toContain('Zoom out to')
    expect(html).toContain('>13<')
  })

  /*
   * THE REST OF THE KEY IS GONE while the layer has nothing to show. A colour
   * key for a flat wash is not the next thing to read.
   */
  it('drops the band name and the colour ramp', () => {
    expect(html).not.toContain('skykey__band')
    expect(html).not.toContain('skykey__ramp')
    expect(html).not.toContain('skykey__src')
  })
})

describe('zoomed out, the key is the key again', () => {
  const html = render(10)

  it('shows the source and the band', () => {
    expect(html).toContain('Satellite')
    expect(html).toContain('skykey__band')
  })

  it('says nothing about being too close', () => {
    expect(html).not.toContain('Nothing to show at this zoom')
    expect(html).not.toContain('Too close for the sky layer')
    expect(html).not.toContain('skykey__zoomout')
  })
})

/* The two states really are different, or one of the blocks above is vacuous. */
describe('the two states differ', () => {
  it('renders different markup close in and far out', () => {
    expect(render(16.5)).not.toBe(render(10))
  })
})

/*
 * ITEM 8: ONE PICKER, SAME PLACE, and the wind half never borrows the word
 * "observed" from the cloud half.
 */
describe('the layer picker', () => {
  const windKey = (over: Partial<Parameters<typeof SkyLegend>[0]> = {}) =>
    renderToStaticMarkup(
      <SkyLegend
        band="visible"
        advice={zoomAdvice('visible', 38.36, 390, 10)}
        sky={SATELLITE}
        clock={(at) => at.toISOString().slice(11, 16)}
        boundary={null}
        onZoomOut={() => {}}
        layer="wind"
        onLayer={() => {}}
        windHeight={{ feet: 200, source: 'position' }}
        ratedWindMps={12}
        {...over}
      />,
    )

  it('offers both layers wherever it is', () => {
    expect(render(10)).toContain('skykey__pick')
    expect(render(16.5)).toContain('skykey__pick')
    expect(windKey()).toContain('skykey__pick')
  })

  /*
   * THE ZOOM WARNING IS ABOUT THE SATELLITE PIXEL, so it does not apply to a
   * grid of model points. Too close in must still offer the picker, because
   * switching layer is the thing somebody does from that state.
   */
  it('shows the wind layer even when the satellite would be too close', () => {
    const close = windKey({ advice: zoomAdvice('visible', 38.36, 390, 16.5) })
    expect(close).not.toContain('Nothing to show at this zoom')
    expect(close).toContain('skykey__pick')
  })

  it('calls the wind layer a forecast', () => {
    const html = windKey()
    expect(html).toContain('Forecast')
    expect(html).not.toContain('Satellite')
  })

  it('states the height the wind is read at', () => {
    expect(windKey()).toContain('at 200 ft')
  })

  /*
   * COMPACT BY DEFAULT. "CLOUD and WIND is a layer picker, so I need to see
   * the layer change while I tap it." The bar carries what changes with the
   * tap: the tabs, the band key, the height, and the number the bands mean.
   */
  it('keeps the number the bands mean, because without it they mean nothing', () => {
    expect(windKey()).toContain('12 m/s')
  })

  it('says unbanded on the bar when there is no rating', () => {
    expect(windKey({ ratedWindMps: null })).toContain('No published rating')
  })

  /*
   * AND THE PROSE IS GONE FROM THE BAR, not from the app: it is behind the
   * info tap. Asserted as absent here and present in the source below, so
   * "compact" cannot be achieved by deleting the honesty.
   */
  it('does not put the explanation on the bar', () => {
    const html = windKey()
    expect(html).not.toContain('no satellite picture of wind')
    expect(html).not.toContain('published rating of the most limiting')
    expect(html).not.toContain('model points')
  })

  it('offers the info tap that carries it', () => {
    expect(windKey()).toContain('skykey__info')
    expect(windKey()).toContain('What this layer is')
  })

  /*
   * AND IT SAYS WHY THE MAP IS EMPTY WHEN IT IS. This was missing and cost a
   * long diagnosis: the grid came back unavailable, the layer drew nothing,
   * and the key carried on describing bands that were not there.
   */
  it('shows the reason when the grid could not be fetched', () => {
    const html = windKey({
      sky: { ...SATELLITE, forecastProblem: 'Open-Meteo returned HTTP 429.' } as never,
    })
    expect(html).toContain('HTTP 429')
  })


})
