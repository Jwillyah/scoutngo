import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * UX RULE 28 (Batch K): show conditions, never instruct. Every string the
 * app can show lives in src/; none of them may tell the user what to do
 * about weather: no "get off the beach", "land the drone", "stay inside",
 * "seek shelter", "take cover", "head indoors", "move inland", "evacuate".
 */
const SAYS = /\b(get off the (beach|water)|land (the|your) drone|stay (inside|indoors)|seek shelter|take cover|head (inside|indoors)|go (inside|indoors)|move inland|evacuate|do not (swim|fly)|don['’]t (swim|fly))\b/i

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}

describe('rule 28: conditions, never instructions', () => {
  const all = files(new URL('../src', import.meta.url).pathname)
  it('looked at the app', () => {
    expect(all.length).toBeGreaterThan(100)
  })
  it('no string in src tells the user what to do about the weather', () => {
    const hits: string[] = []
    for (const f of all) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        /* Comments may quote the rule. */
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '')
        if (SAYS.test(code)) hits.push(`${f}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })
  it('the check can fail', () => {
    expect(SAYS.test('Lightning 8 mi WSW · seek shelter')).toBe(true)
    expect(SAYS.test('Lightning 8 mi WSW, 3 min ago')).toBe(false)
  })
})
