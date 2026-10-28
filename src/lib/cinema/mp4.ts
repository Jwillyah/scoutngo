/*
 * A SMALL MP4 WRITER: one H.264 video track at a fixed frame rate.
 *
 * The preview is rendered frame by frame (slowly, on a slow phone) and each
 * frame is encoded with WebCodecs' VideoEncoder with its own timestamp, so
 * the clip plays at a steady FPS whatever the render took. This puts the
 * encoded frames in a file a phone's Photos and share sheet accept.
 *
 * Boxes (ISO/IEC 14496-12 and -15): ftyp, mdat (the frames, in order), moov
 * (mvhd, trak: tkhd, mdia: mdhd, hdlr, minf: vmhd, dinf, stbl: stsd with
 * avc1/avcC, stts, stss, stsc, stsz, stco). Every sample lasts the same
 * time, so stts is one entry. `readMp4` reads it back for the tests and
 * scripts/measure-cinema.mjs, which also lets Chrome's own decoder say how
 * long the file is.
 *
 * Written here rather than taken from a package: mp4-muxer is deprecated,
 * and its successor is 11 MB.
 */
export interface EncodedFrame {
  data: Uint8Array
  key: boolean
}

const TIMESCALE = 90_000

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(size)
  const v = new DataView(out.buffer)
  v.setUint32(0, size)
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
  let o = 8
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Big-endian integers of the given byte widths. */
function ints(...pairs: [number, number][]): Uint8Array {
  const size = pairs.reduce((s, [, w]) => s + w, 0)
  const out = new Uint8Array(size)
  const v = new DataView(out.buffer)
  let o = 0
  for (const [n, w] of pairs) {
    if (w === 1) v.setUint8(o, n)
    else if (w === 2) v.setUint16(o, n)
    else if (w === 4) v.setUint32(o, n >>> 0)
    o += w
  }
  return out
}

const full = (type: string, version: number, flags: number, ...parts: Uint8Array[]) => box(type, ints([version, 1], [flags >> 16, 1], [flags & 0xffff, 2]), ...parts)
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))
/* The identity matrix, as tkhd and mvhd carry it. */
const MATRIX = ints([0x10000, 4], [0, 4], [0, 4], [0, 4], [0x10000, 4], [0, 4], [0, 4], [0, 4], [0x40000000, 4])

/** The file: frames in order at `fps`, `avcC` from the encoder's decoderConfig.description. */
export function writeMp4(frames: readonly EncodedFrame[], avcC: Uint8Array, width: number, height: number, fps: number): Uint8Array<ArrayBuffer> {
  const delta = Math.round(TIMESCALE / fps)
  const duration = delta * frames.length
  const ftyp = box('ftyp', ascii('isom'), ints([0x200, 4]), ascii('isomiso2avc1mp41'))
  const mdatSize = 8 + frames.reduce((s, f) => s + f.data.length, 0)
  const mdatStart = ftyp.length
  const stsd = full('stsd', 0, 0, ints([1, 4]), box('avc1', ints([0, 4], [0, 2], [1, 2], [0, 4], [0, 4], [0, 4], [0, 4], [width, 2], [height, 2], [0x480000, 4], [0x480000, 4], [0, 4], [1, 2]), new Uint8Array(32), ints([0x18, 2], [0xffff, 2]), box('avcC', avcC)))
  const keys = frames.map((f, i) => (f.key ? i + 1 : 0)).filter((n) => n > 0)
  const stbl = box(
    'stbl',
    stsd,
    full('stts', 0, 0, ints([1, 4], [frames.length, 4], [delta, 4])),
    full('stss', 0, 0, ints([keys.length, 4], ...keys.map((k) => [k, 4] as [number, number]))),
    full('stsc', 0, 0, ints([1, 4], [1, 4], [frames.length, 4], [1, 4])),
    full('stsz', 0, 0, ints([0, 4], [frames.length, 4], ...frames.map((f) => [f.data.length, 4] as [number, number]))),
    full('stco', 0, 0, ints([1, 4], [mdatStart + 8, 4])),
  )
  const minf = box('minf', full('vmhd', 0, 1, ints([0, 2], [0, 2], [0, 2], [0, 2])), box('dinf', full('dref', 0, 0, ints([1, 4]), full('url ', 0, 1))), stbl)
  const mdia = box('mdia', full('mdhd', 0, 0, ints([0, 4], [0, 4], [TIMESCALE, 4], [duration, 4], [0x55c4, 2], [0, 2])), full('hdlr', 0, 0, ints([0, 4]), ascii('vide'), new Uint8Array(12), ascii('ScoutNGo\0')), minf)
  const tkhd = full('tkhd', 0, 3, ints([0, 4], [0, 4], [1, 4], [0, 4], [duration, 4], [0, 4], [0, 4], [0, 2], [0, 2], [0, 2], [0, 2]), MATRIX, ints([width << 16, 4], [height << 16, 4]))
  const mvhd = full('mvhd', 0, 0, ints([0, 4], [0, 4], [TIMESCALE, 4], [duration, 4], [0x10000, 4], [0x100, 2], [0, 2], [0, 4], [0, 4]), MATRIX, new Uint8Array(24), ints([2, 4]))
  const moov = box('moov', mvhd, box('trak', tkhd, mdia))
  const out = new Uint8Array(ftyp.length + mdatSize + moov.length)
  out.set(ftyp, 0)
  new DataView(out.buffer).setUint32(mdatStart, mdatSize)
  out.set(ascii('mdat'), mdatStart + 4)
  let o = mdatStart + 8
  for (const f of frames) {
    out.set(f.data, o)
    o += f.data.length
  }
  out.set(moov, o)
  return out
}

export interface Mp4Facts {
  brand: string
  width: number
  height: number
  samples: number
  /** Each sample's duration, timescale units: all the same in a steady clip. */
  deltas: number[]
  timescale: number
  durationS: number
  keyframes: number
  /** The sizes in stsz add up to the frames in mdat. */
  sizesMatch: boolean
}

/** Reads back what writeMp4 wrote (and any plain MP4 with one track): for the checks. */
export function readMp4(bytes: Uint8Array): Mp4Facts {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const type = (o: number) => String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7])
  const facts: Mp4Facts = { brand: '', width: 0, height: 0, samples: 0, deltas: [], timescale: 0, durationS: 0, keyframes: 0, sizesMatch: false }
  let mdatPayload = 0
  let sizeSum = 0
  const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])
  const walk = (start: number, end: number) => {
    let o = start
    while (o + 8 <= end) {
      const size = v.getUint32(o)
      const t = type(o)
      if (size < 8) break
      const body = o + 8
      if (t === 'ftyp') facts.brand = String.fromCharCode(...bytes.subarray(body, body + 4))
      else if (t === 'mdat') mdatPayload = size - 8
      else if (CONTAINERS.has(t)) walk(body, o + size)
      else if (t === 'mdhd') {
        facts.timescale = v.getUint32(body + 12)
        facts.durationS = v.getUint32(body + 16) / facts.timescale
      } else if (t === 'tkhd') {
        facts.width = v.getUint32(body + 76) >>> 16
        facts.height = v.getUint32(body + 80) >>> 16
      } else if (t === 'stts') {
        const n = v.getUint32(body + 4)
        for (let i = 0; i < n; i += 1) {
          const count = v.getUint32(body + 8 + i * 8)
          const d = v.getUint32(body + 12 + i * 8)
          for (let k = 0; k < count; k += 1) facts.deltas.push(d)
        }
      } else if (t === 'stss') facts.keyframes = v.getUint32(body + 4)
      else if (t === 'stsz') {
        facts.samples = v.getUint32(body + 8)
        for (let i = 0; i < facts.samples; i += 1) sizeSum += v.getUint32(body + 12 + i * 4)
      }
      o += size
    }
  }
  walk(0, bytes.length)
  facts.sizesMatch = sizeSum === mdatPayload
  return facts
}
