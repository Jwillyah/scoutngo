import { describe, expect, it } from 'vitest'
import { isStitched, photoFov, placeable, readPhotoMeta, takenParts } from './photoMeta.ts'

/* A JPEG made by hand: SOI, an EXIF APP1 (little-endian TIFF), optionally DJI's XMP, then SOS. */
function jpeg(opts: { gps?: boolean; xmp?: boolean; exif?: boolean; pano?: boolean }): ArrayBuffer {
  const bytes: number[] = [0xff, 0xd8]
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff]
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
  if (opts.exif !== false) {
    /* TIFF: header, IFD0 (Make, ExifIFD, GPSIFD), Exif IFD (DateTimeOriginal, FocalLength, FocalLengthIn35mmFilm), GPS IFD. */
    const tiff: number[] = []
    const strings: number[] = []
    const make = 'DJI\0'
    const taken = '2026:10:27 07:37:35\0'
    const ifd0At = 8
    const ifd0 = 3
    const exifAt = ifd0At + 2 + 12 * ifd0 + 4
    const exifN = 3
    const gpsAt = exifAt + 2 + 12 * exifN + 4
    const gpsN = opts.gps === true ? 4 : 0
    const dataAt = gpsAt + 2 + 12 * gpsN + 4
    const entry = (tag: number, type: number, count: number, val: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...val]
    let data = dataAt
    const place = (b: number[]) => {
      const at = data
      strings.push(...b)
      data += b.length
      return at
    }
    const takenAt = place([...taken].map((c) => c.charCodeAt(0)))
    const focalAt = place([...u32(1935), ...u32(100)])
    const latAt = place([...u32(36), ...u32(1), ...u32(49), ...u32(1), ...u32(5110), ...u32(100)])
    const lonAt = place([...u32(75), ...u32(1), ...u32(57), ...u32(1), ...u32(5806), ...u32(100)])
    tiff.push(0x49, 0x49, 0x2a, 0x00, ...u32(ifd0At))
    tiff.push(...u16(ifd0), /* Four bytes or fewer sit in the entry itself. */ ...entry(0x010f, 2, make.length, [...make].map((c) => c.charCodeAt(0))), ...entry(0x8769, 4, 1, u32(exifAt)), ...entry(0x8825, 4, 1, u32(gpsAt)), ...u32(0))
    tiff.push(...u16(exifN), ...entry(0x9003, 2, taken.length, u32(takenAt)), ...entry(0x920a, 5, 1, u32(focalAt)), ...entry(0xa405, 3, 1, [...u16(70), 0, 0]), ...u32(0))
    tiff.push(...u16(gpsN))
    if (opts.gps === true) tiff.push(...entry(1, 2, 2, [78, 0, 0, 0]), ...entry(2, 5, 3, u32(latAt)), ...entry(3, 2, 2, [87, 0, 0, 0]), ...entry(4, 5, 3, u32(lonAt)))
    tiff.push(...u32(0), ...strings)
    const body = [...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat(tiff)
    bytes.push(0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body)
  }
  if (opts.xmp === true) {
    const x = 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description drone-dji:GpsLatitude="+36.830864074" drone-dji:GpsLongitude="-75.966129100" drone-dji:RelativeAltitude="+88.800" drone-dji:GimbalYawDegree="-15.70" drone-dji:GimbalPitchDegree="-1.50" drone-dji:GimbalRollDegree="+0.00"' + (opts.pano === true ? ' aux:IsMergedPanorama="True" panorama:Transformation="Perspective"' : '') + '/></x:xmpmeta>'
    const body = [...new TextEncoder().encode(x)]
    bytes.push(0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body)
  }
  bytes.push(0xff, 0xda, 0, 2, 0xff, 0xd9)
  return new Uint8Array(bytes).buffer
}

describe("a drone photo's metadata, read on the phone", () => {
  it('reads DJI XMP for where the drone was and where the gimbal pointed, and EXIF for the lens and the time', () => {
    const m = readPhotoMeta(jpeg({ xmp: true }))
    expect(m.make).toBe('DJI')
    expect(m.lat).toBeCloseTo(36.830864074, 9)
    expect(m.lon).toBeCloseTo(-75.9661291, 7)
    expect(m.aboveTakeoffM).toBe(88.8)
    expect(m.gimbalYaw).toBe(-15.7)
    expect(m.gimbalPitch).toBe(-1.5)
    expect(m.focalMm).toBeCloseTo(19.35, 6)
    expect(m.focal35).toBe(70)
    expect(takenParts(m)).toEqual({ date: '2026-10-27', time: '07:37:35' })
    expect(placeable(m)).toEqual({ ok: true })
  })

  it('falls back to EXIF GPS when there is no XMP', () => {
    const m = readPhotoMeta(jpeg({ gps: true }))
    /* 36 deg 49' 51.10" N, 75 deg 57' 58.06" W. */
    expect(m.lat).toBeCloseTo(36 + 49 / 60 + 51.1 / 3600, 9)
    expect(m.lon).toBeCloseTo(-(75 + 57 / 60 + 58.06 / 3600), 9)
    expect(m.aboveTakeoffM).toBeNull()
  })

  it('says what is missing from an export that lost its position, rather than guessing', () => {
    const m = readPhotoMeta(jpeg({}))
    expect(m.lat).toBeNull()
    const p = placeable(m)
    expect(p.ok).toBe(false)
    if (!p.ok) expect(p.missing).toEqual(['position', 'height', 'heading', 'tilt'])
  })

  it('reads a file with no metadata at all, and one that is not a JPEG, as nothing', () => {
    expect(readPhotoMeta(jpeg({ exif: false })).focal35).toBeNull()
    expect(readPhotoMeta(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer).make).toBeNull()
  })
})

describe("the photo's field of view", () => {
  it('a full 4:3 frame at 24 mm equivalent: 73.7 by 57.8 degrees', () => {
    const f = photoFov(24, 4032, 3024)
    /* atan(0.8 x 43.27 / 2 / 24) and atan(0.6 x 43.27 / 2 / 24), doubled. */
    expect(f.horizontalDeg).toBeCloseTo((2 * Math.atan((0.8 * 43.27) / 48) * 180) / Math.PI, 6)
    expect(f.verticalDeg).toBeCloseTo((2 * Math.atan((0.6 * 43.27) / 48) * 180) / Math.PI, 6)
  })
  it('a portrait crop keeping the full height: its short side is the frame short side', () => {
    const f = photoFov(70, 4833, 6041)
    expect(f.horizontalDeg).toBeCloseTo((2 * Math.atan((0.6 * 43.27) / 140) * 180) / Math.PI, 6)
    expect(f.verticalDeg).toBeGreaterThan(f.horizontalDeg)
  })
})

/*
 * A STITCH IS NOT ITS LENS. Lightroom's merge keeps one frame's lens tags,
 * so the 24 mm on a vertical pano is not the picture's field of view.
 */
describe('panoramas', () => {
  it('reads a Lightroom merge as a stitch, from the XMP', () => {
    expect(readPhotoMeta(jpeg({ xmp: true, pano: true })).stitched).toBe(true)
    expect(readPhotoMeta(jpeg({ xmp: true })).stitched).toBe(false)
  })
  it('takes the file name as a stitch too, and never lets the name clear the XMP', () => {
    const single = readPhotoMeta(jpeg({ xmp: true }))
    expect(isStitched(single, 'DJI_20261027071232_0029_D-Pano.jpg')).toBe(true)
    expect(isStitched(single, 'DJI_20261027073735_0094_D.jpg')).toBe(false)
    expect(isStitched(single, 'Panorama of the pier.jpg')).toBe(true)
    expect(isStitched(single, 'japanorama.jpg')).toBe(false)
    expect(isStitched(readPhotoMeta(jpeg({ xmp: true, pano: true })), 'plain.jpg')).toBe(true)
  })
})
