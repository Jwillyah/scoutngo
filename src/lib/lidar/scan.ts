/*
 * DOWNLOADING A VENUE'S 3D SCAN, AFTER THE TAP AND NOT BEFORE.
 *
 * The project's metadata and tile index first (small), the depth that gives
 * the density asked for (ept.ts), then the point tiles in a worker
 * (scan.worker.ts), and the result kept on the phone (store.ts). Straight
 * from the USGS bucket to the phone: nothing goes through our server.
 */
import { LIDAR_BUCKET, nodesFor, pickDepth, type EptMeta } from './ept.ts'
import type { LidarOffer } from './offer.ts'
import { saveScan, toDecimetres, type StoredScan } from './store.ts'
import type { ScanMessage } from './scanTypes.ts'
import type { Building } from '../buildings.ts'
import { mercator } from './grid.ts'

export interface ScanProgress {
  done: number
  total: number
  bytes: number
}

export async function downloadScan(offer: LidarOffer, density: number, buildings: readonly Building[], onProgress: (p: ScanProgress) => void): Promise<StoredScan> {
  const footprints = buildings.map((b) => ({ id: b.id, ring: b.ring.map(([lon, lat]) => mercator(lat, lon)) }))
  const base = `${LIDAR_BUCKET}/${offer.project}`
  const meta = (await (await fetch(`${base}/ept.json`)).json()) as EptMeta
  const nodes = await nodesFor(meta, offer.area, async (key) => (await (await fetch(`${base}/ept-hierarchy/${key}.json`)).json()) as Record<string, number>)
  if (nodes.length === 0) throw new Error('The scan has no points over this place.')
  const pick = pickDepth(nodes, offer.area, density)
  const worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' })
  try {
    const done = await new Promise<Extract<ScanMessage, { kind: 'done' }>>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<ScanMessage>) => {
        if (e.data.kind === 'progress') onProgress(e.data)
        else if (e.data.kind === 'done') resolve(e.data)
        else reject(new Error(e.data.reason))
      }
      worker.onerror = (e) => reject(new Error(e.message))
      worker.postMessage({ base, keys: pick.nodes.map((n) => n.key), area: offer.area, footprints })
    })
    const scan: StoredScan = {
      id: offer.area.id,
      project: offer.project,
      year: offer.year,
      savedAt: new Date().toISOString(),
      bytes: done.bytes,
      density: pick.density,
      width: done.width,
      height: done.height,
      cell: done.cell,
      minx: done.minx,
      maxy: done.maxy,
      dtm: toDecimetres(done.dtm),
      dsm: toDecimetres(done.dsm),
      kind: done.kind2,
      water: done.water,
      heights: done.heights,
    }
    if (!(await saveScan(scan))) throw new Error('This phone would not keep the scan.')
    return scan
  } finally {
    worker.terminate()
  }
}
