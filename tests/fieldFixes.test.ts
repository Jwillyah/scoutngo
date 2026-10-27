import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE FIELD TEST OF 27 OCT AT VIRGINIA BEACH, the halves that are about the
 * source and the stylesheet. Read as files, never through Vite, which hands
 * CSS and ?raw to vitest as an empty string (docs/failure-modes.md, B). Every
 * lookup asserts it found its text before asserting anything about it.
 */
const read = (path: string) => {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  expect(text.length).toBeGreaterThan(100)
  return text
}
const CSS = read('src/styles/app.css')
const rule = (selector: string) => {
  const at = CSS.indexOf(`\n${selector} {`)
  expect(at, `${selector} is in app.css`).toBeGreaterThan(-1)
  return CSS.slice(at, CSS.indexOf('}', at))
}

describe('map credits', () => {
  it("MapLibre's self-opening attribution box is gone; the credits are the app's own small i", () => {
    const map = read('src/components/MapView.tsx')
    expect(map).not.toMatch(/new maplibregl\.AttributionControl/)
    expect(map).toContain("button.className = 'credits__i'")
    expect(rule('.credits__i')).toMatch(/width: 28px/)
  })
})

describe('the offline mark', () => {
  it('is a dot, sized, never text over the date', () => {
    const body = rule('.topbar__offline')
    expect(body).toMatch(/width: 10px/)
    expect(body).toMatch(/border-radius: 50%/)
    expect(body).not.toMatch(/text-transform/)
  })
})
