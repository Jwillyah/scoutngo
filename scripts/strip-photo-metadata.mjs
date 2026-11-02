/*
 * STRIP A JPEG OF EVERYTHING BUT THE PICTURE (Batch F, Section 1).
 *
 * Usage:  node scripts/strip-photo-metadata.mjs <photo.jpg> [more.jpg ...]
 * Writes: each file in place.
 *
 * Losslessly drops every APP1..APP15 segment (EXIF, GPS, XMP, ICC, Photoshop
 * IPTC, maker notes) and every comment; keeps APP0 (JFIF) and the image data.
 * The home page's band photos are the user's own and go public, so nothing
 * about where or when they were taken goes with them. The test that keeps it
 * so is src/core/homeBands.test.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs'

export function stripJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG')
  const out = [buf.subarray(0, 2)]
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error(`bad marker at ${i}`)
    const m = buf[i + 1]
    if (m === 0xda) {
      out.push(buf.subarray(i))
      break
    }
    const len = buf.readUInt16BE(i + 2)
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe
    if (!drop) out.push(buf.subarray(i, i + 2 + len))
    i += 2 + len
  }
  return Buffer.concat(out)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  for (const f of process.argv.slice(2)) {
    const before = readFileSync(f)
    const after = stripJpeg(before)
    writeFileSync(f, after)
    console.log(`${f}: ${before.length} -> ${after.length} bytes`)
  }
}
