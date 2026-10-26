import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * suncalc 2.0.2's getMoonTimes scans the UTC day, not the venue's; see
 * src/core/moonTimes.ts. That file is the one place it may be called.
 */
describe('one caller of getMoonTimes', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n: string) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))
  it('nothing else in src calls suncalc’s UTC-day getMoonTimes', () => {
    const callers = walk('src')
      .filter((f) => /\.(ts|tsx)$/.test(f) && f !== join('src', 'core', 'moonTimes.ts') && !f.endsWith('moonTimes.test.ts'))
      .filter((f) => /\bgetMoonTimes\b/.test(readFileSync(f, 'utf8')))
    expect(callers).toEqual([])
  })
})
