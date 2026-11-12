import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * A FAILED FETCH IS NEVER SAVED BY THE SERVICE WORKER (8 Nov, flaky 5G). Every
 * cache.put in src/sw/sw.ts is behind a check that the answer was OK, so a
 * refused or failed answer can never be served later as the app.
 */
describe('the service worker caches only good answers', () => {
  it('every cache.put is guarded by .ok', () => {
    const src = readFileSync('src/sw/sw.ts', 'utf8')
    const puts = [...src.matchAll(/cache\.put\(/g)].map((m) => m.index ?? 0)
    expect(puts.length).toBeGreaterThan(0)
    for (const at of puts) {
      const before = src.slice(Math.max(0, at - 260), at)
      /* keepAsset (src/sw/shellRoutes.ts) checks .ok first, then that an asset is not the document (Batch TRUTH). */
      expect(before, src.slice(at, at + 80)).toMatch(/\.ok\)|!\w+\.ok\)|keepAsset\(/)
    }
  })
})
