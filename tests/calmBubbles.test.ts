import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/core/contrast.ts'

/*
 * THE FIELD TEST OF 27 OCT, the CSS half: the + was a glowing orange ball and
 * every bubble shone too much. The render half (the cone glyph, the tiles as
 * bubbles, the + state) is src/components/calmBubbles.test.tsx.
 *
 * CSS is read as a file, never through Vite, which hands it to vitest as an
 * empty string (docs/failure-modes.md, B). Every rule lookup asserts it found
 * the rule before asserting anything about it.
 */
const APP_CSS = readFileSync('src/styles/app.css', 'utf8')
const TOKENS = readFileSync('src/styles/tokens.css', 'utf8')

const ruleBody = (selector: string): string => {
  const at = APP_CSS.indexOf(`\n${selector} {`)
  expect(at, `${selector} is in app.css`).toBeGreaterThan(-1)
  return APP_CSS.slice(at, APP_CSS.indexOf('\n}', at))
}
const token = (name: string): string => {
  const hex = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(TOKENS)?.[1]
  expect(hex, `--${name} in tokens.css`).toBeDefined()
  return hex as string
}

describe('the + in the top bar', () => {
  it('is dark glass with a gold glyph: no gold ball, no glow', () => {
    const add = ruleBody('.topbar__btn--add')
    expect(add).not.toMatch(/background|box-shadow|action-sheen|action-glow|border-color/)
    expect(add).toContain('color: var(--action-mid)')
    /* The glass is the shared button's, so it matches its neighbours. */
    expect(ruleBody('.topbar__btn')).toContain('background: var(--panel-sheen)')
    /* Gold on the darkest glass it can sit on: 3:1 for a control's glyph. */
    expect(contrastRatio(token('action-mid'), token('surface-1'))).toBeGreaterThanOrEqual(3)
  })

  it('armed, the rim and a tint go gold, still without the glow', () => {
    const on = ruleBody('.topbar__btn--add.topbar__btn--on')
    expect(on).toContain('border-color: var(--action-mid)')
    expect(on).toMatch(/background: color-mix\(in srgb, var\(--action-mid\)/)
    expect(on).not.toMatch(/action-glow|action-sheen/)
  })
})

describe('every bubble is calmer', () => {
  const alphas = (body: string) => [...body.matchAll(/rgb\(255 255 255 \/ ([\d.]+)\)/g)].map((m) => Number(m[1]))

  it('the gloss and the top highlight are faint', () => {
    const gloss = alphas(ruleBody('.icon::before'))
    expect(gloss.length).toBeGreaterThan(0)
    expect(Math.max(...gloss)).toBeLessThanOrEqual(0.2)
    const rim = alphas(ruleBody('.icon'))
    expect(rim.length).toBeGreaterThan(0)
    expect(Math.max(...rim)).toBeLessThanOrEqual(0.3)
  })

  it('the coloured glow is a faint mix, not the full middle stop', () => {
    const icon = ruleBody('.icon')
    const shadow = icon.slice(icon.indexOf('box-shadow'))
    expect(shadow).not.toMatch(/\) var\(--icon-middle\)/)
    const mix = /color-mix\(in srgb, var\(--icon-middle\) (\d+)%, transparent\)/.exec(shadow)
    expect(mix).not.toBeNull()
    expect(Number(mix?.[1])).toBeLessThanOrEqual(35)
  })

  it('the layer tile frame centres its bubble and keeps the state on the frame', () => {
    expect(ruleBody('.tile__art')).toContain('place-items: center')
    expect(ruleBody('.tile__art--on')).toContain('border-color: var(--ocean)')
  })
})
