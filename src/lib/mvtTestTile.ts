/*
 * A VECTOR TILE MADE TO ORDER, for tests: the Mapbox Vector Tile encoding,
 * written with pbf's own writer, so the decoding the app does
 * (src/lib/vectorTiles.ts) is tested on real tile bytes and not on a mock.
 */
import { PbfWriter } from 'pbf'

export interface TestFeature {
  /** Rings in tile coordinates, each open (the encoding closes them). Exterior rings clockwise on screen (y down). */
  rings: { x: number; y: number }[][]
  properties: Record<string, string | number | boolean>
}

export function encodeTestTile(layers: Record<string, TestFeature[]>, extent = 4096): ArrayBuffer {
  const pbf = new PbfWriter()
  for (const [name, features] of Object.entries(layers)) {
    pbf.writeMessage(3, (_: unknown, w: PbfWriter) => {
      w.writeVarintField(15, 2)
      w.writeStringField(1, name)
      const keys: string[] = []
      const values: (string | number | boolean)[] = []
      const index = <T>(list: T[], v: T) => (list.includes(v) ? list.indexOf(v) : list.push(v) - 1)
      features.forEach((f, id) => {
        const tags: number[] = []
        for (const [k, v] of Object.entries(f.properties)) tags.push(index(keys, k), index(values, v))
        const geometry: number[] = []
        let cx = 0
        let cy = 0
        const zig = (n: number) => (n << 1) ^ (n >> 31)
        for (const ring of f.rings) {
          geometry.push(1 | (1 << 3), zig(ring[0].x - cx), zig(ring[0].y - cy))
          ;[cx, cy] = [ring[0].x, ring[0].y]
          geometry.push(2 | ((ring.length - 1) << 3))
          for (const p of ring.slice(1)) {
            geometry.push(zig(p.x - cx), zig(p.y - cy))
            ;[cx, cy] = [p.x, p.y]
          }
          geometry.push(7 | (1 << 3))
        }
        w.writeMessage(2, (_f: unknown, fw: PbfWriter) => {
          fw.writeVarintField(1, id + 1)
          fw.writePackedVarint(2, tags)
          fw.writeVarintField(3, 3)
          fw.writePackedVarint(4, geometry)
        }, null)
      })
      for (const k of keys) w.writeStringField(3, k)
      for (const v of values) {
        w.writeMessage(4, (_v: unknown, vw: PbfWriter) => {
          if (typeof v === 'string') vw.writeStringField(1, v)
          else if (typeof v === 'boolean') vw.writeBooleanField(7, v)
          else vw.writeDoubleField(3, v)
        }, null)
      }
      w.writeVarintField(5, extent)
    }, null)
  }
  const bytes = pbf.finish()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** A clockwise square (y down), open. */
export const square = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
