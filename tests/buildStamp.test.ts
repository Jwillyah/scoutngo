import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* The shells are portals and do not render on the server: their source is read. The line's words: src/lib/buildOrigin.test.ts. */
describe('the build at the foot of every "How we got this" (Batch DRONE, Section 0.2)', () => {
  it('both shells put the version line, with its time, inside the sheet', () => {
    for (const shell of ['DetailShell', 'PageShell']) {
      const src = readFileSync(new URL(`../src/components/${shell}.tsx`, import.meta.url), 'utf8')
      const sheet = src.slice(src.indexOf('className="dhow__body"'))
      expect(sheet.slice(0, 400), shell).toContain('<p className="dhow__build num">{versionLine()}</p>')
    }
  })
})
