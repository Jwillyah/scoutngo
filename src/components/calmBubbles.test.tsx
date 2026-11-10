import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon.tsx'
import { TILE_ART } from './tileArt.tsx'
import { TopBar } from './TopBar.tsx'

/*
 * THE FIELD TEST OF 27 OCT, on a 390 x 844 phone, the render half: the layer
 * tiles did not look like the rest of the app, the cone glyph read as a screw
 * head, and the + was a glowing orange ball. The CSS half is
 * tests/calmBubbles.test.ts, which reads the stylesheet as a file.
 */

describe('the cone glyph is a camera view cone', () => {
  const html = renderToStaticMarkup(<Icon glyph="lens" size={42} />)
  const paths = [...html.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1] as string)

  it('has two straight rays from one apex and an arc between their far ends', () => {
    const edge = paths.find((d) => /A[\d.]+ [\d.]+ 0 0 1/.test(d) && (d.match(/L/g) ?? []).length === 2)
    expect(edge, paths.join(' | ')).toBeDefined()
    const nums = (edge as string).match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    const [topX, topY, apexX, apexY, botX, botY] = nums
    /* The rays fan out to the right from the apex, symmetric about it, at a real angle. */
    expect(topX).toBeGreaterThan(apexX as number)
    expect(botX).toBe(topX)
    expect((apexY as number) - (topY as number)).toBeCloseTo((botY as number) - (apexY as number), 5)
    const half = Math.atan2((apexY as number) - (topY as number), (topX as number) - (apexX as number)) * (180 / Math.PI)
    expect(half).toBeGreaterThan(20)
    expect(half).toBeLessThan(40)
    /* The arc is centred on the apex: its radius is the ray's length. */
    const radius = Number(/A([\d.]+)/.exec(edge as string)?.[1])
    expect(radius).toBeCloseTo(Math.hypot((topX as number) - (apexX as number), (topY as number) - (apexY as number)), 1)
  })

  it('has a camera body behind the apex and no hexagon', () => {
    expect(html).toMatch(/<rect [^>]*fill="#FFF"/)
    /* The old glyph was a disc with a six-sided nut on it. */
    expect(paths.some((d) => (d.match(/[lL]/g) ?? []).length >= 5 && d.endsWith('z'))).toBe(false)
  })

  it('is the same drawing on the Cones tile as on the dock', () => {
    const tile = renderToStaticMarkup(<>{TILE_ART.cones}</>)
    expect(tile).toContain('data-icon="lens"')
    expect(tile.match(/<svg[^]*<\/svg>/)?.[0]).toBe(html.match(/<svg[^]*<\/svg>/)?.[0])
  })
})

describe('the layer tiles are bubbles', () => {
  const ids = Object.keys(TILE_ART) as (keyof typeof TILE_ART)[]

  it('every tile, base and overlay, is a golden bubble with one white symbol', () => {
    /* Ten layers, and under Tools the measure, Preflight, the skyline and the light map. */
    expect(ids.length).toBe(14)
    for (const id of ids) {
      const html = renderToStaticMarkup(<>{TILE_ART[id]}</>)
      expect(html, id).toMatch(/^<span class="icon tile__bubble"[^>]*--icon-middle:#[0-9a-f]{6}/)
      expect((html.match(/<svg/g) ?? []).length, id).toBe(1)
      /* No role colour on a tile: neither the chrome teal nor the hazard red. */
      expect(html.toLowerCase(), id).not.toMatch(/#2dd4bf|#ff3b30/)
    }
  })
})

describe('the + in the top bar', () => {
  const bar = (adding: boolean) =>
    renderToStaticMarkup(
      <TopBar onMenu={() => {}} menuOpen={false} pill={null} onAdd={() => {}} adding={adding} onLocate={null} locating={false} locateNote={null} online />,
    )

  it('keeps a pressed state you can see, and says what it is doing', () => {
    expect(bar(true)).toMatch(/class="topbar__btn topbar__btn--add topbar__btn--on"[^>]*aria-pressed="true"/)
    expect(bar(false)).toMatch(/class="topbar__btn topbar__btn--add"[^>]*aria-pressed="false"/)
    expect(bar(true)).toContain('aria-label="Tap the map to place it"')
  })
})
