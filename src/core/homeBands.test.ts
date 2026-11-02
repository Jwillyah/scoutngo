import { describe, expect, it } from 'vitest'

/*
 * THE HOME PAGE'S BAND PHOTOS GO PUBLIC, SO NOTHING RIDES WITH THEM (Batch F,
 * Section 1). Each WebP is under 60 KB and carries no EXIF, XMP or ICC chunk.
 * Only the WebPs ship (Batch G): the JPEG sources are out of the repository
 * and the build.
 */
const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync: (p: string) => Uint8Array; readdirSync: (p: string) => string[] }
const BANDS = ['light', 'tide', 'surf', 'wind']

function webpChunks(b: Uint8Array): string[] {
  const out: string[] = []
  for (let i = 12; i + 8 <= b.length; ) {
    out.push(String.fromCharCode(...b.slice(i, i + 4)))
    const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)
    i += 8 + len + (len & 1)
  }
  return out
}

describe('the home page band photos', () => {
  it.each(BANDS)('%s: a WebP under 60 KB with no metadata chunk', (name) => {
    const b = fs.readFileSync(`public/home/band-${name}.webp`)
    expect(b.length).toBeLessThan(60 * 1024)
    expect(String.fromCharCode(...b.slice(8, 12))).toBe('WEBP')
    const chunks = webpChunks(b)
    expect(chunks.length).toBeGreaterThan(0)
    for (const c of ['EXIF', 'XMP ', 'ICCP']) expect(chunks).not.toContain(c)
  })

  it('no JPEG in public/home: only the WebP bands ship', () => {
    expect(fs.readdirSync('public/home').filter((f) => /\.jpe?g$/i.test(f))).toEqual([])
  })
})
