/*
 * THE SCAN, DECODED OFF THE MAIN THREAD. Fetches each chosen point tile from
 * the USGS bucket, decodes the LAZ with laz-perf (0.0.7, Apache-2.0, its WASM
 * served from this app's own bundle), keeps the points inside the patch, and
 * builds the rasters (raster.ts). The building points go back too, for the
 * heights per footprint.
 */
import { createLazPerf } from 'laz-perf/lib/web'
import wasmUrl from 'laz-perf/lib/web/laz-perf.wasm?url'
import { buildRasters, STRIDE } from './raster.ts'
import type { ScanJob, ScanMessage } from './scanTypes.ts'
import { decodeTile, type LazModule } from './decode.ts'
import { scanHeight } from './buildingHeights.ts'

const post = (m: ScanMessage, transfer: Transferable[] = []) => (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(m, transfer)

self.onmessage = async (event: MessageEvent<ScanJob>) => {
  const { base, keys, area, footprints } = event.data
  try {
    const Laz = await createLazPerf({ locateFile: () => wasmUrl })
    let buf = new Float64Array(1 << 20)
    let used = 0
    let bytes = 0
    for (const [i, key] of keys.entries()) {
      const response = await fetch(`${base}/ept-data/${key}.laz`)
      if (!response.ok) throw new Error(`USGS answered HTTP ${response.status} for a point tile`)
      const data = new Uint8Array(await response.arrayBuffer())
      bytes += data.length
      decodeTile(Laz as unknown as LazModule, data, area, (x, y, z, cls, ret) => {
        if (used + STRIDE > buf.length) {
          const bigger = new Float64Array(buf.length * 2)
          bigger.set(buf)
          buf = bigger
        }
        buf.set([x, y, z, cls, ret], used)
        used += STRIDE
      })
      post({ kind: 'progress', done: i + 1, total: keys.length, bytes })
    }
    const points = buf.subarray(0, used)
    const r = buildRasters(points, area)
    const heights: Record<string, { metres: number; byRaster: number } | 'newer'> = {}
    for (const f of footprints) {
      const h = scanHeight(f.ring, points, r)
      if (h.kind === 'measured') heights[f.id] = { metres: h.metres, byRaster: h.byRaster }
      else if (h.kind === 'newer-than-scan') heights[f.id] = 'newer'
    }
    post({ kind: 'done', width: r.width, height: r.height, cell: r.cell, minx: r.minx, maxy: r.maxy, dtm: r.dtm, dsm: r.dsm, kind2: r.kind, water: r.water ?? new Uint8Array(0), heights, bytes, points: used / STRIDE }, [r.dtm.buffer, r.dsm.buffer, r.kind.buffer, ...(r.water === undefined ? [] : [r.water.buffer])])
  } catch (error) {
    post({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) })
  }
}
