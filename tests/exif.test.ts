import { describe, expect, it } from 'vitest'
import { readPhotoFacts } from '../src/core/exif.ts'

/*
 * Batch Polish, Section 6: when and where a photo was taken, read on the
 * phone. A JPEG built byte by byte here (a fixture, not a photo): the Exif
 * block with the time, its offset and a position, little-endian as phones
 * write it.
 */
function jpeg(opts: { wall?: string; offset?: string; lat?: [number, number, number]; lon?: [number, number, number]; latRef?: string; lonRef?: string; bigEndian?: boolean }): ArrayBuffer {
  const le = !opts.bigEndian
  const tiff: number[] = []
  const u16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255])
  const u32 = (n: number) => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0)
  /* Layout: header (8) · IFD0 at 8 (2 entries) · Exif IFD · GPS IFD · data. */
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value]
  const ifd0At = 8
  const exifAt = ifd0At + 2 + 2 * 12 + 4
  const exifEntries = (opts.wall ? 1 : 0) + (opts.offset ? 1 : 0)
  const gpsAt = exifAt + 2 + exifEntries * 12 + 4
  const gpsEntries = opts.lat ? 4 : 0
  let dataAt = gpsAt + 2 + gpsEntries * 12 + 4
  const data: number[] = []
  const put = (bytes: number[]) => {
    const at = dataAt + data.length
    data.push(...bytes)
    return at
  }
  const rat = (xs: [number, number, number]) => xs.flatMap((x) => [...u32(Math.round(x * 100)), ...u32(100)])
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At))
  tiff.push(...u16(2), ...entry(0x8769, 4, 1, u32(exifAt)), ...entry(0x8825, 4, 1, u32(gpsAt)), ...u32(0))
  const exif: number[] = [...u16(exifEntries)]
  if (opts.wall) exif.push(...entry(0x9003, 2, opts.wall.length + 1, u32(put(ascii(opts.wall)))))
  if (opts.offset) exif.push(...entry(0x9011, 2, opts.offset.length + 1, u32(put(ascii(opts.offset)))))
  exif.push(...u32(0))
  tiff.push(...exif)
  const gps: number[] = [...u16(gpsEntries)]
  if (opts.lat && opts.lon) {
    gps.push(...entry(0x0001, 2, 2, [...ascii(opts.latRef ?? 'N'), 0, 0]))
    gps.push(...entry(0x0002, 5, 3, u32(put(rat(opts.lat)))))
    gps.push(...entry(0x0003, 2, 2, [...ascii(opts.lonRef ?? 'W'), 0, 0]))
    gps.push(...entry(0x0004, 5, 3, u32(put(rat(opts.lon)))))
  }
  gps.push(...u32(0))
  tiff.push(...gps, ...data)
  void dataAt
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]
  return new Uint8Array(bytes).buffer
}

describe('a photo’s time and place, read on the phone', () => {
  it('the time, with its offset: S-Turns, 7:12 AM EST on 10 Nov', () => {
    const f = readPhotoFacts(jpeg({ wall: '2026:11:10 07:12:31', offset: '-05:00' }))
    expect(f.at).toBe(Date.parse('2026-11-10T12:12:31Z'))
    expect(f.atHasOffset).toBe(true)
    expect(f.where).toBeNull()
  })
  it('without an offset: the wall clock, for the caller to read in the venue’s zone', () => {
    const f = readPhotoFacts(jpeg({ wall: '2026:11:10 07:12:31' }))
    expect(f.at).toBeNull()
    expect(f.wallClock).toBe('2026:11:10 07:12:31')
  })
  it('the position, degrees minutes seconds, south and west signed', () => {
    const f = readPhotoFacts(jpeg({ wall: '2026:11:10 07:12:31', offset: '-05:00', lat: [35, 36, 30.6], lon: [75, 27, 55.8] }))
    expect(f.where?.lat).toBeCloseTo(35.6085, 3)
    expect(f.where?.lon).toBeCloseTo(-75.4655, 3)
  })
  it('big-endian (some cameras) reads the same', () => {
    const f = readPhotoFacts(jpeg({ wall: '2026:11:10 07:12:31', offset: '-05:00', bigEndian: true }))
    expect(f.at).toBe(Date.parse('2026-11-10T12:12:31Z'))
  })
  it('not a JPEG, or a JPEG with no Exif: nothing', () => {
    expect(readPhotoFacts(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer).at).toBeNull()
    expect(readPhotoFacts(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toEqual({ at: null, atHasOffset: false, wallClock: null, where: null })
  })
})

describe('a photo prefills a report (Batch Polish, Section 6)', () => {
  it('its time, and the nearest spot within 3 km; the position is not kept', async () => {
    const { photoPrefill, choice } = await import('../src/lib/photoReport.ts')
    const here = choice('S-Turns', { lat: 35.6085, lon: -75.4655 })
    const mirlo = choice('Mirlo Beach', { lat: 35.6002, lon: -75.4639 })
    const facts = readPhotoFacts(jpeg({ wall: '2026:11:10 07:12:31', offset: '-05:00', lat: [35, 36, 0.5], lon: [75, 27, 50] }))
    const p = photoPrefill(facts, here, [mirlo], 'America/New_York')
    expect(p.at).toBe(Date.parse('2026-11-10T12:12:31Z'))
    expect(p.spot?.name).toBe('Mirlo Beach')
    /* The photo's own position (35.60014, -75.46389) is nowhere in it; the spot's key is the spot's. */
    expect(JSON.stringify(p)).not.toMatch(/35\.600|75\.463/)
  })
  it('the camera’s wall clock read in the spot’s zone when it wrote no offset', async () => {
    const { photoPrefill, choice } = await import('../src/lib/photoReport.ts')
    const p = photoPrefill(readPhotoFacts(jpeg({ wall: '2026:11:10 07:12:31' })), choice('S-Turns', { lat: 35.6085, lon: -75.4655 }), [], 'America/New_York')
    expect(p.at).toBe(Date.parse('2026-11-10T12:12:00Z'))
    expect(p.spot).toBeNull()
  })
  it('far from every spot: no spot, and it says so', async () => {
    const { photoPrefill, choice } = await import('../src/lib/photoReport.ts')
    const p = photoPrefill(readPhotoFacts(jpeg({ wall: '2026:11:10 07:12:31', offset: '-05:00', lat: [36, 50, 0], lon: [75, 58, 0] })), choice('S-Turns', { lat: 35.6085, lon: -75.4655 }), [], 'America/New_York')
    expect(p.spot).toBeNull()
    expect(p.note).toContain('not near a spot you have')
  })
})
