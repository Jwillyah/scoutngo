import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { moonLitPath } from '../lib/moonGlyph.ts'
import { phaseFromLit } from '../lib/moonLit.ts'
import { MoonDrawing } from './MoonDrawing.tsx'

/* The lit path's x extent: the lit side of a size-100 moon (centre 50, radius 49). */
const xs = (path: string) => [...path.matchAll(/(?:M|A [\d.]+ [\d.]+ 0 [01] [01]) ([\d.]+) ([\d.]+)/g)].map((m) => Number(m[1]))
const litPath = (lit: number, waxing: boolean) => moonLitPath(phaseFromLit(lit, waxing), 100)!

describe('the one moon drawing', () => {
  it('turns "how much is lit, waxing or waning" into the phase the app already draws', () => {
    expect(phaseFromLit(0, true)).toBeCloseTo(0, 6)
    expect(phaseFromLit(0.5, true)).toBeCloseTo(0.25, 6)
    expect(phaseFromLit(1, true)).toBeCloseTo(0.5, 6)
    expect(phaseFromLit(0.5, false)).toBeCloseTo(0.75, 6)
    expect(phaseFromLit(0.72, true)).toBeLessThan(0.5)
    expect(phaseFromLit(0.72, false)).toBeGreaterThan(0.5)
  })
  it('waxing is lit on the right: its outer arc sweeps down the right edge', () => {
    /* "A r r 0 0 1": clockwise from the top to the bottom, through the right. */
    expect(litPath(0.25, true)).toMatch(/^M 50 1 A 49 49 0 0 1 50 99/)
  })
  it('waning is lit on the left: its outer arc sweeps down the left edge', () => {
    expect(litPath(0.25, false)).toMatch(/^M 50 1 A 49 49 0 0 0 50 99/)
  })
  it('a quarter moon’s terminator is a straight line (half-width 0)', () => {
    const rx = (p: string) => Number(/A ([\d.e-]+) 49 0 0 [01] 50 1 Z$/.exec(p)![1])
    expect(rx(litPath(0.5, true))).toBeLessThan(1e-9)
    expect(rx(litPath(0.5, false))).toBeLessThan(1e-9)
  })
  it('a crescent’s terminator is narrower than the disc and a gibbous’s is the other way about', () => {
    const half = (p: string) => Number(/A ([\d.]+) 49 0 0 [01] 50 1 Z$/.exec(p)![1])
    expect(half(litPath(0.25, true))).toBeGreaterThan(0)
    expect(half(litPath(0.25, true))).toBeLessThan(49)
    expect(half(litPath(0.75, true))).toBeLessThan(49)
    /* 25% and 75% lit are mirror terminators: same half-width, opposite sweep. */
    expect(half(litPath(0.25, true))).toBeCloseTo(half(litPath(0.75, true)), 3)
    const sweep = (p: string) => /A [\d.]+ 49 0 0 ([01]) 50 1 Z$/.exec(p)![1]
    expect(sweep(litPath(0.25, true))).not.toBe(sweep(litPath(0.75, true)))
  })
  it('new moon draws no lit part; full draws the whole disc, either way round', () => {
    expect(moonLitPath(phaseFromLit(0, true), 100)).toBeNull()
    expect(moonLitPath(phaseFromLit(0, false), 100)).toBeNull()
    expect(xs(litPath(1, true)).length).toBeGreaterThan(0)
    expect(litPath(1, true)).toMatch(/A 49 49 0 0 1 50 1 Z$|A 49 49 0 0 0 50 1 Z$/)
  })
  it('renders through the one glyph (the app’s .calm moon) at the size asked', () => {
    const h = renderToStaticMarkup(<MoonDrawing lit={0.72} waxing size={100} />)
    expect(h).toContain('class="calm"')
    expect(h).toContain('width="100"')
    expect(h).toContain('calm__lit')
    expect(renderToStaticMarkup(<MoonDrawing lit={0} waxing size={40} />)).not.toContain('calm__lit')
  })
})
