import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from '../core/kit.ts'
import { ExposurePlayground } from './ExposurePlayground.tsx'

const bag = { bodyIds: DEFAULT_KIT.bodies.map((b) => b.id), lensIds: DEFAULT_KIT.lenses.map((l) => l.id), droneIds: [], styleNotes: '' }
const html = renderToStaticMarkup(<ExposurePlayground kit={DEFAULT_KIT} bag={bag} />)
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the exposure playground', () => {
  it('says what it is, and credits the photo', () => {
    expect(text).toContain('A demo of how the settings change a photo. Not a measurement.')
    expect(text).toContain('Photo by Jwillyagaze.')
    expect(text).toContain('Nothing is uploaded.')
  })

  it('three sliders in plain words, the camera term small underneath', () => {
    expect(html.match(/type="range"/g)?.length).toBe(3)
    for (const w of ['Freeze motion', 'Show motion', 'Background sharp', 'Background soft', 'Clean, dark', 'Grainy, bright']) expect(text).toContain(w)
    for (const t of ['Shutter speed', 'Aperture', 'ISO']) expect(text).toContain(t)
  })

  it('four presets and a light meter', () => {
    for (const p of ['Freeze the air', 'Golden hour', 'Show the spray', 'Night pool']) expect(text).toContain(p)
    for (const w of ['Too dark', 'Right', 'Too bright']) expect(text).toContain(w)
  })

  it('draws the cutout over the background from the phone, nothing remote', () => {
    expect(html).toContain('href="/playground/background.jpg"')
    expect(html).toContain('href="/playground/surfer.webp"')
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('opens on the photo body and the longest lens in the bag', () => {
    expect(html).toMatch(/<option value="a7iv" selected=""/)
    const longest = [...DEFAULT_KIT.lenses].sort((a, b) => b.maxFocalLength - a.maxFocalLength)[0]
    expect(html).toContain(`<option value="${longest.id}" selected=""`)
  })
})
