import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* Batch E, Section 2: the Sky fire page (phone, 1 Nov). The colour clock's half is src/components/skyFirePage.test.tsx. */
describe('the Sky fire page', () => {
  const fire = readFileSync('src/components/SkyFire.tsx', 'utf8')
  const plan = readFileSync('src/components/PlanMode.tsx', 'utf8')

  /*
   * Batch G, Section 4, less text and more picture: the switch, the verdict
   * in one sentence, the side view, the colour strip, the three checks as
   * icons with yes / no, and "Why" folded with the numbers. (Batch E had the
   * checks open with their numbers; the owner asked for the picture first.)
   */
  it('lays the page out picture first, the numbers folded under Why', () => {
    const render = fire.slice(fire.indexOf('<div className="seg fire__kinds"'))
    const at = (x: string) => render.indexOf(x)
    /* Batch I, one screen: the verdict big, the side view, the strip and checks, then three rows: Compare, Why, Log it. */
    /* Batch J, Section 8: the side view went into Why, so the rows and the Viewfinder are on the first screen. */
    const order = ['fire__kinds', 'fire__big', "colourClock?.(kind, 'strip')", 'fire__checks--icons', '<summary>Compare the 5 forecasts</summary>', "colourClock?.(kind, 'compare')", '<details className="frow fire__whyfold">', '<summary>Log it'].map(at)
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    const why = render.slice(at('fire__whyfold'), render.indexOf('</details>', at('fire__whyfold')))
    expect(why).toContain('checkWords(lead, name)[key]')
    expect(why).toContain('<FireSideView read={m}')
    expect(why).toContain('<FireSideView read={verdict.sky}')
    expect(why).toContain('Stations:')
  })
  it('sets no sentence in the numbers font', () => {
    expect(fire).not.toMatch(/fire__(checks|models|note)[^"]* num/)
    expect(readFileSync('src/components/TruthLoop.tsx', 'utf8')).not.toMatch(/className="(fire__note|truth__list) num"/)
  })

  it('the old links are at their homes: Sky › Now only, and the cloud card from the shoot card', () => {
    const sky = plan.slice(plan.indexOf("THE OLD CARDS, AT HOME"), plan.indexOf("THE OLD CARDS, AT HOME") + 1200)
    expect(sky).toContain("skyTab !== 'now' ? null")
    expect(sky).not.toContain('Wind at your flight height')
    expect(sky).not.toContain('Cloud along each position')
    expect(plan).toMatch(/a Plan thing, so their doors are here[\s\S]{0,200}Cloud along each position’s view[\s\S]{0,120}Wind at your flight height/)
  })
})
