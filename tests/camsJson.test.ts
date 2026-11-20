import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCams, camsJsonText } from '../scripts/build-cams.mjs'
import type { CamEntry } from '../src/core/camPick.ts'
import { distanceMeters } from '../src/core/geo.ts'

/*
 * src/data/cams.json (Batch SIMPLE-2, Section 6): one list, tags, facing, and
 * whether the app may show the image. Its facts live in the files
 * scripts/build-cams.mjs joins; this holds the join to them.
 */
interface CamSource { id: string; name: string; terms: string; embed: boolean }
interface HandTag { tags: string[]; facingToward?: string; why: string }
const CAMS = JSON.parse(readFileSync('src/data/cams.json', 'utf8')) as CamEntry[]
const SOURCES = JSON.parse(readFileSync('data/cam-sources.json', 'utf8')) as CamSource[]
const HAND = JSON.parse(readFileSync('data/cam-tags.json', 'utf8')) as { tags: Record<string, HandTag>; added: { id: string; why: string }[] }
const sourceOf = new Map(SOURCES.map((s) => [s.id, s]))

describe('src/data/cams.json', () => {
  it('is what scripts/build-cams.mjs makes from its inputs today (run it after any edit)', () => {
    expect(readFileSync('src/data/cams.json', 'utf8')).toBe(camsJsonText(buildCams()))
  })

  it('has the coast list and the VDOT list in it, so the checks below look at something', () => {
    expect(CAMS.length).toBeGreaterThan(700)
    expect(CAMS.filter((c) => c.source === 'vdot').length).toBeGreaterThan(400)
    expect(CAMS.filter((c) => c.tags.includes('surf')).length).toBeGreaterThan(200)
  })

  it('every entry is well formed: unique id, https, tags from the three, facing null or a bearing', () => {
    expect(new Set(CAMS.map((c) => c.id)).size).toBe(CAMS.length)
    for (const c of CAMS) {
      expect(c.url, c.id).toMatch(/^https:\/\//)
      expect(c.tags.length, c.id).toBeGreaterThan(0)
      for (const t of c.tags) expect(['sky', 'surf', 'road'], c.id).toContain(t)
      if (c.facing === null) expect(c.facingIs, c.id).toBeNull()
      else {
        expect(c.facing, c.id).toBeGreaterThanOrEqual(0)
        expect(c.facing, c.id).toBeLessThan(360)
        expect(['sea', 'name'], c.id).toContain(c.facingIs)
      }
    }
  })

  it("every cam's embed is its source's verdict, and every source is on record", () => {
    for (const c of CAMS) {
      const s = sourceOf.get(c.source)
      expect(s, `${c.id}: source ${c.source}`).toBeDefined()
      expect(c.embed, c.id).toBe(s?.embed)
    }
  })

  it('Surfline and Surfchex are never embedded', () => {
    const theirs = CAMS.filter((c) => /surfline|surfchex/i.test(`${c.source} ${c.operator} ${c.url}`))
    expect(theirs.length).toBeGreaterThan(50)
    for (const c of theirs) expect(c.embed, c.id).toBe(false)
    expect(sourceOf.get('surfline')?.embed).toBe(false)
    expect(sourceOf.get('surfchex')?.embed).toBe(false)
  })

  it("a VDOT cam's facing never comes from its lane label: only from a hand tag that cites its name", () => {
    for (const c of CAMS.filter((x) => x.source === 'vdot' && x.facing !== null)) {
      expect(HAND.tags[c.id]?.facingToward, c.id).toBeDefined()
      expect(c.facingIs, c.id).toBe('name')
    }
  })

  it('every hand tag and every added cam says why', () => {
    for (const [id, t] of Object.entries(HAND.tags)) expect(t.why.length, id).toBeGreaterThan(10)
    for (const a of HAND.added) expect(a.why.length, a.id).toBeGreaterThan(10)
  })

  /* Hand-tagged means looked at: every sky cam within 30 km of Chic's Beach has a reviewed tag. */
  it('every sky cam around Virginia Beach was tagged by hand', () => {
    const CHICS = { lat: 36.92, lon: -76.1 }
    const near = CAMS.filter((c) => c.tags.includes('sky') && distanceMeters(CHICS, { lat: c.lat, lon: c.lon }) <= 30_000)
    expect(near.length).toBeGreaterThan(5)
    const reviewed = new Set([...Object.keys(HAND.tags), ...HAND.added.map((a) => a.id)])
    expect(near.map((c) => c.id).filter((id) => !reviewed.has(id))).toEqual([])
  })

  it('"Toward Berkley Bridge" faces the Berkley Bridge: the bearing is computed, about NNE', () => {
    const c = CAMS.find((x) => x.id === 'vdot-2298')
    expect(c?.facing).toBeGreaterThan(5)
    expect(c?.facing).toBeLessThan(30)
  })
})

describe('docs/sources-licenses.md, the cam sources', () => {
  const doc = readFileSync('docs/sources-licenses.md', 'utf8')
  it('lists every source with its terms link and verdict (node scripts/write-sources-doc.ts)', () => {
    expect(doc).toContain('## Cam sources')
    for (const s of SOURCES) {
      const row = doc.split('\n').find((l) => l.startsWith(`| ${s.name} |`))
      expect(row, s.id).toBeDefined()
      expect(row, s.id).toContain(s.terms)
      expect(row, s.id).toContain(`| embed: ${s.embed} |`)
    }
  })
})
