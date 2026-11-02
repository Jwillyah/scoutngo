import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NO PERSONAL PHOTOGRAPH SHIPS (Batch C, 30 Oct; Batch C2, 1 Nov). The home
 * page's and the exposure playground's photos were the shooter's own. What is
 * in public/ is published with every deploy, so the rule is held here: no
 * photograph format in public/ at all. Icons are PNG and SVG and stay.
 *
 * ONE EXCEPTION, ASKED FOR BY NAME (Batch F, Section 1, 1 Nov): the home
 * page's four band photos in public/home/, which the owner chose to publish,
 * each stripped of every byte of metadata (src/core/homeBands.test.ts). Only
 * those names; anything else is still refused. Since Batch G only the four
 * WebP bands: the full-size JPEG sources went out of the repository and the
 * build (about 2 MB the page never used).
 */
const HOME_BANDS = new Set(['light', 'tide', 'surf', 'wind'].map((b) => `public/home/band-${b}.webp`))

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe('public/', () => {
  it('holds no photograph', () => {
    expect(files('public').filter((f) => /\.(jpe?g|webp|heic|avif)$/i.test(f) && !HOME_BANDS.has(f.split('\\').join('/')))).toEqual([])
  })
  it('public/home holds the four WebP bands and nothing else', () => {
    expect(files('public/home').map((f) => f.split('\\').join('/')).sort()).toEqual([...HOME_BANDS].sort())
  })
})

/*
 * THE COMPARE SCRIPTS' ORIGINALS (Batch G, docs/compare.md): DJI files carry
 * GPS and the drone's serial. They go in compare-input/, which git ignores.
 */
describe('compare-input/', () => {
  it('is ignored by git, so an original photo cannot be committed', () => {
    const ignored = execFileSync('git', ['check-ignore', 'compare-input/DJI_20261027073735_0094_D.JPG']).toString().trim()
    expect(ignored).toBe('compare-input/DJI_20261027073735_0094_D.JPG')
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^compare-input\/$/m)
  })
})
