/*
 * A VENUE'S SCAN, KEPT ON THE PHONE (IndexedDB, 'scoutngo-lidar'), nothing
 * about it anywhere else. Heights as whole decimetres in Int16 (to 3276 m),
 * which halves the size and loses nothing a 1 m grid can show.
 */
import type { Rasters } from './raster.ts'

export interface StoredScan {
  id: string
  project: string
  year: number | null
  savedAt: string
  bytes: number
  density: number
  width: number
  height: number
  cell: number
  minx: number
  maxy: number
  dtm: Int16Array
  dsm: Int16Array
  kind: Uint8Array
  /** 1 where water returns fell (raster.ts). */
  water?: Uint8Array
  /**
   * Each footprint's height from the scan, measured two ways at download time
   * (buildingHeights.ts), by the footprint's id; 'newer' when it has no roof
   * returns. Footprints the app learns of later are measured from the rasters.
   */
  heights: Record<string, { metres: number; byRaster: number } | 'newer'>
}

const DB = 'scoutngo-lidar'
const STORE = 'scans'

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

export const toDecimetres = (g: Float32Array): Int16Array => Int16Array.from(g, (v) => (Number.isNaN(v) ? -32768 : Math.max(-32767, Math.min(32767, Math.round(v * 10)))))
export const fromDecimetres = (g: Int16Array): Float32Array => Float32Array.from(g, (v) => (v === -32768 ? Number.NaN : v / 10))

export function rastersOf(s: StoredScan): Rasters {
  return { width: s.width, height: s.height, cell: s.cell, minx: s.minx, maxy: s.maxy, dtm: fromDecimetres(s.dtm), dsm: fromDecimetres(s.dsm), kind: s.kind, water: s.water }
}

export async function saveScan(scan: StoredScan): Promise<boolean> {
  const db = await open()
  if (db === null) return false
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(scan)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
  })
}

export async function loadScan(id: string): Promise<StoredScan | null> {
  const db = await open()
  if (db === null) return null
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as StoredScan | undefined) ?? null)
    req.onerror = () => resolve(null)
  })
}

export async function forgetScan(id: string): Promise<void> {
  const db = await open()
  if (db === null) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}
