import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WindHours } from './WindTimeBar.tsx'

/* Batch TRUTH, Section 7: the marker's hours when the bar is dragged up (Batch DRONE, Section 3: the marker, not a crosshair). */
const from = new Date('2026-11-12T05:00:00Z')
const at = new Date('2026-11-12T12:41:00Z')
describe('the wind hours', () => {
  it('the hours at the marker from the bar\'s time', () => {
    const h = renderToStaticMarkup(<WindHours at={at} from={from} strip={Array.from({ length: 72 }, () => 4)} unit="kt" timeZone="America/New_York" />)
    expect(h).toContain('At the marker, hour by hour')
    expect(h).not.toMatch(/crosshair/i)
    expect(h.match(/class="whours__row"/g)?.length).toBe(24)
    /* 4 m/s is 8 kt. */
    expect(h).toContain('8 kt')
  })
})
