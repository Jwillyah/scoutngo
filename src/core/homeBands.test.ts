import { describe, expect, it } from 'vitest'

/*
 * THE HOME PAGE'S BAND PHOTOS GO PUBLIC, SO NOTHING RIDES WITH THEM (Batch F,
 * Section 1). Each WebP is under 60 KB and carries no EXIF, XMP or ICC chunk;
 * each JPEG source carries no APP1..APP15 segment (EXIF, GPS, XMP) and no
 * comment. scripts/strip-photo-metadata.mjs is what makes it so.
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

function jpegMarkers(b: Uint8Array): number[] {
  const out: number[] = []
  for (let i = 2; i + 4 <= b.length; ) {
    const m = b[i + 1]
    out.push(m)
    if (m === 0xda) break
    i += 2 + ((b[i + 2] << 8) | b[i + 3])
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

  it('every JPEG in public/home has no EXIF, GPS, XMP or comment segment', () => {
    const jpgs = fs.readdirSync('public/home').filter((f) => /\.jpe?g$/i.test(f))
    for (const f of jpgs) {
      const markers = jpegMarkers(fs.readFileSync(`public/home/${f}`))
      expect(markers.filter((m) => (m >= 0xe1 && m <= 0xef) || m === 0xfe), f).toEqual([])
    }
  })
})
