/*
 * WHEN AND WHERE A PHOTO WAS TAKEN, READ ON THE PHONE (Batch Polish,
 * Section 6). Only two things from a JPEG's Exif block: the time it was
 * taken (DateTimeOriginal, with OffsetTimeOriginal when the camera wrote
 * one) and, when present, its position (GPS), which the report uses to pick
 * the nearest saved spot and then drops. Nothing else is read; the photo is
 * never kept, stored or sent (src/components/FieldReportCard.tsx).
 *
 * No library: the Exif layout is a TIFF header and two or three IFDs, a
 * hundred lines. A file that is not a JPEG with Exif reads as nothing.
 */

export interface PhotoFacts {
  /** When it was taken, ms; null when the photo did not say. */
  at: number | null
  /** True when the time carried its own offset; false when it was the camera's wall clock (read in the venue's zone by the caller). */
  atHasOffset: boolean
  /** The wall clock as written ("2026:11:10 07:12:31"), for a caller that resolves it in a zone. */
  wallClock: string | null
  /** Where, when the photo carried a position; never stored. */
  where: { lat: number; lon: number } | null
}

const NOTHING: PhotoFacts = { at: null, atHasOffset: false, wallClock: null, where: null }

export function readPhotoFacts(buf: ArrayBuffer): PhotoFacts {
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return NOTHING
  let off = 2
  while (off + 4 <= v.byteLength) {
    if (v.getUint8(off) !== 0xff) return NOTHING
    const marker = v.getUint8(off + 1)
    const size = v.getUint16(off + 2)
    if (marker === 0xe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 /* "Exif" */) return readTiff(v, off + 10, size - 8)
    if (marker === 0xda) return NOTHING
    off += 2 + size
  }
  return NOTHING
}

function readTiff(v: DataView, start: number, length: number): PhotoFacts {
  if (start + 8 > v.byteLength) return NOTHING
  const little = v.getUint16(start) === 0x4949
  const u16 = (o: number) => v.getUint16(start + o, little)
  const u32 = (o: number) => v.getUint32(start + o, little)
  const inside = (o: number, n: number) => o >= 0 && start + o + n <= v.byteLength && o + n <= length
  /* One IFD's entries as tag → { type, count, value offset }. */
  const ifd = (o: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>()
    if (!inside(o, 2)) return out
    const n = u16(o)
    for (let i = 0; i < n; i += 1) {
      const e = o + 2 + i * 12
      if (!inside(e, 12)) break
      const type = u16(e + 2)
      const count = u32(e + 4)
      const bytes = count * ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] ?? 1)
      out.set(u16(e), { type, count, at: bytes <= 4 ? e + 8 : u32(e + 8) })
    }
    return out
  }
  const ascii = (t: { count: number; at: number } | undefined): string | null => {
    if (t === undefined || !inside(t.at, t.count)) return null
    let s = ''
    for (let i = 0; i < t.count; i += 1) {
      const c = v.getUint8(start + t.at + i)
      if (c === 0) break
      s += String.fromCharCode(c)
    }
    return s
  }
  const rationals = (t: { count: number; at: number } | undefined): number[] | null => {
    if (t === undefined || !inside(t.at, t.count * 8)) return null
    return Array.from({ length: t.count }, (_, i) => {
      const den = u32(t.at + i * 8 + 4)
      return den === 0 ? NaN : u32(t.at + i * 8) / den
    })
  }
  if (u16(2) !== 42) return NOTHING
  const ifd0 = ifd(u32(4))
  const exifAt = ifd0.get(0x8769)
  const gpsAt = ifd0.get(0x8825)
  const exif = exifAt === undefined ? new Map() : ifd(u32(exifAt.at))
  const gps = gpsAt === undefined ? new Map() : ifd(u32(gpsAt.at))

  const wall = ascii(exif.get(0x9003)) ?? ascii(ifd0.get(0x0132))
  const offset = ascii(exif.get(0x9011))
  const m = wall === null ? null : /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(wall)
  const o = offset === null ? null : /^([+-])(\d{2}):(\d{2})$/.exec(offset)
  const at = m === null || o === null ? null : Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - (o[1] === '-' ? -1 : 1) * (+o[2] * 60 + +o[3]) * 60_000

  const dms = (r: number[] | null) => (r === null || r.length < 3 || r.some((x) => !Number.isFinite(x)) ? null : r[0] + r[1] / 60 + r[2] / 3600)
  const lat = dms(rationals(gps.get(0x0002)))
  const lon = dms(rationals(gps.get(0x0004)))
  const latRef = ascii(gps.get(0x0001))
  const lonRef = ascii(gps.get(0x0003))
  const where = lat === null || lon === null ? null : { lat: latRef === 'S' ? -lat : lat, lon: lonRef === 'W' ? -lon : lon }
  return { at, atHasOffset: at !== null, wallClock: m === null ? null : m[0], where }
}
