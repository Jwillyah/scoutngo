/*
 * MEASUREMENT HELPERS FOR THE LIDAR CHECKS (scripts only, not the app):
 * a minimal PNG decoder for Terrarium tiles on Node's own zlib, and the
 * ground along a line from an EPT project.
 */
import { inflateSync } from 'node:zlib'

/** 8-bit RGB or RGBA, non-interlaced: what Terrarium serves. Returns RGBA bytes, 256 x 256. */
export function decodePng(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let p = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat = []
  while (p < bytes.length) {
    const len = dv.getUint32(p)
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8))
    const data = bytes.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      width = dv.getUint32(p + 8)
      height = dv.getUint32(p + 12)
      colorType = bytes[p + 17]
      if (bytes[p + 16] !== 8 || bytes[p + 20] !== 0) throw new Error('only 8-bit non-interlaced PNG')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (bpp === 0) throw new Error(`PNG colour type ${colorType} not handled`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      const pa = Math.abs(b - c)
      const pb = Math.abs(a - c)
      const pc = Math.abs(a + b - 2 * c)
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      cur[i] = (line[i] + pred) & 255
    }
    for (let x = 0; x < width; x += 1) {
      out.set([cur[x * bpp], cur[x * bpp + 1], cur[x * bpp + 2], bpp === 4 ? cur[x * bpp + 3] : 255], (y * width + x) * 4)
    }
    prev = cur
  }
  return { width, height, rgba: out }
}

const R = 6378137
export const merc = (lat, lon) => ({ x: ((lon * Math.PI) / 180) * R, y: Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 180 / 2)) * R })
const dest = (p, b, m) => ({ lat: p.lat + (m * Math.cos((b * Math.PI) / 180)) / 111320, lon: p.lon + (m * Math.sin((b * Math.PI) / 180)) / (111320 * Math.cos((p.lat * Math.PI) / 180)) })

/** Terrarium z15, bilinear, metres. `getTile(z, x, y)` returns PNG bytes. */
export async function terrariumAt(lat, lon, getTile, cache = new Map()) {
  const z = 15
  const n = 2 ** z
  const fx = ((lon + 180) / 360) * n
  const s = Math.sin((lat * Math.PI) / 180)
  const fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n
  const tx = Math.floor(fx)
  const ty = Math.floor(fy)
  const key = `${tx}/${ty}`
  if (!cache.has(key)) cache.set(key, decodePng(await getTile(z, tx, ty)))
  const png = cache.get(key)
  const px = (fx - tx) * 256 - 0.5
  const py = (fy - ty) * 256 - 0.5
  const h = (x, y) => {
    x = Math.max(0, Math.min(255, x))
    y = Math.max(0, Math.min(255, y))
    const i = (y * 256 + x) * 4
    return png.rgba[i] * 256 + png.rgba[i + 1] + png.rgba[i + 2] / 256 - 32768
  }
  const ix = Math.floor(px)
  const iy = Math.floor(py)
  const ax = px - ix
  const ay = py - iy
  return h(ix, iy) * (1 - ax) * (1 - ay) + h(ix + 1, iy) * ax * (1 - ay) + h(ix, iy + 1) * (1 - ax) * ay + h(ix + 1, iy + 1) * ax * ay
}

/** Points of an EPT project inside a Web Mercator box, every depth. */
export async function eptPointsInBox(Laz, base, meta, box) {
  const [x0, y0, , x1] = meta.bounds
  const hier = new Map()
  const loadHier = async (key) => {
    for (const [k, v] of Object.entries(await (await fetch(`${base}/ept-hierarchy/${key}.json`)).json())) hier.set(k, v)
  }
  await loadHier('0-0-0-0')
  const nodes = []
  const visit = async (d, x, y, zz) => {
    const key = `${d}-${x}-${y}-${zz}`
    let v = hier.get(key)
    if (v === undefined) return
    if (v === -1) {
      await loadHier(key)
      v = hier.get(key)
    }
    const size = (x1 - x0) / 2 ** d
    const bx = x0 + x * size
    const by = y0 + y * size
    if (bx > box.maxx || bx + size < box.minx || by > box.maxy || by + size < box.miny) return
    nodes.push([key, v])
    for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) await visit(d + 1, 2 * x + dx, 2 * y + dy, 2 * zz + dz)
  }
  await visit(0, 0, 0, 0)
  const pts = []
  let bytes = 0
  let counted = 0
  for (const [key, count] of nodes) {
    counted += count
    const buf = new Uint8Array(await (await fetch(`${base}/ept-data/${key}.laz`)).arrayBuffer())
    bytes += buf.length
    const dv = new DataView(buf.buffer)
    const fmt = buf[104] & 0x3f
    const len = dv.getUint16(105, true)
    const [sx, sy, sz, ox, oy, oz] = [131, 139, 147, 155, 163, 171].map((o) => dv.getFloat64(o, true))
    const fp = Laz._malloc(buf.length)
    Laz.HEAPU8.set(buf, fp)
    const r = new Laz.LASZip()
    r.open(fp, buf.length)
    const pp = Laz._malloc(len)
    for (let i = 0, n = r.getCount(); i < n; i += 1) {
      r.getPoint(pp)
      const v = new DataView(Laz.HEAPU8.buffer, pp, len)
      const X = v.getInt32(0, true) * sx + ox
      const Y = v.getInt32(4, true) * sy + oy
      if (X < box.minx || X > box.maxx || Y < box.miny || Y > box.maxy) continue
      pts.push([X, Y, v.getInt32(8, true) * sz + oz, fmt >= 6 ? v.getUint8(16) : v.getUint8(15) & 31])
    }
    r.delete()
    Laz._free(fp)
    Laz._free(pp)
  }
  return { pts, bytes, nodes: nodes.length, counted }
}

/** Lidar ground (class 2, median within 5 m) against Terrarium, every `step` m along a bearing. */
export async function groundAlong(Laz, base, meta, at, bearing, count, step, getTile) {
  const samples = Array.from({ length: count }, (_, i) => {
    const p = dest(at, bearing, i * step)
    return { m: i * step, p, q: merc(p.lat, p.lon) }
  })
  const k = 1 / Math.cos((at.lat * Math.PI) / 180)
  const box = { minx: Math.min(...samples.map((s) => s.q.x)) - 10 * k, maxx: Math.max(...samples.map((s) => s.q.x)) + 10 * k, miny: Math.min(...samples.map((s) => s.q.y)) - 10 * k, maxy: Math.max(...samples.map((s) => s.q.y)) + 10 * k }
  const { pts, bytes, nodes, counted } = await eptPointsInBox(Laz, base, meta, box)
  const cache = new Map()
  const rows = []
  for (const s of samples) {
    /* 5 m on the ground is 5 / cos(lat) Web Mercator units. */
    const g = pts.filter((p) => p[3] === 2 && Math.hypot(p[0] - s.q.x, p[1] - s.q.y) < 5 * k).map((p) => p[2]).sort((a, b) => a - b)
    rows.push({ m: s.m, ground: g.length === 0 ? null : g[Math.floor(g.length / 2)], terrarium: await terrariumAt(s.p.lat, s.p.lon, getTile, cache) })
  }
  return { rows, bytes, nodes, counted }
}
