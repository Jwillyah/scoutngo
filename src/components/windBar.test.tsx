import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WindHours, WindTimeBar } from './WindTimeBar.tsx'

/* Batch TRUTH, Section 7: one thin bar; the crosshair's hours when it is dragged up. */
const from = new Date('2026-11-12T05:00:00Z')
const at = new Date('2026-11-12T12:41:00Z')
describe('the wind bar', () => {
  const html = renderToStaticMarkup(
    <WindTimeBar at={at} now={at} from={from} hours={72} timeZone="America/New_York" onAt={() => {}} model="blend" onModel={() => {}} strip={Array.from({ length: 72 }, (_, i) => 3 + (i % 5))} unit="kt" levelFt={0} onLevel={() => {}} note="What the colours mean." />,
  )
  it('play, the day and time "now", the model chip, Surface, i, the scrubber and the legend line', () => {
    expect(html).toContain('aria-label="Play the wind"')
    expect(html).toMatch(/<span class="wbar__time" data-wind-when="true">Thu 7:41 AM<\/span><span class="wbar__now"> · now/)
    expect(html).toContain('aria-label="Model: Blend"')
    expect(html).toContain('>Surface<')
    expect(html).toContain('aria-label="What the colours mean"')
    expect(html).toContain('role="slider"')
    expect(html.match(/class="wbar__legend"/g)?.length).toBe(1)
    /* The explanation behind "i", closed. */
    expect(html).not.toContain('What the colours mean.<')
  })
  it('the hours at the crosshair from the bar\'s time', () => {
    const h = renderToStaticMarkup(<WindHours at={at} from={from} strip={Array.from({ length: 72 }, () => 4)} unit="kt" timeZone="America/New_York" />)
    expect(h).toContain('At the crosshair, hour by hour')
    expect(h.match(/class="whours__row"/g)?.length).toBe(24)
    /* 4 m/s is 8 kt. */
    expect(h).toContain('8 kt')
  })
})
