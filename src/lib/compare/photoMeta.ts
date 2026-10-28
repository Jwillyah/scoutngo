/*
 * WHAT A DRONE PHOTO SAYS ABOUT WHERE AND WHEN IT WAS TAKEN, read from the
 * file on the phone. Nothing is uploaded: this reads the bytes the shooter
 * picked and nothing else.
 *
 * Two places in a DJI JPEG hold it:
 *
 *   EXIF   the camera: focal length (and its 35 mm equivalent), the time it
 *          was taken (the drone's local clock, with no zone unless
 *          OffsetTimeOriginal says one), the pixel size; GPS here too, when
 *          the file still has it
 *   XMP    DJI's own block (drone-dji:...): GPS latitude and longitude, the
 *          height above the takeoff point, the gimbal's yaw, pitch and roll
 *
 * Edited exports often lose some of it: Lightroom keeps the XMP and drops
 * EXIF's GPS; a screenshot or a phone's share sheet can drop both. What is
 * missing is null, and the screen says so rather than guessing.
 */

export interface PhotoMeta {
  make: string | null
  model: string | null
  /** As written: "2026:10:27 07:37:35", the drone's local clock. */
  takenLocal: string | null
  /** "-04:00", when the file says the zone. */
  offset: string | null
  focalMm: number | null
  focal35: number | null
  width: number | null
  height: number | null
  /** From DJI's XMP, or EXIF GPS when the XMP has none. */
  lat: number | null
  lon: number | null
  /** Metres above the takeoff point (DJI RelativeAltitude). */
  aboveTakeoffM: number | null
  /** Degrees from true north, clockwise. */
  gimbalYaw: number | null
  /** Degrees, negative down. */
  gimbalPitch: number | null
  gimbalRoll: number | null
  /** What edited the file last, when it says (EXIF Software). */
  software: string | null
  /*
   * A PANORAMA, STITCHED FROM SEVERAL FRAMES: Lightroom writes
   * aux:IsMergedPanorama="True" and a panorama:Transformation into the XMP
   * of a merge (both seen in the 27 Oct -Pano exports). The lens tags are
   * the lens of ONE of the frames, so its field of view is not the
   * picture's: see stitchedView.
   */
  stitched: boolean
  /*
   * LIGHTROOM'S CROP, as fractions of the frame the camera took (crs:CropLeft
   * and the rest), or null when the file was not cropped or does not say.
   * The 27 Oct portraits are crops out of a landscape frame: 0.6 of its width
   * and all of its height. Without this, the crop's narrow side was taken for
   * the sensor's short side and the vertical angle came out 26.1 degrees where
   * the lens gives 21.0 at 70 mm.
   */
  crop: { left: number; top: number; right: number; bottom: number; angle: number } | null
}

const EMPTY: PhotoMeta = {
  make: null,
  model: null,
  takenLocal: null,
  offset: null,
  focalMm: null,
  focal35: null,
  width: null,
  height: null,
  lat: null,
  lon: null,
  aboveTakeoffM: null,
  gimbalYaw: null,
  gimbalPitch: null,
  gimbalRoll: null,
  software: null,
  stitched: false,
  crop: null,
}

const TAG = {
  make: 0x010f,
  model: 0x0110,
  software: 0x0131,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  taken: 0x9003,
  offset: 0x9011,
  focal: 0x920a,
  focal35: 0xa405,
  width: 0xa002,
  height: 0xa003,
} as const

type Value = string | number | number[] | null

/** EXIF's tags, from the APP1 "Exif" segment's TIFF block. */
function readExif(view: DataView, start: number, length: number): { main: Map<number, Value>; gps: Map<number, Value> } {
  const main = new Map<number, Value>()
  const gps = new Map<number, Value>()
  const end = start + length
  if (start + 8 > end) return { main, gps }
  const le = view.getUint16(start) === 0x4949
  const u16 = (o: number) => view.getUint16(start + o, le)
  const u32 = (o: number) => view.getUint32(start + o, le)
  const value = (type: number, count: number, entry: number): Value => {
    const unit = [0, 1, 1, 2, 4, 8, 1, 1, 8, 4, 8][type] ?? 0
    if (unit === 0) return null
    const at = unit * count <= 4 ? entry : u32(entry)
    if (start + at + unit * count > end) return null
    if (type === 2) {
      let s = ''
      for (let i = 0; i < count - 1; i += 1) s += String.fromCharCode(view.getUint8(start + at + i))
      return s
    }
    if (type === 3) return u16(at)
    if (type === 4) return u32(at)
    if (type === 5 || type === 10) {
      const out: number[] = []
      for (let i = 0; i < count; i += 1) {
        const den = u32(at + 8 * i + 4)
        out.push(den === 0 ? Number.NaN : u32(at + 8 * i) / den)
      }
      return out
    }
    if (type === 1 || type === 7) return view.getUint8(start + at)
    return null
  }
  const ifd = (offset: number, into: Map<number, Value>) => {
    if (offset <= 0 || start + offset + 2 > end) return
    const n = u16(offset)
    for (let i = 0; i < n; i += 1) {
      const e = offset + 2 + 12 * i
      if (start + e + 12 > end) return
      into.set(u16(e), value(u16(e + 2), u32(e + 4), e + 8))
    }
  }
  ifd(u32(4), main)
  const exif = main.get(TAG.exifIfd)
  if (typeof exif === 'number') ifd(exif, main)
  const g = main.get(TAG.gpsIfd)
  if (typeof g === 'number') ifd(g, gps)
  return { main, gps }
}

const num = (v: Value): number | null => {
  const n = Array.isArray(v) ? v[0] : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const str = (v: Value): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Degrees from EXIF's [deg, min, sec] and its N/S or E/W. */
const dms = (v: Value, ref: Value, negative: string): number | null => {
  if (!Array.isArray(v) || v.length < 3 || v.some((x) => !Number.isFinite(x))) return null
  const d = v[0] + v[1] / 60 + v[2] / 3600
  return str(ref) === negative ? -d : d
}

/** One drone-dji attribute from the XMP, as a number. */
function xmpNumber(xmp: string, name: string, ns = 'drone-dji'): number | null {
  const m = new RegExp(`${ns}:${name}="([^"]*)"`).exec(xmp) ?? new RegExp(`<${ns}:${name}>([^<]*)<`).exec(xmp)
  if (m === null) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** Reads a JPEG's EXIF and DJI XMP. A file that is not a JPEG reads as all null. */
export function readPhotoMeta(buffer: ArrayBuffer): PhotoMeta {
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return { ...EMPTY }
  const out: PhotoMeta = { ...EMPTY }
  let xmp = ''
  let gpsLat: number | null = null
  let gpsLon: number | null = null
  for (let at = 2; at + 4 <= view.byteLength; ) {
    if (view.getUint8(at) !== 0xff) break
    const marker = view.getUint8(at + 1)
    /* Start of scan: the picture itself, no more metadata. */
    if (marker === 0xda) break
    const length = view.getUint16(at + 2)
    const body = at + 4
    if (marker === 0xe1) {
      const head = String.fromCharCode(...new Uint8Array(buffer, body, Math.min(29, length - 2)))
      if (head.startsWith('Exif\0\0')) {
        const { main, gps } = readExif(view, body + 6, length - 8)
        out.make = str(main.get(TAG.make) ?? null)
        out.model = str(main.get(TAG.model) ?? null)
        out.software = str(main.get(TAG.software) ?? null)
        out.takenLocal = str(main.get(TAG.taken) ?? null)
        out.offset = str(main.get(TAG.offset) ?? null)
        out.focalMm = num(main.get(TAG.focal) ?? null)
        out.focal35 = num(main.get(TAG.focal35) ?? null)
        out.width = num(main.get(TAG.width) ?? null)
        out.height = num(main.get(TAG.height) ?? null)
        gpsLat = dms(gps.get(2) ?? null, gps.get(1) ?? null, 'S')
        gpsLon = dms(gps.get(4) ?? null, gps.get(3) ?? null, 'W')
      } else if (head.startsWith('http://ns.adobe.com/xap/1.0/')) {
        xmp += new TextDecoder().decode(new Uint8Array(buffer, body, length - 2))
      }
    }
    at = body + length - 2
  }
  out.lat = xmpNumber(xmp, 'GpsLatitude') ?? xmpNumber(xmp, 'GpsLatitud') ?? gpsLat
  out.lon = xmpNumber(xmp, 'GpsLongitude') ?? xmpNumber(xmp, 'GpsLongtitude') ?? gpsLon
  /* 0, 0 is "no fix", not a place off Africa. */
  if (out.lat === 0 && out.lon === 0) {
    out.lat = null
    out.lon = null
  }
  if (/crs:HasCrop(="True"|>True<)/i.test(xmp)) {
    const [left, top, right, bottom] = ['CropLeft', 'CropTop', 'CropRight', 'CropBottom'].map((n) => xmpNumber(xmp, n, 'crs'))
    const angle = xmpNumber(xmp, 'CropAngle', 'crs') ?? 0
    if (left !== null && top !== null && right !== null && bottom !== null && right > left && bottom > top && left >= 0 && top >= 0 && right <= 1 && bottom <= 1) {
      out.crop = { left, top, right, bottom, angle }
    }
  }
  out.stitched = /IsMergedPanorama(="True"|>True<)/i.test(xmp) || /panorama:Transformation/.test(xmp)
  out.aboveTakeoffM = xmpNumber(xmp, 'RelativeAltitude')
  out.gimbalYaw = xmpNumber(xmp, 'GimbalYawDegree')
  out.gimbalPitch = xmpNumber(xmp, 'GimbalPitchDegree')
  out.gimbalRoll = xmpNumber(xmp, 'GimbalRollDegree')
  return out
}

/**
 * Whether the picture is a stitch: the XMP says so, or the file is named as
 * one ("...-Pano.jpg", which DJI's app and Lightroom both write). The name
 * is the weaker sign and only ever adds: it never clears what the XMP said.
 */
export function isStitched(m: PhotoMeta, fileName: string | null = null): boolean {
  return m.stitched || (fileName !== null && /(^|[-_ .])pano(rama)?([-_ .]|$)/i.test(fileName))
}

/** The parts the 3D view needs to stand where the photo was taken, or what is missing. */
export function placeable(m: PhotoMeta): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = []
  if (m.lat === null || m.lon === null) missing.push('position')
  if (m.aboveTakeoffM === null) missing.push('height')
  if (m.gimbalYaw === null) missing.push('heading')
  if (m.gimbalPitch === null) missing.push('tilt')
  if (m.focal35 === null && m.focalMm === null) missing.push('focal length')
  if (m.takenLocal === null) missing.push('time')
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

/** "2026:10:27 07:37:35" as yyyy-mm-dd and HH:MM:SS, or null. */
export function takenParts(m: PhotoMeta): { date: string; time: string } | null {
  const t = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(m.takenLocal ?? '')
  return t === null ? null : { date: `${t[1]}-${t[2]}-${t[3]}`, time: `${t[4]}:${t[5]}:${t[6]}` }
}

/*
 * THE PHOTO'S FIELD OF VIEW, from the 35 mm equivalent focal length. The
 * equivalent describes the camera's whole frame, 4:3 on DJI's cameras: its
 * diagonal is a 35 mm frame's, 43.27 mm, so its short side is 0.6 of that.
 *
 * WITH THE CROP (Lightroom's, in the XMP) the frame the camera took is known:
 * the picture is (right - left) of its width and (bottom - top) of its
 * height. Its short side is the sensor's short side, and the picture's angle
 * is the part of the frame's angle it kept.
 *
 * WITHOUT ONE, the picture's short side is taken as the frame's: true of an
 * uncropped frame, and wrong for a crop that cut the long side down past the
 * short one (a portrait out of a landscape frame), which is why the crop is
 * read at all.
 */
export function photoFov(
  focal35: number,
  width: number,
  height: number,
  crop: PhotoMeta['crop'] = null,
): { horizontalDeg: number; verticalDeg: number } {
  const frameW = crop === null ? width : width / (crop.right - crop.left)
  const frameH = crop === null ? height : height / (crop.bottom - crop.top)
  /* Pixels to focal length: the frame's short side is 0.6 of the 43.27 mm diagonal. */
  const short35 = 43.27 * 0.6
  const fPx = (focal35 * Math.min(frameW, frameH)) / short35
  const deg = (px: number) => (2 * Math.atan(px / 2 / fPx) * 180) / Math.PI
  return { horizontalDeg: deg(width), verticalDeg: deg(height) }
}

/**
 * Where the picture's centre points, against where the gimbal pointed: a crop
 * off the frame's centre turns the view. Degrees right and up; zero with no
 * crop. Small angles, which the crops here are (under ten degrees).
 */
export function cropTurn(focal35: number, width: number, height: number, crop: PhotoMeta['crop']): { yaw: number; pitch: number } {
  if (crop === null) return { yaw: 0, pitch: 0 }
  const frameW = width / (crop.right - crop.left)
  const frameH = height / (crop.bottom - crop.top)
  const fPx = (focal35 * Math.min(frameW, frameH)) / (43.27 * 0.6)
  const dx = ((crop.left + crop.right) / 2 - 0.5) * frameW
  const dy = ((crop.top + crop.bottom) / 2 - 0.5) * frameH
  const deg = (r: number) => (r * 180) / Math.PI
  return { yaw: deg(Math.atan(dx / fPx)), pitch: -deg(Math.atan(dy / fPx)) }
}
