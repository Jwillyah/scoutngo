import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * NO SILENT FALLBACK TO A COORDINATE.
 *
 * A position whose coordinate cannot be resolved must fail where it fails. It
 * used to default to { lat: 0, lon: 0 }, which is Null Island: a real point on
 * the map, so the position was not dropped or flagged but PLACED, and then
 * fitAll framed it. The result looked exactly like a planning result, with
 * markers piled in a corner of a view zoomed out to span an ocean.
 *
 * This is a source check rather than a behavioural one on purpose. The
 * behaviour is "something impossible happened", which is awkward to provoke and
 * easy to reintroduce by reflex while fixing something else. The pattern is
 * what must never come back.
 */
const SOURCES = [
  'src/App.tsx',
  'src/components/MapView.tsx',
  'src/lib/plan.ts',
  'src/lib/positions.ts',
]

describe('coordinates never fall back to a default point', () => {
  for (const file of SOURCES) {
    it(`${file} has no zero-coordinate fallback`, () => {
      const source = readFileSync(file, 'utf8')
      const offending = source
        .split('\n')
        .map((line: string, i: number) => ({ line: line.trim(), n: i + 1 }))
        // A comment explaining the old bug is not the old bug.
        .filter(({ line }: { line: string }) => !line.startsWith('*') && !line.startsWith('//'))
        .filter(({ line }: { line: string }) =>
          /\?\?\s*\{\s*lat:\s*0\s*,\s*lon:\s*0\s*\}/.test(line) ||
          /\|\|\s*\{\s*lat:\s*0\s*,\s*lon:\s*0\s*\}/.test(line) ||
          /lat:\s*0\s*,\s*lon:\s*0/.test(line),
        )
      expect(offending).toEqual([])
    })
  }

  /*
   * And the positive half: an unresolvable set has to stop the generate rather
   * than place what it managed.
   */
  it('refuses the whole plan when the unprojection comes back short', () => {
    const source = readFileSync('src/App.tsx', 'utf8')
    expect(source).toContain('coords.length !== parsed.positions.length')
    expect(source).toMatch(/Nothing was placed/)
  })
})
