import { useEffect, useState } from 'react'
import type { BestView } from '../core/bestView.ts'
import type { LatLon } from '../core/geo.ts'
import { fetchBestView } from './bestViewData.ts'

/** The best view for an event (src/core/bestView.ts); null while it is worked out, or without the map's sea. */
export function useBestView(venue: LatLon | null, event: Date | null): BestView | null {
  const key = venue === null || event === null ? null : `${venue.lat.toFixed(2)},${venue.lon.toFixed(2)}@${event.getTime()}`
  const [got, setGot] = useState<{ key: string; view: BestView | null } | null>(null)
  useEffect(() => {
    if (key === null || venue === null || event === null) return
    let live = true
    void fetchBestView(venue, event).then((view) => {
      if (live) setGot({ key, view })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return got !== null && got.key === key ? got.view : null
}

/* The map draws a guide when asked: Sky › Special's rainbow, and this wedge (PlanMode listens). */
export const GUIDE_EVENT = 'scoutngo:guide'
export function showGuide(fc: GeoJSON.FeatureCollection): void {
  window.dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: fc }))
}
