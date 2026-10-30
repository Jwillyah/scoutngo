import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Landing } from './Landing.tsx'

/*
 * THE HOME PAGE, SIMPLE (field test, 30 Oct): no photograph, no credit, the
 * three lines on what is different, one gold button, the footer. Its fit at
 * 390 x 664 is checked in WebKit by scripts/audit-home.mjs.
 */
describe('the home page', () => {
  const html = renderToStaticMarkup(<Landing onDismiss={() => {}} />)

  it('has the brand, the line, the three lines, one gold button and the footer, in order', () => {
    expect(html).toContain('>ScoutNGo<')
    const order = ['Plan the shot before you go.', 'Light, tide, surf and wind for the exact spot', 'Drone moves checked before you fly', 'Nothing about you leaves your phone', 'Open the map', 'Free · open source · no account ·', '>Privacy<', '>How it works<']
    const at = order.map((t) => html.indexOf(t))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html.match(/class="cover__go"/g)?.length).toBe(1)
  })

  it('carries no photograph and no photographer’s credit', () => {
    expect(html).not.toMatch(/<img/)
    expect(html).not.toMatch(/Photo by|Jwilly|home-hero/)
  })
})

describe('the build', async () => {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { existsSync: (p: string) => boolean; readFileSync: (p: string, e: string) => string }
  it('ships no home photograph: the file is gone and nothing names it', () => {
    expect(fs.existsSync('public/home-hero.webp')).toBe(false)
    expect(fs.readFileSync('src/sw/shellRoutes.ts', 'utf8')).not.toContain('home-hero')
  })
})
