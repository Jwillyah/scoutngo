import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NO PERSONAL PHOTOGRAPH SHIPS (Batch C, 30 Oct; Batch C2, 1 Nov). The home
 * page's and the exposure playground's photos were the shooter's own. What is
 * in public/ is published with every deploy, so the rule is held here: no
 * photograph format in public/ at all. Icons are PNG and SVG and stay.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe('public/', () => {
  it('holds no photograph', () => {
    expect(files('public').filter((f) => /\.(jpe?g|webp|heic|avif)$/i.test(f))).toEqual([])
  })
})
