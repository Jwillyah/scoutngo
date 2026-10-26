import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HOME_FRAME from '../data/homeFrame.json'
import { Landing } from './Landing.tsx'
import { contrastRatio, mixHex } from '../core/contrast.ts'
import { FOOT_SCRIM, FOOT_SOLID_AT, FRAME, HOME_INK, HORIZON, skyAt, TYPE_BANDS } from '../lib/homeSky.ts'

const BANDS = TYPE_BANDS

const worst = (ink: string, from: number, to: number) => {
  let min = Infinity
  for (let y = from; y <= to; y += 1) {
    const bg = skyAt(y)
    expect(bg, `sky at ${y}`).not.toBeNull()
    min = Math.min(min, contrastRatio(ink, bg as string))
  }
  return min
}

describe('the home page sky', () => {
  it('is gone by 60% down, so the venue reads below it', () => {
    expect(HORIZON).toBe(0.6)
    expect(skyAt(FRAME.height * 0.61)).toBeNull()
  })

  it('white name and line pass 4.5:1 wherever they sit on it', () => {
    expect(worst(HOME_INK.light, BANDS.light.from, BANDS.light.to)).toBeGreaterThanOrEqual(4.5)
  })

  it('the dark plum feature labels pass 4.5:1 on the warm end', () => {
    expect(worst(HOME_INK.dark, BANDS.dark.from, BANDS.dark.to)).toBeGreaterThanOrEqual(4.5)
  })

  it('the footer passes 4.5:1 on its scrim even over a white roof', () => {
    expect(FOOT_SOLID_AT).toBeLessThan(BANDS.footerFrom)
    const overWhite = mixHex('#ffffff', FOOT_SCRIM.colour, FOOT_SCRIM.opacity)
    expect(contrastRatio(HOME_INK.footer, overWhite)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the home page', () => {
  const html = renderToStaticMarkup(<Landing onDismiss={() => {}} />)

  it('has the brand, the line, four features, one gold button and the footer in order', () => {
    expect(html).toContain('>ScoutNGo<')
    expect(html).toContain('Plan the shot before you get there. Where to stand, which lens, and when the light is right.')
    for (const f of ['Where to stand', 'Which lens', 'When the light hits', 'Works offline']) expect(html).toContain(`>${f}<`)
    expect(html.match(/class="cover__go"/g)?.length).toBe(1)
    expect(html).toMatch(/Free · open source · no account ·[^]*How it works/)
  })

  it('keeps the imagery credit and says the venue is an example', () => {
    expect(html).toContain('An example venue, not your location.')
    expect(html).toMatch(/Esri/)
  })

  it('draws a pin and a cone for each recorded position, and the sun line, from the recorded frame', () => {
    expect(HOME_FRAME.positions.length).toBeGreaterThanOrEqual(2)
    expect(html.match(/class="cover__pin"/g)?.length).toBe(HOME_FRAME.positions.length)
    for (const p of HOME_FRAME.positions) expect(html).toContain(`translate(${p.apex[0]} ${p.apex[1]})`)
    expect(HOME_FRAME.sunLine).not.toBeNull()
    expect(html).toContain('stroke-dasharray="1 6"')
  })

  it('the pins sit below the horizon, in the venue, not under the sky', () => {
    for (const p of HOME_FRAME.positions) expect(p.apex[1]).toBeGreaterThan(FRAME.height * HORIZON)
  })
})
