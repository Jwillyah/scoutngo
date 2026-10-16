import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE HARD RULE, HELD BY A TEST.
 *
 * "The app does not say an area is clear of hazards, in any wording, from any
 * source. It says what is marked. A drone meeting an unmarked wire is the
 * worst failure this app can have and it must be structurally impossible for
 * it to have promised otherwise."
 *
 * TWO THINGS ENFORCE IT AND THEY ARE DIFFERENT KINDS OF THING.
 *
 * The structural half is in src/core/siteMark.ts: there is no `isClear`, no
 * boolean, and no function that takes an area and returns a verdict about it.
 * There is nothing for a screen to render as reassurance, which is why that
 * file's tally returns counts and only counts.
 *
 * This file holds the other half, which is the WORDING. A sentence like "no
 * hazards in this area" needs no boolean to be written, and it would be just
 * as false. So the user-facing strings in every file that touches hazards are
 * scanned for the claim, in the phrasings someone would actually reach for.
 *
 * SCOPED TO THE HAZARD FILES on purpose. "Clear sightline" is a legitimate
 * claim about CLOUD, computed from a forecast in src/core/cloud.ts, and a
 * repo-wide ban on the word would either fail on that or teach the next person
 * to add exceptions until the rule means nothing.
 */

const ROOT = new URL('../src/', import.meta.url).pathname

/** Every file that renders, computes, or stores a hazard. */
const HAZARD_FILES = [
  'core/siteMark.ts',
  'core/sightline.ts',
  'core/leaf.ts',
  'lib/marks.ts',
  'lib/markLayer.ts',
  'lib/sightlineCopy.ts',
  'lib/overpass.ts',
  'components/HazardPanel.tsx',
]

/**
 * The claim, in the shapes it would actually be written in.
 *
 * Each is "a reassuring word about an area or a path", not the bare word: the
 * point is a sentence that tells the shooter somewhere is safe to fly.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\b(area|site|airspace|route|path|way|sightline|position)\s+is\s+clear\b/i, why: 'says somewhere is clear' },
  { pattern: /\bclear\s+of\s+(hazards?|obstructions?|wires?|obstacles?)\b/i, why: 'says clear of hazards' },
  { pattern: /\bno\s+(known\s+)?(hazards?|obstructions?|wires?|obstacles?)\b/i, why: 'says there are none' },
  { pattern: /\bnothing\s+in\s+the\s+way\b/i, why: 'says nothing is in the way' },
  { pattern: /\b(safe|clear)\s+to\s+fly\b/i, why: 'says it is safe to fly' },
  { pattern: /\b(hazard|obstruction)[- ]free\b/i, why: 'says hazard free' },
  { pattern: /\ball\s+clear\b/i, why: 'says all clear' },
  { pattern: /\bunobstructed\b/i, why: 'says unobstructed' },
]

/** Comments explain; they are not shown to anyone holding the phone. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

describe('nothing in the hazard path says an area is clear', () => {
  for (const relative of HAZARD_FILES) {
    const source = readFileSync(join(ROOT, relative), 'utf8')
    const code = withoutComments(source)

    it(`${relative} makes no such claim`, () => {
      for (const { pattern, why } of FORBIDDEN) {
        const hit = pattern.exec(code)
        expect(hit, `${relative} ${why}: "${hit?.[0] ?? ''}"`).toBeNull()
      }
    })
  }

  /* Every file listed above exists, or the scan is passing on nothing. */
  it('scans files that are really there', () => {
    for (const relative of HAZARD_FILES) {
      expect(statSync(join(ROOT, relative)).isFile(), relative).toBe(true)
    }
    expect(HAZARD_FILES.length).toBeGreaterThan(6)
  })

  /*
   * THE CHECK HAS TO BE ABLE TO FAIL, and it has to fail on the real shapes of
   * the sentence rather than on a word.
   */
  it('would catch the claim however it were phrased', () => {
    const wouldBeCaught = [
      'return "This area is clear."',
      'const msg = `No hazards within ${r} m.`',
      'label: "clear of obstructions"',
      'return "Nothing in the way."',
      'note = "safe to fly here"',
      'text: "hazard-free launch"',
      'say("All clear")',
      'summary: "unobstructed sightline"',
      'if (x) return "no known obstructions"',
    ]
    for (const line of wouldBeCaught) {
      expect(
        FORBIDDEN.some(({ pattern }) => pattern.test(line)),
        `missed: ${line}`,
      ).toBe(true)
    }
  })

  /* And it must not fire on the sentences the app is SUPPOSED to say. */
  it('allows saying what is marked', () => {
    const allowed = [
      'Nothing marked here yet.',
      '3 hazards and 1 note marked.',
      'Marked trees stand in the way of this shot.',
      'Dashed marks are what OpenStreetMap has mapped.',
      'only those are checked against sightlines',
    ]
    for (const line of allowed) {
      expect(
        FORBIDDEN.some(({ pattern }) => pattern.test(line)),
        `wrongly caught: ${line}`,
      ).toBe(false)
    }
  })

  /* The comment stripper really strips, or the scan is reading prose. */
  it('strips comments but keeps the strings', () => {
    const stripped = withoutComments(`/* the area is clear */ const a = "x" // all clear`)
    expect(stripped).not.toMatch(/area\s+is\s+clear/)
    expect(stripped).not.toMatch(/all clear/)
    expect(stripped).toContain('"x"')
  })
})

/**
 * AND THE STRUCTURAL HALF: there is no verdict to render.
 *
 * A boolean named for safety is the thing that makes the sentence easy to
 * write, so the field is banned as well as the phrase.
 */
describe('there is no safety verdict anywhere in the hazard path', () => {
  const BANNED_NAMES = /\b(isClear|isSafe|hazardFree|allClear|noHazards|clearOfHazards|safeToFly)\b/

  for (const relative of HAZARD_FILES) {
    it(`${relative} exposes no such value`, () => {
      const code = withoutComments(readFileSync(join(ROOT, relative), 'utf8'))
      expect(BANNED_NAMES.exec(code)?.[0] ?? null).toBeNull()
    })
  }

  it('would catch one if it were added', () => {
    expect(BANNED_NAMES.test('export function isClear(area) { return true }')).toBe(true)
    expect(BANNED_NAMES.test('const hazardFree = marks.length === 0')).toBe(true)
    /* And does not catch the things that are fine. */
    expect(BANNED_NAMES.test('const tally = tallyMarks(marks)')).toBe(false)
    expect(BANNED_NAMES.test('const blocked = blockers(input)')).toBe(false)
  })
})

/**
 * THE MODEL SEAM IS STILL EMPTY. Item 6c: "Note the seam, build nothing."
 * Nothing may produce a model-sourced mark until that pass is deliberately
 * written, and a proposal must never arrive confirmed.
 */
describe('nothing proposes a hazard yet', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sources(join(dir, entry.name))
        : /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')
          ? [join(dir, entry.name)]
          : [],
    )

  it('creates no mark with source "model" anywhere', () => {
    for (const file of sources(ROOT)) {
      const code = withoutComments(readFileSync(file, 'utf8'))
      expect(
        /source:\s*'model'/.test(code),
        `${file} creates a model-sourced mark; item 6c has not been built yet`,
      ).toBe(false)
    }
  })

  /* The check can fail, and the seam it guards really exists. */
  it('would catch one, and the field is there to be used later', () => {
    expect(/source:\s*'model'/.test("const m = { source: 'model' }")).toBe(true)
    const core = readFileSync(join(ROOT, 'core/siteMark.ts'), 'utf8')
    expect(core).toContain("'model'")
    expect(core).toContain('confirmed')
  })
})
