/*
 * A DRONE JPEG MADE TO ORDER, for audits: EXIF with the make and the moment
 * taken, and DJI's XMP with where it was and which way the gimbal pointed --
 * the same tags src/lib/compare/photoMeta.ts reads from a real DJI file. No
 * picture in it: the reader never looks at one.
 */
export interface TestJpeg {
  /** "2026:10:29 07:40:12", the drone's local clock. */
  taken: string
  lat: number
  lon: number
  yaw: number
  aboveTakeoffM: number
}

export function testJpeg(o: TestJpeg): Uint8Array {
  const bytes: number[] = [0xff, 0xd8]
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff]
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
  const entry = (tag: number, type: number, count: number, val: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...val]
  const make = 'DJI\0'
  const taken = `${o.taken}\0`
  const ifd0At = 8
  const exifAt = ifd0At + 2 + 12 * 2 + 4
  const dataAt = exifAt + 2 + 12 * 1 + 4
  const tiff: number[] = [0x49, 0x49, 0x2a, 0x00, ...u32(ifd0At)]
  tiff.push(...u16(2), ...entry(0x010f, 2, make.length, [...make].map((c) => c.charCodeAt(0))), ...entry(0x8769, 4, 1, u32(exifAt)), ...u32(0))
  tiff.push(...u16(1), ...entry(0x9003, 2, taken.length, u32(dataAt)), ...u32(0))
  tiff.push(...[...taken].map((c) => c.charCodeAt(0)))
  const exif = [...'Exif\0\0'].map((c) => c.charCodeAt(0)).concat(tiff)
  bytes.push(0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif)
  const sign = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(9)
  const xmp = new TextEncoder().encode(
    `http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description drone-dji:GpsLatitude="${sign(o.lat)}" drone-dji:GpsLongitude="${sign(o.lon)}" drone-dji:RelativeAltitude="${sign(o.aboveTakeoffM)}" drone-dji:GimbalYawDegree="${sign(o.yaw)}" drone-dji:GimbalPitchDegree="-5.00" drone-dji:GimbalRollDegree="+0.00"/></x:xmpmeta>`,
  )
  bytes.push(0xff, 0xe1, (xmp.length + 2) >> 8, (xmp.length + 2) & 0xff, ...xmp)
  bytes.push(0xff, 0xda, 0, 2, 0xff, 0xd9)
  return new Uint8Array(bytes)
}
