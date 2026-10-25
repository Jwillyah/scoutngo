import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import {
  downloadArea,
  fitsCeiling,
  isOnline,
  loadAreas,
  measureArea,
  sameBox,
  sizeLine,
  venueBox,
  type SavedArea,
} from './offlineCache.ts'
import { IMAGERY_ZOOMS, TERRAIN_ZOOMS } from './offlineSources.ts'

/*
 * THE VENUE SAVES ITSELF.
 *
 * WHY THERE IS NO BUTTON. The field pack was optional, it was forgotten, and
 * the Shenandoah trip failed because of it. Optional preparation is not
 * preparation. So opening a venue with signal saves its imagery and terrain
 * for the ring the shooter can reach, without being asked.
 *
 * BUT NEVER WITHOUT THE SIZE FIRST. The size is measured before a single tile
 * is downloaded and is on the shoot card while it saves: "Saving this venue
 * for offline · 2.3 MB". At the default ring that is 2.34 MB and at the
 * 2000 m maximum 29.61 MB (measurements/2026-10-25-venue-cache-400m.md,
 * measurements/2026-10-25-venue-cache-2000m.md). Over the 40 MB ceiling the
 * top zoom is left out and the card says so.
 *
 * SETTLED BEFORE IT STARTS. Dragging the pin or the ring changes the area
 * dozens of times a second; nothing is measured until both have been still
 * for SETTLE_MS, and a change cancels whatever was in flight.
 */
export const SETTLE_MS = 3000

export type VenueCacheState =
  | { status: 'idle' }
  /** No signal: nothing to do, and the card says what IS saved instead. */
  | { status: 'offline' }
  | { status: 'measuring' }
  | { status: 'saving'; size: string; done: number; total: number; note: string | null }
  | { status: 'saved'; area: SavedArea }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; reason: string }

const savedFor = (box: ReturnType<typeof venueBox>): SavedArea | null =>
  loadAreas().find((a) => a.kind === 'venue' && sameBox(a.box, box)) ?? null

export function useVenueCache(
  centre: LatLon | null,
  radiusMeters: number,
  label: string,
): VenueCacheState {
  const [state, setState] = useState<VenueCacheState>({ status: 'idle' })
  const lat = centre?.lat ?? null
  const lon = centre?.lon ?? null

  useEffect(() => {
    if (lat === null || lon === null) {
      setState({ status: 'idle' })
      return
    }
    const box = venueBox({ lat, lon }, radiusMeters)
    const already = savedFor(box)
    if (already !== null) {
      setState({ status: 'saved', area: already })
      return
    }
    if (!isOnline()) {
      setState({ status: 'offline' })
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(() => {
      void (async () => {
        setState({ status: 'measuring' })
        let imageryZooms: [number, number] = [IMAGERY_ZOOMS[0], IMAGERY_ZOOMS[1]]
        let size = await measureArea(box, imageryZooms, TERRAIN_ZOOMS, controller.signal)
        if (controller.signal.aborted) return
        if (size.imageryBytes === null) {
          setState({ status: 'skipped', reason: 'Not saved for offline: the signal dropped while measuring.' })
          return
        }
        let note: string | null = null
        /* THE CEILING. Leave out the top zoom rather than store past it, and say so. */
        if (!fitsCeiling(size)) {
          const over = sizeLine(size)
          imageryZooms = [IMAGERY_ZOOMS[0], IMAGERY_ZOOMS[1] - 1]
          size = await measureArea(box, imageryZooms, TERRAIN_ZOOMS, controller.signal)
          if (controller.signal.aborted) return
          if (!fitsCeiling(size)) {
            setState({
              status: 'skipped',
              reason: `Not saved for offline: this ring measured ${over}, over the 40 MB the automatic save allows. Take a smaller area offline by hand.`,
            })
            return
          }
          note = `Closest zoom left out: the full set measured ${over}.`
        }

        const line = sizeLine(size)
        setState({ status: 'saving', size: line, done: 0, total: size.imageryTiles + size.terrainTiles, note })
        const result = await downloadArea(
          {
            kind: 'venue',
            label,
            box,
            imageryZooms,
            terrainZooms: [TERRAIN_ZOOMS[0], TERRAIN_ZOOMS[1]],
            ...(note === null ? {} : { note }),
          },
          controller.signal,
          (done, total) => setState({ status: 'saving', size: line, done, total, note }),
        )
        if (controller.signal.aborted) return
        setState(
          result.status === 'ok'
            ? { status: 'saved', area: result.area }
            : result.status === 'error'
              ? { status: 'error', reason: `Not saved for offline: ${result.reason}` }
              : { status: 'idle' },
        )
      })()
    }, SETTLE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    /* The label is only what the list calls it; it is not a reason to save again. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, radiusMeters])

  return state
}
