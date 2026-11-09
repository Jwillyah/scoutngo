import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Landing } from './Landing.tsx'

/*
 * THE HOME PAGE (Batch F, board HOME V · with real photos): four photo bands
 * for a fixed sample beach, four rows, one gold button, the footer. Its fit at
 * 390 x 664 is checked in WebKit by scripts/audit-home.mjs.
 */
describe('the home page', () => {
  const html = renderToStaticMarkup(<Landing onDismiss={() => {}} />)

  it('has the brand, the line, four bands, four rows, one gold button and the footer, in order (board HOME V)', () => {
    expect(html).toContain('>ScoutNGo<')
    const order = ['Four apps in one.', 'Private, and yours.', '>Light<', '>Tide<', '>Surf<', '>Wind<', 'Sky color', 'Drone preflight', 'Fly it here first: line of sight, roofs, wind.', 'Moon line-ups', 'No account, no tracking', 'Open source. Your spots never leave your phone.', 'Open the map', 'Free · open source · works offline ·', '>How it works<', '>Privacy<']
    const at = order.map((t) => html.indexOf(t))
    expect(at.every((i) => i >= 0), JSON.stringify(order.filter((_, i) => at[i] < 0))).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html.match(/class="cover__go"/g)?.length).toBe(1)
  })

  it('names the fixed sample beach, and before anything arrives every value is a dash', () => {
    expect(html).toContain('Virginia Beach Fishing Pier')
    /* Light is arithmetic on the sun and is there at once; tide, surf and wind wait for an answer. */
    expect(html.match(/class="cover__bandnum">—</g)?.length).toBe(3)
    expect(html).not.toMatch(/safe|clear/i)
  })

  it('carries no <img> and no photographer’s credit: the bands are CSS backgrounds from public/home', () => {
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
