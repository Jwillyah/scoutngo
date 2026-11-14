import artSource from './MenuArt.tsx?raw'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ART_OPACITY, MenuArt, type ArtInput } from './MenuArt.tsx'

/*
 * MENU A'S ART (Batch LIVE, Section 4.1): inline SVG only, under 8 KB all
 * together, at most 60% opacity, live from the card's numbers.
 */
const ALL: ArtInput[] = [
  ...(['sun', 'moon', 'partly', 'partly-night', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm', null] as const).map((icon) => ({ kind: 'weather' as const, icon })),
  { kind: 'surf' },
  { kind: 'wind', fromDeg: 337 },
  { kind: 'tide', rising: true },
  { kind: 'tide', rising: false },
  { kind: 'sky', lit: true },
  { kind: 'sky', lit: false },
  { kind: 'drone' },
]
const html = (a: ArtInput) => renderToStaticMarkup(<MenuArt art={a} />)

describe('the menu cards\' art', () => {
  it('is inline SVG, every kind together under 8 KB', () => {
    const all = ALL.map(html).join('')
    expect(all).not.toMatch(/<img|url\(|href=/)
    expect(new TextEncoder().encode(all).length).toBeLessThanOrEqual(8 * 1024)
    expect(artSource.length).toBeLessThanOrEqual(8 * 1024)
  })
  it('at most 60% opacity', () => {
    expect(ART_OPACITY).toBeLessThanOrEqual(0.6)
    expect(html({ kind: 'surf' })).toMatch(/opacity:0\.5/)
  })
  it('the wind lines point where the wind goes: from NNW, toward SSE', () => {
    expect(html({ kind: 'wind', fromDeg: 337.5 })).toContain('data-wind-to="158"')
  })
  it('the tide rises or falls; the sky is lit only for a call worth going for', () => {
    expect(html({ kind: 'tide', rising: true })).toContain('data-tide="rising"')
    expect(html({ kind: 'tide', rising: false })).toContain('data-tide="falling"')
    expect(html({ kind: 'sky', lit: true })).toContain('data-sky-lit="1"')
    expect(html({ kind: 'sky', lit: false })).toContain('data-sky-lit="0"')
  })
  it('the weather follows the sky word: a moon at night, rain under a cloud', () => {
    expect(html({ kind: 'weather', icon: 'moon' })).not.toBe(html({ kind: 'weather', icon: 'sun' }))
    expect(html({ kind: 'weather', icon: 'rain' })).not.toBe(html({ kind: 'weather', icon: 'cloud' }))
  })
})
