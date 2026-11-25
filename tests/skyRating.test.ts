import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readPhotoFacts } from '../src/core/exif.ts'
import { formatClock } from '../src/core/timezone.ts'
import { forecastCall, OUTCOME_OF_RATING, parseFireLog, photoTakenAt, RATING_LABEL, RATING_LEVEL, RATINGS, ratingHit, trackRecord, withEntry, type FireEntry } from '../src/lib/fireLog.ts'

/*
 * BATCH SIMPLE-3, SECTIONS 3.5 AND 3.6: the sky's rating in five steps that
 * sit on the call's scale, and a photo that keeps only its Exif time and a
 * thumbnail, on this phone.
 */
const TZ = 'America/New_York'

describe('five steps, mapped for the hit rate', () => {
  it('Nothing · A little · Some · Good · Fired → Skip · Unlikely · Possible · Likely · Fire', () => {
    expect(RATINGS.map((r) => RATING_LABEL[r])).toEqual(['Nothing', 'A little', 'Some', 'Good', 'Fired'])
    expect(RATINGS.map((r) => RATING_LEVEL[r])).toEqual(['Skip', 'Unlikely', 'Possible', 'Likely', 'Fire'])
  })
  it('the old three-way outcome follows, so the truth loop and older entries still read', () => {
    expect(RATINGS.map((r) => OUTCOME_OF_RATING[r])).toEqual(['nothing', 'meh', 'meh', 'fired', 'fired'])
  })
  it('a hit is the rating on the call\'s step', () => {
    expect(RATINGS.filter((r) => ratingHit(r, 'Go'))).toEqual(['good', 'fired'])
    expect(RATINGS.filter((r) => ratingHit(r, 'Maybe'))).toEqual(['some'])
    expect(RATINGS.filter((r) => ratingHit(r, 'Skip'))).toEqual(['nothing', 'little'])
    expect([forecastCall('Color likely'), forecastCall('Color possible'), forecastCall('Color unlikely'), forecastCall('Fire possible'), forecastCall(null)]).toEqual(['Go', 'Maybe', 'Skip', 'Maybe', null])
  })
  it('one tap, changeable: a second rating replaces the first, and the hit rate counts it once', () => {
    const e = (rating: FireEntry['rating']): FireEntry => ({ id: '2026-11-23-sunset-AP', date: '2026-11-23', event: 'sunset', place: 'Atlantic Park Surf', outcome: OUTCOME_OF_RATING[rating ?? 'nothing'], forecast: 'Color likely', photo: null, rating })
    const log = withEntry(withEntry([], e('some')), e('fired'))
    expect(log).toHaveLength(1)
    expect(log[0].rating).toBe('fired')
    expect(trackRecord(log)).toMatchObject({ rated: 1, hits: 1 })
    expect(trackRecord(withEntry(log, e('little')))).toMatchObject({ rated: 1, hits: 0 })
  })
  it('kept and read back from the phone; a rating it does not know is dropped, the entry kept', () => {
    const kept = parseFireLog(JSON.stringify([{ id: 'x', date: '2026-11-23', event: 'sunset', place: 'P', outcome: 'fired', forecast: null, photo: null, rating: 'good', photoAt: 1 }, { id: 'y', date: '2026-11-22', event: 'sunset', place: 'P', outcome: 'meh', forecast: null, photo: null, rating: 'epic' }]))!
    expect(kept.map((x) => x.rating)).toEqual(['good', null])
    expect(kept[0].photoAt).toBe(1)
  })
})

/* A JPEG built byte by byte: the Exif block with DateTimeOriginal (and its offset when given), little-endian. */
function jpeg(wall: string, offset?: string): ArrayBuffer {
  const u16 = (n: number) => [n & 255, n >> 8]
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24]
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0)
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value]
  const exifAt = 8 + 2 + 12 + 4
  const n = offset === undefined ? 1 : 2
  const dataAt = exifAt + 2 + n * 12 + 4
  const wallBytes = ascii(wall)
  const offBytes = offset === undefined ? [] : ascii(offset)
  const tiff = [0x49, 0x49, ...u16(42), ...u32(8), ...u16(1), ...entry(0x8769, 4, 1, u32(exifAt)), ...u32(0), ...u16(n), ...entry(0x9003, 2, wallBytes.length, u32(dataAt))]
  if (offset !== undefined) tiff.push(...entry(0x9011, 2, offBytes.length, u32(dataAt + wallBytes.length)))
  tiff.push(...u32(0), ...wallBytes, ...offBytes)
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]).buffer
}

describe('the photo\'s time, from its Exif, on the phone', () => {
  it('a phone photo at 4:54 PM, no offset written: read in the spot\'s zone', () => {
    const at = photoTakenAt(readPhotoFacts(jpeg('2026:11:23 16:54:12')), TZ)
    expect(at).toBe(Date.parse('2026-11-23T21:54:12Z'))
    expect(`${formatClock(new Date(at!), TZ)} · saved on this phone ✓`).toBe('4:54 PM · saved on this phone ✓')
  })
  it('with its own offset, the offset wins', () => {
    expect(photoTakenAt(readPhotoFacts(jpeg('2026:11:23 16:54:12', '-05:00')), 'Europe/London')).toBe(Date.parse('2026-11-23T21:54:12Z'))
  })
  it('a picture with no Exif: no time, never a made-up one', () => {
    expect(photoTakenAt(readPhotoFacts(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), TZ)).toBeNull()
  })
})

describe('the Sky color log on screen', () => {
  const src = readFileSync('src/components/SkyFire.tsx', 'utf8')
  it('five buttons from RATINGS, an "Add photo" button, the raw input hidden', () => {
    expect(src).toMatch(/RATINGS\.map\(\(r\) =>/)
    expect(src).toMatch(/>\s*Add photo\s*</)
    expect(src).toMatch(/type="file" accept="image\/\*" hidden/)
    expect(src).not.toMatch(/\(\['fired', 'meh', 'nothing'\] as const\)/)
  })
  it('the photo never leaves the phone: no fetch, no upload in the log', () => {
    expect(src).not.toMatch(/fetch\([^)]*photo|FormData|sendBeacon/)
  })
})
