import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CREDITS } from '../src/core/credits.ts'
import { HOSTS } from '../src/lib/hosts.ts'

/* Batch DRONE, Section 0.4 (CORE's 0.4, reverted): sources, licences, credits. The safety lines: tests/safetyLines.test.ts. */
describe('Data & credits', () => {
  it('every host the app asks has a row', () => {
    const covered = new Set(CREDITS.flatMap((c) => c.hosts))
    expect(HOSTS.map((h) => h.host).filter((h) => !covered.has(h))).toEqual([])
  })
  it('docs/sources-licenses.md is the same list (node scripts/write-sources-doc.ts)', () => {
    const doc = readFileSync('docs/sources-licenses.md', 'utf8')
    for (const c of CREDITS) expect(doc).toContain(`| ${c.name.replace(/\|/g, '\\|')} |`)
    expect((doc.match(/^\| .* \| \*\*(ok|fix|check)\*\*/gm) ?? []).length).toBe(CREDITS.length)
  })
  /* Not the landing: CORE's third footer link there wrapped it and pushed its buttons off screen (the reachability strike). */
  it('linked from every "How we got this" and Settings; /credits is a real address', () => {
    for (const f of ['src/components/PageShell.tsx', 'src/components/DetailShell.tsx', 'src/components/SettingsPage.tsx']) expect(readFileSync(f, 'utf8')).toContain('openCredits')
    expect(readFileSync('vercel.json', 'utf8')).toContain('"source": "/credits"')
  })
})

/*
 * THE LICENCE CHECK (Batch DRONE, Section 0.4). The app is MIT (LICENSE);
 * every package shipped to the phone (package.json dependencies) carries a
 * licence that allows that, read from its own package.json, else its LICENSE.
 */
const ALLOWED = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'CC0-1.0', 'OFL-1.1', '0BSD']
const licenceOf = (name: string): string => {
  const pkg = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { license?: string | { type?: string } }
  const field = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type
  if (field !== undefined) return field
  const text = readFileSync(`node_modules/${name}/LICENSE`, 'utf8')
  /* suncalc ships no field: its LICENSE is the two-clause BSD text. */
  return /Redistribution and use in source and binary forms/.test(text) && !/3\. Neither the name/.test(text) ? 'BSD-2-Clause' : 'unknown'
}
describe('licences', () => {
  it('the app is MIT, in LICENSE and package.json', () => {
    expect(readFileSync('LICENSE', 'utf8')).toMatch(/^MIT License/)
    expect((JSON.parse(readFileSync('package.json', 'utf8')) as { license?: string }).license).toBe('MIT')
  })
  it('every package shipped to the phone allows it', () => {
    const deps = Object.keys((JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }).dependencies)
    const bad = deps.map((d) => [d, licenceOf(d)]).filter(([, l]) => !ALLOWED.includes(l))
    expect(bad).toEqual([])
  })
})
