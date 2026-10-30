import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* docs/ux-rules.md is the list every run is checked against (Batch B, Section 0). */
const rules = readFileSync('docs/ux-rules.md', 'utf8')
const claude = readFileSync('CLAUDE.md', 'utf8')

describe('the UX rules', () => {
  it('are in the repo, numbered, with the proof rules last', () => {
    expect(rules.startsWith('# ScoutNGo · UX rules')).toBe(true)
    for (const n of [1, 2, 3, 7, 12, 14, 19, 24, 26, 27]) expect(rules).toMatch(new RegExp(`^${n}\\. `, 'm'))
    expect(rules).toMatch(/^26\. Contact sheet of every touched screen at 390 × 844/m)
  })

  it('are linked from CLAUDE.md, beside failure-modes', () => {
    expect(claude).toContain('docs/ux-rules.md')
  })

  it('have a contact-sheet script that refuses an empty sheet', () => {
    const script = readFileSync('scripts/contact-sheet.mjs', 'utf8')
    expect(script).toContain("process.exit(2)")
    expect(script).toContain('missing')
  })
})
