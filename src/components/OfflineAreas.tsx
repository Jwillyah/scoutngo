import { useEffect, useRef, useState } from 'react'
import {
  areaLabel,
  areaUrls,
  deleteArea,
  MAX_TRIP_TILES,
  downloadArea,
  formatBytes,
  loadAreas,
  measureArea,
  onAreasChanged,
  sizeLine,
  tilesToFetch,
  totalBytes,
  type AreaSize,
  type SavedArea,
} from '../lib/offlineCache.ts'
import { IMAGERY_ZOOMS, TERRAIN_ZOOMS } from '../lib/offlineSources.ts'
import type { Box } from '../lib/tileRange.ts'
import type { VenueCacheState } from '../lib/useVenueCache.ts'
import { distanceMeters } from '../core/geo.ts'

/*
 * OFFLINE, ON THE SHOOT CARD.
 *
 * Three things, one place:
 *
 *   THE VENUE, which saves itself (src/lib/useVenueCache.ts). One line: what
 *   is being saved and its size, or that it is saved.
 *
 *   TAKE THIS AREA OFFLINE, for a trip. The area is the map as it is framed
 *   now, so "the trailhead and the ridge" is a pinch away rather than a form.
 *   The size is taken by HEAD request and on screen before anything downloads, and there
 *   is no download without it: the button that downloads only exists once a
 *   size is showing.
 *
 *   WHAT IS SAVED, with sizes and dates, each deletable.
 */

type TripState =
  | { status: 'closed' }
  | { status: 'measuring'; box: Box; done: number; total: number }
  | { status: 'measured'; box: Box; size: AreaSize }
  | { status: 'too-big'; tiles: number }
  | { status: 'downloading'; box: Box; size: AreaSize; done: number; total: number; bytes: number }
  | { status: 'done'; area: SavedArea }
  | { status: 'error'; reason: string }

interface OfflineAreasProps {
  venueCache: VenueCacheState
  /** The map's current view, or null when the map is not up. */
  getView: () => Box | null
  /** What a trip area is named after. */
  venueName: string
  online: boolean
  /** A "Save for offline" pack holds this venue: the ring's own line would be a second, smaller size for the same place. */
  packed?: boolean
}

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })

/** "2.1 × 1.4 km", across and up, measured on the ground. */
function boxSize(box: Box): string {
  const mid = (box.south + box.north) / 2
  const across = distanceMeters({ lat: mid, lon: box.west }, { lat: mid, lon: box.east })
  const up = distanceMeters({ lat: box.south, lon: box.west }, { lat: box.north, lon: box.west })
  const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)
  return `${km(across)} × ${km(up)}`
}

export function OfflineAreas({ venueCache, getView, venueName, online, packed = false }: OfflineAreasProps) {
  const [areas, setAreas] = useState<SavedArea[]>(() => loadAreas())
  const [trip, setTrip] = useState<TripState>({ status: 'closed' })
  const [confirming, setConfirming] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => onAreasChanged(() => setAreas(loadAreas())), [])
  useEffect(() => () => abort.current?.abort(), [])

  const measureView = async () => {
    const box = getView()
    if (box === null) {
      setTrip({ status: 'error', reason: 'The map is not up yet.' })
      return
    }
    const tiles = areaUrls(box).imagery.length
    if (tiles > MAX_TRIP_TILES) {
      setTrip({ status: 'too-big', tiles })
      return
    }
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setTrip({ status: 'measuring', box, done: 0, total: tiles })
    const size = await measureArea(box, IMAGERY_ZOOMS, TERRAIN_ZOOMS, controller.signal, (done, total) =>
      setTrip({ status: 'measuring', box, done, total }),
    )
    if (controller.signal.aborted) return
    setTrip({ status: 'measured', box, size })
  }

  const download = async (box: Box, size: AreaSize) => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    const total = tilesToFetch(size)
    setTrip({ status: 'downloading', box, size, done: 0, total, bytes: 0 })
    const result = await downloadArea(
      {
        kind: 'trip',
        label: `Around ${venueName}, ${boxSize(box)}`,
        box,
        imageryZooms: [IMAGERY_ZOOMS[0], IMAGERY_ZOOMS[1]],
        terrainZooms: [TERRAIN_ZOOMS[0], TERRAIN_ZOOMS[1]],
      },
      controller.signal,
      (done, all, bytes) => setTrip({ status: 'downloading', box, size, done, total: all, bytes }),
    )
    if (result.status === 'ok') setTrip({ status: 'done', area: result.area })
    else if (result.status === 'cancelled') setTrip({ status: 'closed' })
    else setTrip({ status: 'error', reason: result.reason })
  }

  const cancel = () => {
    abort.current?.abort()
    setTrip({ status: 'closed' })
  }

  const venueLine = packed ? null : (() => {
    switch (venueCache.status) {
      case 'saving':
        return `Saving this venue for offline · ${venueCache.size} · ${venueCache.done} of ${venueCache.total}`
      case 'measuring':
        return 'Measuring this venue for offline…'
      case 'saved':
        return `This venue is saved for offline · ${formatBytes(venueCache.area.bytes)} · ${day(venueCache.area.savedAt)}`
      case 'offline':
        return 'No signal. This venue was not saved before it went.'
      case 'skipped':
      case 'error':
        return venueCache.reason
      default:
        return null
    }
  })()
  const venueNote = packed
    ? null
    : venueCache.status === 'saving'
      ? venueCache.note
      : venueCache.status === 'saved'
        ? (venueCache.area.note ?? null)
        : null

  const total = areas.reduce((sum, a) => sum + a.bytes, 0)

  return (
    <section className="offl" aria-label="Offline">
      {venueLine === null ? null : <p className="offl__venue">{venueLine}</p>}
      {venueNote === null ? null : <p className="offl__note">{venueNote}</p>}

      {trip.status === 'closed' ? (
        <button
          type="button"
          className="btn btn--small offl__take"
          onClick={() => void measureView()}
          disabled={!online}
        >
          Take this area offline
        </button>
      ) : null}
      {trip.status === 'closed' && !online ? (
        <p className="offl__note">Needs a signal. What is already saved is below.</p>
      ) : null}

      {trip.status === 'measuring' ? (
        <div className="offl__trip">
          <p className="offl__area">The map as framed now, {boxSize(trip.box)}</p>
          <p className="offl__note num">
            Measuring {trip.done} of {trip.total} tiles. Nothing is downloaded yet.
          </p>
          <button type="button" className="btn btn--small" onClick={cancel}>
            Cancel
          </button>
        </div>
      ) : null}

      {trip.status === 'measured' ? (
        <div className="offl__trip">
          <p className="offl__area">The map as framed now, {boxSize(trip.box)}</p>
          <p className="offl__size num">{sizeLine(trip.size)}</p>
          <p className="offl__note">
            Imagery z{IMAGERY_ZOOMS[0]}–{IMAGERY_ZOOMS[1]} and terrain. Zoom out to take more,
            in to take less, then measure again.
          </p>
          <div className="offl__acts">
            {/* NO SIZE, NO DOWNLOAD: this button exists only once one is showing. */}
            {trip.size.imageryBytes === null ||
            tilesToFetch(trip.size) === 0 ? null : (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => void download(trip.box, trip.size)}
              >
                Download {formatBytes(totalBytes(trip.size) ?? 0)}
              </button>
            )}
            <button type="button" className="btn btn--small btn--quiet" onClick={() => void measureView()}>
              Measure this view again
            </button>
            <button type="button" className="btn btn--small btn--quiet" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {trip.status === 'too-big' ? (
        <div className="offl__trip">
          <p className="offl__note num">
            This view is {trip.tiles} tiles at full detail, too many to take at once. Zoom in to
            the part you need.
          </p>
          <button type="button" className="btn btn--small btn--quiet" onClick={cancel}>
            OK
          </button>
        </div>
      ) : null}

      {trip.status === 'downloading' ? (
        <div className="offl__trip">
          <p className="offl__area">The map as framed now, {boxSize(trip.box)}</p>
          <progress className="offl__bar" max={Math.max(1, trip.total)} value={trip.done} />
          <p className="offl__note num">
            {trip.done} of {trip.total} tiles · {formatBytes(trip.bytes)} of{' '}
            {formatBytes(totalBytes(trip.size) ?? 0)}
          </p>
          <button type="button" className="btn btn--small" onClick={cancel}>
            Cancel
          </button>
        </div>
      ) : null}

      {trip.status === 'done' ? (
        <p className="offl__note">
          Saved · {formatBytes(trip.area.bytes)}.{' '}
          <button type="button" className="offl__link" onClick={() => setTrip({ status: 'closed' })}>
            Done
          </button>
        </p>
      ) : null}

      {trip.status === 'error' ? (
        <p className="offl__note">
          {trip.reason}{' '}
          <button type="button" className="offl__link" onClick={() => setTrip({ status: 'closed' })}>
            OK
          </button>
        </p>
      ) : null}

      {areas.length === 0 ? null : (
        <details className="offl__saved">
          <summary className="offl__sum num">
            Saved on this phone · {areas.length} {areas.length === 1 ? 'area' : 'areas'} ·{' '}
            {formatBytes(total)}
          </summary>
          <ul className="offl__list">
            {areas.map((area) => (
              <li className="offl__row" key={area.id}>
                <span className="offl__name">
                  {areaLabel(area.label, venueName)}
                  <span className="offl__meta num">
                    {area.kind === 'venue' ? 'venue' : area.kind === '3d' ? '3D overview' : 'trip'} · {formatBytes(area.bytes)} ·{' '}
                    {day(area.savedAt)}
                  </span>
                </span>
                {/* Two taps, the second naming what goes. */}
                {confirming === area.id ? (
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => {
                      setConfirming(null)
                      void deleteArea(area.id).then(setAreas)
                    }}
                  >
                    Delete {formatBytes(area.bytes)}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--small btn--quiet"
                    onClick={() => setConfirming(area.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
