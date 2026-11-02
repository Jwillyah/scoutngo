import { readdirSync, statSync } from 'node:fs'
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
 * those eight names; anything else is still refused.
 */
const HOME_BANDS = new Set(['light', 'tide', 'surf', 'wind'].flatMap((b) => [`public/home/band-${b}.jpg`, `public/home/band-${b}.webp`]))

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
})
