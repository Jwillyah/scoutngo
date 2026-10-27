/*
 * ONE POINT TILE, DECODED: the LAS header's scale and offset, laz-perf's
 * reader, and the points inside the patch appended as (x, y, z, class,
 * return). Shared by the worker (scan.worker.ts) and the measuring script, so
 * both read a tile the same way.
 */
import type { MercatorBox } from './grid.ts'

export interface LazModule {
  _malloc(n: number): number
  _free(p: number): void
  HEAPU8: Uint8Array
  LASZip: new () => { open(p: number, n: number): void; getPoint(p: number): void; getCount(): number; delete(): void }
}

export function decodeTile(Laz: LazModule, data: Uint8Array, area: MercatorBox, push: (x: number, y: number, z: number, cls: number, ret: number) => void): number {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const fmt = data[104] & 0x3f
  const len = dv.getUint16(105, true)
  const [sx, sy, sz, ox, oy, oz] = [131, 139, 147, 155, 163, 171].map((o) => dv.getFloat64(o, true))
  const fp = Laz._malloc(data.length)
  Laz.HEAPU8.set(data, fp)
  const reader = new Laz.LASZip()
  reader.open(fp, data.length)
  const pp = Laz._malloc(len)
  let kept = 0
  try {
    for (let p = 0, n = reader.getCount(); p < n; p += 1) {
      reader.getPoint(pp)
      const v = new DataView(Laz.HEAPU8.buffer, pp, len)
      const x = v.getInt32(0, true) * sx + ox
      const y = v.getInt32(4, true) * sy + oy
      if (x < area.minx || x >= area.maxx || y < area.miny || y >= area.maxy) continue
      const flags = v.getUint8(14)
      push(x, y, v.getInt32(8, true) * sz + oz, fmt >= 6 ? v.getUint8(16) : v.getUint8(15) & 31, fmt >= 6 ? flags & 0x0f : flags & 0x07)
      kept += 1
    }
  } finally {
    reader.delete()
    Laz._free(fp)
    Laz._free(pp)
  }
  return kept
}
