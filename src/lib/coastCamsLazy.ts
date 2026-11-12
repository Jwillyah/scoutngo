import { useEffect, useState } from 'react'
import type { CoastCam } from '../data/coastCams.ts'

/*
 * THE COAST CAMS, LOADED WHEN FIRST ASKED (Batch Polish 2, Section 4): the
 * list (about 280 cams) is a file of its own rather than part of the first
 * paint's JavaScript. The home's Cams row and the surf beach read it a moment
 * after the page is drawn.
 */
let list: readonly CoastCam[] | null = null
let pending: Promise<readonly CoastCam[]> | null = null

export function loadCoastCams(): Promise<readonly CoastCam[]> {
  pending ??= import('../data/coastCams.ts').then((m) => (list = m.COAST_CAMS))
  return pending
}

/** The cams, or null until they have loaded. */
export function useCoastCams(): readonly CoastCam[] | null {
  const [cams, setCams] = useState<readonly CoastCam[] | null>(list)
  useEffect(() => {
    if (cams !== null) return
    let live = true
    void loadCoastCams().then((l) => live && setCams(l))
    return () => {
      live = false
    }
  }, [cams])
  return cams
}
