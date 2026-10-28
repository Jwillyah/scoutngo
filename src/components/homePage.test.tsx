import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HERO_CREDIT, Landing } from './Landing.tsx'

/*
 * THE HOME PAGE IS THE SHOOTER'S PHOTOGRAPH (27 Oct 2026, Virginia Beach at
 * sunrise). Its type passing contrast on the pixels behind it is measured on
 * the real page (scripts/measure-home-contrast.mjs); here, the page's parts,
 * and the shipped file itself.
 */
describe('the home page', () => {
  const html = renderToStaticMarkup(<Landing onDismiss={() => {}} />)

  it('has the brand, the line, four features, one gold button and the footer in order', () => {
    expect(html).toContain('>ScoutNGo<')
    expect(html).toContain('Plan the shot before you get there. Where to stand, which lens, and when the light is right.')
    for (const f of ['Where to stand', 'Which lens', 'When the light hits', 'Works offline']) expect(html).toContain(`>${f}<`)
    expect(html.match(/class="cover__go"/g)?.length).toBe(1)
    expect(html).toMatch(/Free · open source · no account ·[^]*How it works/)
  })

  it('shows the photograph, says what it is, and credits the photographer', () => {
    expect(html).toMatch(/<img[^>]*class="cover__photo"[^>]*src="\/home-hero.webp"/)
    expect(html).toMatch(/alt="[^"]*Virginia Beach[^"]*pier[^"]*"/)
    expect(HERO_CREDIT).toBe('Photo by Jwillyagaze')
    expect(html).toContain(`>${HERO_CREDIT}<`)
  })
})

describe('the shipped photograph', async () => {
  /* Read as a file: the app's types carry no Node, so the module is named at run time. */
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync: (p: string) => Uint8Array }
  const bytes = fs.readFileSync('public/home-hero.webp')
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  /* The RIFF chunks in the file: a WebP carries metadata only in EXIF, XMP and ICCP chunks (and the VP8X header that announces them). */
  const chunks: string[] = []
  for (let at = 12; at + 8 <= bytes.length; ) {
    chunks.push(ascii(at, at + 4))
    const size = view.getUint32(at + 4, true)
    at += 8 + size + (size % 2)
  }

  it('is a WebP under 300 KB, for phones', () => {
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 12)).toBe('WEBP')
    expect(bytes.length).toBeLessThan(300 * 1024)
  })

  it('carries no metadata: no position, no camera, no colour profile', () => {
    expect(chunks.length).toBeGreaterThan(0)
    for (const c of chunks) expect(['VP8 ', 'VP8L']).toContain(c)
    const text = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    for (const w of ['GPS', 'drone-dji', 'Exif', 'xmpmeta', 'DJI']) expect(text).not.toContain(w)
  })
})
