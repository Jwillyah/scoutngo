import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* About is a page with its own route, not a card in the sheet (Batch E, Section 7). */
describe('About', () => {
  const plan = readFileSync('src/components/PlanMode.tsx', 'utf8')
  const union = readFileSync('src/lib/sheetCard.ts', 'utf8')
  it('is no card in the sheet', () => {
    expect(union).not.toMatch(/kind: 'about'/)
    expect(plan).not.toMatch(/<Card title="About"/)
  })
  it('is a page with a back arrow, and Settings and About push /settings and /about', () => {
    expect(plan).toMatch(/<Page title="About" className="aboutpage" back/)
    expect(plan).toMatch(/window\.history\.pushState\(\{ page \}, '', route/)
    expect(readFileSync('src/components/SettingsPage.tsx', 'utf8')).toMatch(/<Page title="Settings" className="setpage set2" back/)
  })
})
