import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SkyPreview } from './SkyPreview.tsx'

/* Batch E, Section 2: the Sky fire page, each thing once (phone, 1 Nov). */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const AT = new Date('2026-11-01T12:00:00Z')

describe('the colour clock inside Sky fire', () => {
  it('has no second Sunrise / Sunset switch and no second verdict when Sky fire picks the event', () => {
    const html = renderToStaticMarkup(<SkyPreview venue={PIER} timeZone="America/New_York" at={AT} kind="sunset" />)
    expect(html).not.toContain('prev__kinds')
    expect(html).not.toContain('prev__verdict')
  })

  it('on its own it keeps its switch', () => {
    const html = renderToStaticMarkup(<SkyPreview venue={PIER} timeZone="America/New_York" at={AT} />)
    expect(html.match(/prev__kinds/g)?.length).toBe(1)
  })

  it('three pages now the 3D sky exists (Batch F): the colour clock, four forecasts, a week of skies; nothing that says "coming"', () => {
    const html = renderToStaticMarkup(<SkyPreview venue={PIER} timeZone="America/New_York" at={AT} kind="sunrise" />)
    expect(html).not.toMatch(/Coming with/)
    expect(html).toContain('aria-label="Four forecasts"')
    expect(html).toContain('aria-label="Week of skies"')
    expect(html.match(/class="prev__dot[ "]/g)?.length).toBe(3)
    /* Both picture pages say the clouds are illustrative. */
    expect(html.match(/Clouds illustrative/g)?.length).toBe(2)
    expect(html).not.toMatch(/\bsafe\b|\bclear\b/i)
  })
})
