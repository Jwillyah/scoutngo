import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SpotPicker } from './SpotPicker.tsx'

/* Batch DRONE, Section 6.6: the first run's picker sits mid-screen (spick--first), and offers no "nearest" spots: with no location there is none. */
describe('the first run’s spot picker', () => {
  it('nothing saved or near: the first-run layout, the Try chips, no spot list', () => {
    const html = renderToStaticMarkup(<SpotPicker title="Where do you go?" saved={[]} around={null} onPick={() => {}} />)
    expect(html).toContain('class="spick spick--first"')
    expect(html).toContain('aria-label="Try"')
    expect(html).not.toMatch(/nearest|Spots near/i)
  })
  it('with a place to look around: the full picker', () => {
    const html = renderToStaticMarkup(<SpotPicker title="Spot" saved={[]} around={{ lat: 36.84, lon: -75.97 }} onPick={() => {}} />)
    expect(html).not.toContain('spick--first')
  })
})
