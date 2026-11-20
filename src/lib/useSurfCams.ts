import { useEffect, useState } from 'react'
import { surfCams, type CamAt, type CamEntry } from '../core/camPick.ts'
import type { LatLon } from '../core/geo.ts'
import { keepSurfCam, readSurfCam } from './surfCam.ts'

/*
 * THE SURF CAMS, LOADED WHEN ASKED (Batch SIMPLE-2, Section 6.3): src/data/cams.json
 * is 215 KB, so it is a chunk of its own, fetched with the app's own files the
 * first time the Cams tab (or the page's header) wants it. `list` is null
 * while it loads. Which cam you picked is one id on this phone.
 */
export function useSurfCams(spot: LatLon, wanted: boolean): { list: CamAt[] | null; picked: string | null; pick: (id: string) => void } {
  const [all, setAll] = useState<readonly CamEntry[] | null>(null)
  const [picked, setPicked] = useState<string | null>(() => readSurfCam())
  useEffect(() => {
    if (!wanted || all !== null) return
    let live = true
    void import('../data/cams.json').then(
      (m) => live && setAll(m.default as unknown as CamEntry[]),
      () => live && setAll([]),
    )
    return () => {
      live = false
    }
  }, [wanted, all])
  const list = all === null ? null : surfCams(spot, all)
  return {
    list,
    picked,
    pick: (id) => {
      keepSurfCam(id)
      setPicked(id)
    },
  }
}
