import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getSunPosition } from '../src/core/sun.ts'
import { planPosition } from '../src/lib/plan.ts'

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


/**
 * AND NO SILENT FALLBACK TO A DIFFERENT PIECE OF GEAR.
 *
 * The coordinate rule above has held since it was written. The same bug class
 * then lived for three reports in a different field:
 *
 *   const findLens = (kit, id) =>
 *     kit.lenses.find((l) => l.id === id) ?? kit.lenses[0] ?? DEFAULT_KIT.lenses[0]
 *
 * An id that could not be resolved was swapped for the first lens in the bag,
 * so a position carrying an aircraft optic read "Sigma 28-75 f2.8" on the card
 * while keeping the aircraft focal length. Null Island, for glass: not dropped,
 * not flagged, but RESOLVED into something that looked like a real answer.
 */
describe('optics never fall back to a different optic', () => {
  const OPTIC_SOURCES = ['src/lib/plan.ts', 'src/core/optics.ts', 'src/lib/revivePositions.ts']

  /*
   * `find(...) ?? kit.something`.
   *
   * Not paren-balanced, deliberately: the predicate inside find() contains its
   * own parens, and the first version of this pattern used [^)]* and therefore
   * matched nothing at all, including the line it was written to catch. The
   * self-check below is what caught that.
   */
  const FALLBACK = /\.find\([\s\S]{0,160}?\?\?\s*(kit|DEFAULT_KIT|profile)\./

  for (const file of OPTIC_SOURCES) {
    it(`${file} resolves an optic or refuses`, () => {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
      expect(FALLBACK.exec(source)?.[0] ?? null).toBeNull()
    })
  }

  /* The check has to be able to fail, on the exact line that was there. */
  it('would catch the line that caused three reports', () => {
    expect(
      FALLBACK.test(
        'const findLens = (kit, id) => kit.lenses.find((l) => l.id === id) ?? kit.lenses[0]',
      ),
    ).toBe(true)
    /* And does not fire on a resolve that refuses. */
    expect(
      FALLBACK.test('const lens = kit.lenses.find((l) => l.id === id)\nif (lens === undefined) throw'),
    ).toBe(false)
  })

  /*
   * THE POSITIVE HALF: an unresolvable optic stops rather than resolving to
   * something else. Asserted on behaviour, because the rule is about what
   * happens and not about a regex.
   */
  it('throws rather than substituting, on either platform', () => {
    const at = { lat: 36.7362, lon: -75.936 }
    const sun = getSunPosition(new Date('2026-10-18T22:00:00Z'), at.lat, at.lon)
    const base = {
      id: 'p', number: 1, at, focalLength: 24, shot: '', risk: '', angleRationale: '',
      coversShot: null, altitudeFeet: 0, shotType: 'framed' as const, yawDegrees: 0,
      moved: false, origin: 'manual' as const,
    }
    expect(() =>
      planPosition({ ...base, platform: 'ground', lensId: 'air-3s-wide' }, at, sun),
    ).toThrow(/not a lens in the kit/)
    expect(() =>
      planPosition({ ...base, platform: 'air', lensId: 'sigma-28-75' }, at, sun),
    ).toThrow(/not a camera on any aircraft/)
  })
})
