import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NOTHING ABOUT THE USER IN A REQUEST (18 Nov, after Batch SIMPLE-1).
 *
 * While diagnosing search, two throwaway scripts sent a User-Agent holding the
 * owner's email to Photon and Nominatim. The rule since (CLAUDE.md, Privacy):
 * the app, the api/ functions and every script identify as the project, never
 * as a person. Every User-Agent written in the code is the one string below,
 * and no email address appears in the code except the two placeholders named.
 */
const IDENTITY = 'ScoutNGo (+https://github.com/Jwillyah/scoutngo)'
const ROOTS = ['src', 'scripts', 'api', 'tests']
const PLACEHOLDER_EMAIL: Readonly<Record<string, string>> = {
  'privacy@example.com': 'the privacy page’s placeholder contact',
}
const PLACEHOLDER_DOMAIN = /@scoutngo\.local$/

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'data' || name === 'fixtures' ? [] : files(p)
    return /\.(m?[jt]sx?|sh)$/.test(name) ? [p] : []
  })
const all = ROOTS.flatMap((r) => {
  try {
    return files(r)
  } catch {
    return []
  }
}).filter((p) => p !== join('tests', 'requestIdentity.test.ts'))

describe('requests carry the project, not a person', () => {
  it('reads a real tree', () => {
    expect(all.length).toBeGreaterThan(100)
    expect(all.some((p) => p.startsWith('scripts'))).toBe(true)
  })

  it('every User-Agent the code sets is the project identity', () => {
    const wrong: string[] = []
    let seen = 0
    for (const p of all) {
      const text = readFileSync(p, 'utf8')
      for (const m of text.matchAll(/['"]user-agent['"]\s*:\s*(['"`])([^'"`]*)\1/gi)) {
        seen += 1
        if (m[2] !== IDENTITY) wrong.push(`${p}: ${m[2]}`)
      }
      for (const m of text.matchAll(/\bconst UA\s*=\s*(['"`])([^'"`]*)\1/g)) {
        seen += 1
        if (m[2] !== IDENTITY) wrong.push(`${p}: ${m[2]}`)
      }
    }
    expect(seen).toBeGreaterThan(5)
    expect(wrong).toEqual([])
  })

  it('no email address is written in the code but the placeholders', () => {
    const found: string[] = []
    for (const p of all) {
      for (const m of readFileSync(p, 'utf8').matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,}/g)) {
        if (!(m[0] in PLACEHOLDER_EMAIL) && !PLACEHOLDER_DOMAIN.test(m[0])) found.push(`${p}: ${m[0]}`)
      }
    }
    expect(found).toEqual([])
  })
})
