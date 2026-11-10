import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * ONE NAME EACH (Batch QA, Section 2; docs/words.md). Every string literal
 * and JSX text in the components and the code that words things, checked for
 * the banned variants. Comments are skipped: they may say what a thing used
 * to be called.
 */
const BANNED: [RegExp, string][] = [
  [/\bSky fire\b/, 'Sky color'],
  [/\bSunset color\b/, 'Sky color'],
  [/\bFire (likely|possible|unlikely)\b/, 'Color likely / possible / unlikely'],
  [/\bTmrw\b|\bTom\.\s/, 'Tomorrow'],
  [/\d\s?(Am|Pm|a\.m\.|p\.m\.)\b/, 'AM / PM'],
  [/\bdid not load\b|\bfailed to load\b/i, "didn't load"],
  [/\bkts\b/, 'kt'],
  [/\bPre-flight\b/, 'Preflight'],
]
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []))
/* Strings only: '…', "…", `…` and JSX text between > and <, with comments taken out first. */
const strings = (src: string): string[] => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  return [...code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[0])
}

describe('the word list', () => {
  for (const dir of ['src/components', 'src/core', 'src/lib']) {
    it(`${dir}: no banned variant in what the app shows`, () => {
      const hits: string[] = []
      for (const f of files(dir)) for (const s of strings(readFileSync(f, 'utf8'))) for (const [re, say] of BANNED) if (re.test(s)) hits.push(`${f}: ${s.slice(0, 70)} (say "${say}")`)
      expect(hits).toEqual([])
    })
  }
})
