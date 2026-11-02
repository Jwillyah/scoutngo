import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE OLD GLOBE IS GONE, NAME AND ALL (Batch F, Section 5). Batch D replaced
 * it with the three.js scene; the five measuring scripts that still drove it
 * are deleted (their results stay in measurements/), and no source, script,
 * doc or dependency names it.
 */
const NAME = ['ces', 'ium'].join('')
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe('no globe library left', () => {
  it('no file in src/, scripts/, docs/ or tests/ names it', () => {
    const named = ['src', 'scripts', 'docs', 'tests']
      .flatMap(files)
      .filter((f) => /\.(ts|tsx|mjs|js|md|json|css|sh)$/.test(f))
      .filter((f) => readFileSync(f, 'utf8').toLowerCase().includes(NAME))
    expect(named).toEqual([])
  })

  it('no dependency on it', () => {
    expect(readFileSync('package.json', 'utf8').toLowerCase()).not.toContain(NAME)
  })

  it('the five scripts that drove it are deleted', () => {
    for (const s of ['measure-3d-look', 'measure-3d-light', 'measure-3d-shadows', 'measure-cinema', 'measure-terrain-coast']) expect(existsSync(`scripts/${s}.mjs`), s).toBe(false)
  })
})
