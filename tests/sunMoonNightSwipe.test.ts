import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Batch FIX, Section 5.2: the three are swipe pages', () => {
  /* The page shell needs a document (none in these tests): the source and the stylesheet are read; scripts/audit-overflow.mjs holds the row in WebKit (paged: data-sideways, snapping, whole pages). */
  const src = readFileSync('src/components/SunMoonNightPage.tsx', 'utf8')
  const css = readFileSync('src/styles/sky-sun-moon.css', 'utf8')
  it('one row marked data-sideways with a page each for Sun, Moon and Night, in the pill’s order', () => {
    expect(src).toMatch(/<div className="smn__track" ref=\{track\} data-sideways>/)
    expect([...src.matchAll(/data-smn-page="(\w+)"/g)].map((m) => m[1])).toEqual(['sun', 'moon', 'night'])
    expect(src).not.toMatch(/tab === 'sun' \? \(/)
  })
  it('the pill slides to its page; a swipe sets the pill', () => {
    expect(src).toMatch(/onClick=\{\(\) => go\(t\.id\)\}/)
    expect(src).toMatch(/el\.scrollTo\(\{ left: index\(t\) \* el\.clientWidth/)
    expect(src).toMatch(/TABS\[Math\.round\(el\.scrollLeft \/ Math\.max\(1, el\.clientWidth\)\)\]\?\.id/)
  })
  it('snaps a whole page at a time', () => {
    expect(css).toMatch(/\.smn__track \{[^}]*scroll-snap-type: x mandatory/)
    expect(css).toMatch(/\.smn__page \{[^}]*flex: 0 0 100%[^}]*scroll-snap-align: start/)
  })
})
