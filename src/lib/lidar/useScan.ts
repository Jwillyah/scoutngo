import { useCallback, useEffect, useState } from 'react'
import type { Building } from '../buildings.ts'
import { DENSITY_DEFAULT, DENSITY_HIGH } from './ept.ts'
import { areaFor } from './grid.ts'
import { offerFor, type LidarOffer } from './offer.ts'
import { downloadScan, type ScanProgress } from './scan.ts'
import { forgetScan, loadScan, type StoredScan } from './store.ts'
import { applyScan, scanContext, type ScanContext } from './applyScan.ts'
import { applyOverture, fetchOvertureHeights, readOvertureHeights } from './overture.ts'

/*
 * A VENUE'S SCAN, FOR THE SCREEN: what is offered (worked out with no
 * network), the download as it goes, and the scan once kept. A finished or
 * forgotten scan is announced (SCAN_EVENT) so everything that fetched
 * buildings fetches them again with the new heights.
 */
export const SCAN_EVENT = 'scoutngo:scan'

const contexts = new Map<string, Promise<ScanContext | null>>()

/** The kept scan for the patch around a point, as heights to apply, or null. Cached per patch. */
export function scanContextAt(lat: number, lon: number): Promise<ScanContext | null> {
  const id = areaFor(lat, lon).id
  let hit = contexts.get(id)
  if (hit === undefined) {
    hit = loadScan(id).then((s) => (s === null ? null : scanContext(s)))
    contexts.set(id, hit)
  }
  return hit
}

/** The buildings with the scan's heights, when a scan of their patch is kept. */
export async function withScan(buildings: Building[], centre: { lat: number; lon: number }): Promise<Building[]> {
  const ctx = await scanContextAt(centre.lat, centre.lon)
  if (ctx !== null) return applyScan(buildings, ctx)
  /* Outside the lidar: Overture's heights, if they were fetched for this patch (overture.ts). */
  const o = readOvertureHeights(areaFor(centre.lat, centre.lon).id)
  return o === null ? buildings : applyOverture(buildings, o)
}

export type ScanState =
  /* No lidar here: Overture's heights may be fetched instead (filled says how many, once fetched). */
  /* Not looked yet: whether a scan is kept, or offered, is not known. Never said as "none". */
  | { status: 'checking' }
  | { status: 'none'; overture: number | null }
  | { status: 'fetching-overture' }
  | { status: 'offered'; offer: LidarOffer; high: LidarOffer | null }
  | { status: 'downloading'; offer: LidarOffer; progress: ScanProgress | null }
  | { status: 'kept'; scan: StoredScan }
  | { status: 'failed'; offer: LidarOffer; reason: string }

export function useScan(venue: { lat: number; lon: number } | null, buildings: readonly Building[]) {
  const [state, setState] = useState<ScanState>({ status: 'checking' })
  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null
  useEffect(() => {
    if (lat === null || lon === null) return
    let live = true
    void (async () => {
      const kept = await loadScan(areaFor(lat, lon).id)
      if (!live) return
      if (kept !== null) return setState({ status: 'kept', scan: kept })
      const offer = await offerFor(lat, lon, DENSITY_DEFAULT)
      const high = await offerFor(lat, lon, DENSITY_HIGH)
      const filled = readOvertureHeights(areaFor(lat, lon).id)
      if (live) setState(offer === null ? { status: 'none', overture: filled === null ? null : Object.keys(filled.heights).length } : { status: 'offered', offer, high: high !== null && high.density > offer.density ? high : null })
    })()
    return () => {
      live = false
    }
  }, [lat, lon])

  const download = useCallback(
    async (offer: LidarOffer) => {
      setState({ status: 'downloading', offer, progress: null })
      try {
        const scan = await downloadScan(offer, offer.density, buildings, (progress) => setState({ status: 'downloading', offer, progress }))
        contexts.delete(scan.id)
        setState({ status: 'kept', scan })
        window.dispatchEvent(new CustomEvent(SCAN_EVENT))
      } catch (error) {
        setState({ status: 'failed', offer, reason: error instanceof Error ? error.message : String(error) })
      }
    },
    [buildings],
  )

  const forget = useCallback(async (id: string) => {
    await forgetScan(id)
    contexts.delete(id)
    window.dispatchEvent(new CustomEvent(SCAN_EVENT))
    setState({ status: 'none', overture: null })
  }, [])

  const fillFromOverture = useCallback(async () => {
    if (lat === null || lon === null) return
    setState({ status: 'fetching-overture' })
    try {
      const o = await fetchOvertureHeights(buildings, areaFor(lat, lon).id)
      setState({ status: 'none', overture: Object.keys(o.heights).length })
      window.dispatchEvent(new CustomEvent(SCAN_EVENT))
    } catch {
      setState({ status: 'none', overture: null })
    }
  }, [buildings, lat, lon])

  /* No venue: nothing is offered, whatever the last venue's state was. */
  return { state: lat === null ? ({ status: 'none', overture: null } as ScanState) : state, download, forget, fillFromOverture }
}
