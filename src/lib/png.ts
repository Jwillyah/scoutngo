/*
 * A PNG DECODER AND ENCODER WITH NO CANVAS IN THEM.
 *
 * WHY. WebKit's fingerprinting protection adds noise to pixels read back from
 * a 2D canvas (docs/failure-modes.md, C: the rainbow clouds). An elevation
 * tile is not a picture, it is numbers: terrarium packs a height into three
 * bytes as R * 256 + G + B / 256 - 32768, so one unit of noise in R is 256 m.
 * Reading those bytes through a canvas on an iPhone reads heights with noise
 * in them. This reads the bytes of the file itself.
 *
 * WHAT IT HANDLES. 8-bit, non-interlaced PNG of colour types 0 (grey),
 * 2 (RGB), 3 (palette), 4 (grey + alpha) and 6 (RGBA), the five filters, and
 * zlib through the platform's DecompressionStream (Safari 16.4, Node 18). That
 * is every elevation tile this app reads. Anything else throws, with the
 * reason, rather than returning wrong numbers.
 *
 * The encoder writes RGBA, filter 0, through CompressionStream: the cleaned
 * elevation handed back to the map (src/lib/seaMask.ts).
 */

export interface Pixels {
  width: number
  height: number
  /** RGBA, four bytes a pixel, row by row. */
  data: Uint8ClampedArray
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export async function decodePng(buffer: ArrayBuffer | Uint8Array): Promise<Pixels> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('not a PNG')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0
  let height = 0
  let depth = 0
  let type = -1
  let interlace = 0
  let palette: Uint8Array | null = null
  let alpha: Uint8Array | null = null
  const idat: Uint8Array[] = []
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at)
    const name = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (name === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      depth = body[8]
      type = body[9]
      interlace = body[12]
    } else if (name === 'PLTE') palette = body
    else if (name === 'tRNS') alpha = body
    else if (name === 'IDAT') idat.push(body)
    else if (name === 'IEND') break
    at += 12 + length
  }
  if (width === 0 || height === 0) throw new Error('PNG has no header')
  if (depth !== 8) throw new Error(`PNG bit depth ${depth} not read`)
  if (interlace !== 0) throw new Error('interlaced PNG not read')
  const channels = CHANNELS[type]
  if (channels === undefined) throw new Error(`PNG colour type ${type} not read`)
  if (type === 3 && palette === null) throw new Error('palette PNG with no palette')

  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0))
  let off = 0
  for (const c of idat) {
    joined.set(c, off)
    off += c.length
  }
  const raw = await through(joined, new DecompressionStream('deflate'))
  const stride = width * channels
  if (raw.length < height * (stride + 1)) throw new Error('PNG data is short')

  /* Unfilter in place, row by row, into `rows`. */
  const rows = new Uint8Array(height * stride)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i]
      const a = i >= channels ? rows[dst + i - channels] : 0
      const b = y > 0 ? rows[dst - stride + i] : 0
      const c = i >= channels && y > 0 ? rows[dst - stride + i - channels] : 0
      let v: number
      switch (filter) {
        case 0: v = x; break
        case 1: v = x + a; break
        case 2: v = x + b; break
        case 3: v = x + ((a + b) >> 1); break
        case 4: v = x + paeth(a, b, c); break
        default: throw new Error(`PNG filter ${filter} not known`)
      }
      rows[dst + i] = v & 0xff
    }
  }

  const data = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels
    const d = p * 4
    if (type === 6) {
      data[d] = rows[s]; data[d + 1] = rows[s + 1]; data[d + 2] = rows[s + 2]; data[d + 3] = rows[s + 3]
    } else if (type === 2) {
      data[d] = rows[s]; data[d + 1] = rows[s + 1]; data[d + 2] = rows[s + 2]; data[d + 3] = 255
    } else if (type === 0 || type === 4) {
      data[d] = data[d + 1] = data[d + 2] = rows[s]
      data[d + 3] = type === 4 ? rows[s + 1] : 255
    } else {
      const i = rows[s]
      const pal = palette as Uint8Array
      data[d] = pal[i * 3]; data[d + 1] = pal[i * 3 + 1]; data[d + 2] = pal[i * 3 + 2]
      data[d + 3] = alpha !== null && i < alpha.length ? alpha[i] : 255
    }
  }
  return { width, height, data }
}

/* ------------------------------------------------------------- encoding */

let crcTable: Uint32Array | null = null
function crc32(bytes: Uint8Array): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(name: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i += 1) out[4 + i] = name.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

/** RGBA in, a PNG out: filter 0 on every row, zlib by the platform. */
export async function encodePng(px: Pixels): Promise<ArrayBuffer> {
  const { width, height, data } = px
  const head = new Uint8Array(13)
  const hv = new DataView(head.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  head[8] = 8
  head[9] = 6
  const raw = new Uint8Array(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  const z = await through(raw, new CompressionStream('deflate'))
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', head), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out.buffer
}

/** Terrarium: R * 256 + G + B / 256 - 32768 metres. */
export const terrariumMetres = (data: Uint8ClampedArray, i: number): number =>
  data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768
