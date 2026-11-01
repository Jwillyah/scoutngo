import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from '../core/kit.ts'
import { ExposurePlayground } from './ExposurePlayground.tsx'

const bag = { bodyIds: DEFAULT_KIT.bodies.map((b) => b.id), lensIds: DEFAULT_KIT.lenses.map((l) => l.id), droneIds: [], styleNotes: '' }
const html = renderToStaticMarkup(<ExposurePlayground kit={DEFAULT_KIT} bag={bag} />)
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the exposure playground', () => {
  it('says what it is, and that the scene is drawn', () => {
    expect(text).toContain('A demo of how the settings change a photo. Not a measurement.')
    expect(text).toContain('A drawn test scene.')
    expect(text).not.toMatch(/Photo by|Jwilly/)
    expect(text).toContain('Nothing is uploaded.')
  })

  it('three sliders in plain words, the camera term small underneath, and the distance', () => {
    expect(html.match(/type="range"/g)?.length).toBe(4)
    expect(text).toContain('How far away is he')
    expect(html).toMatch(/min="10" max="80"[^>]*value="53"/)
    for (const w of ['Freeze motion', 'Show motion', 'Background sharp', 'Background soft', 'Clean, dark', 'Grainy, bright']) expect(text).toContain(w)
    for (const t of ['Shutter speed', 'Aperture', 'ISO']) expect(text).toContain(t)
  })

  it('four presets and a light meter', () => {
    for (const p of ['Freeze the air', 'Golden hour', 'Show the spray', 'Night pool']) expect(text).toContain(p)
    for (const w of ['Too dark', 'Right', 'Too bright']) expect(text).toContain(w)
  })

  it('draws the scene in code: no photograph, nothing remote (Batch C2)', () => {
    expect(html).not.toMatch(/<image|\.jpe?g|\.webp|playground\//)
    expect(html).toMatch(/<circle/)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('opens on the photo body and the longest lens in the bag', () => {
    expect(html).toMatch(/<option value="a7iv" selected=""/)
    const longest = [...DEFAULT_KIT.lenses].sort((a, b) => b.maxFocalLength - a.maxFocalLength)[0]
    expect(html).toContain(`<option value="${longest.id}" selected=""`)
  })
})
