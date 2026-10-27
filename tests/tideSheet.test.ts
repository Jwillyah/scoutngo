import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* The Tide sheet closes with the Card's own close (.card2__x), which always shows. Read as a file (docs/failure-modes.md, B). */
describe('the Tide sheet stylesheet', () => {
  const css = readFileSync(new URL('../src/styles/app.css', import.meta.url), 'utf8')
  it("closes with the Card's own close button, which is never hidden", () => {
    const sheet = readFileSync(new URL('../src/components/TideSheet.tsx', import.meta.url), 'utf8')
    expect(sheet).toMatch(/className="card2__x"[^>]*aria-label="Back to the shoot"/)
    const at = css.indexOf('\n.card2__x {')
    expect(at).toBeGreaterThan(-1)
    expect(css.slice(at, css.indexOf('}', at))).not.toMatch(/display: none/)
  })
  it('draws the tide in the tide colour, never the hazard red', () => {
    const at = css.indexOf('\n.tides__line {')
    expect(at).toBeGreaterThan(-1)
    const body = css.slice(at, css.indexOf('}', at))
    expect(body).toMatch(/var\(--tide\)/)
    expect(body).not.toMatch(/hazard|#ff3b30/i)
  })
})
