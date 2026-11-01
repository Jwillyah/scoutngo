import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* Batch E, Section 2: the Sky fire page (phone, 1 Nov). The colour clock's half is src/components/skyFirePage.test.tsx. */
describe('the Sky fire page', () => {
  const fire = readFileSync('src/components/SkyFire.tsx', 'utf8')
  const plan = readFileSync('src/components/PlanMode.tsx', 'utf8')

  it('shows the three checks under their heading, not behind an empty fold', () => {
    expect(fire).toMatch(/<p className="fire__head">Why: the three checks<\/p>\s*<ul className="fire__checks">/)
    expect(fire).not.toMatch(/<summary[^>]*>Why: the three checks/)
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
