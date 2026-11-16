import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/* Batch CORE, Section 7A: every page loaded on demand goes through src/lib/lazyPage.ts (the fallback itself: src/lib/lazyPage.test.ts). */
describe('pages loaded on demand', () => {
  it('none is a bare lazy()', () => {
    for (const f of ['src/App.tsx', 'src/components/PlanMode.tsx', 'src/components/Home.tsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/= lazy\(/)
      expect(src, f).toMatch(/= lazyPage\(/)
    }
  })
})
