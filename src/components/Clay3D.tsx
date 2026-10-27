import { clayStatus, type ClayStatus } from '../lib/clayStatus.ts'
import { useEffect, useRef, useState } from 'react'
import { SENSORS } from '../core/fov.ts'
import type { LatLon } from '../core/geo.ts'
import { frameBox, observerPose, viewWidthDegrees, zoomWithin } from '../core/observer.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'
import { localDate } from '../core/moonTimes.ts'
import { ensure3dOverview } from '../lib/offline3d.ts'
import { loadPlace, onPlace, placeState, type PlaceState } from '../lib/place.ts'
import type { StandRequest } from '../lib/standRequest.ts'
import type { ClayScene, GroundStatus, Pin } from '../three/clayScene.ts'

/*
 * THE 3D VIEW: a clay model of the place, at the time on the time bar.
 *
 * It sits where the map is, under the same top bar, sheet and time bar, so
 * the plan's controls keep working on it. CesiumJS is only fetched when this
 * opens (the import below), and its files come from this app's own origin.
 *
 * STAND HERE puts the eye at a position: 1.6 m up on foot, or the planned
 * height for a drone spot, facing the aim, with the lens's frame drawn on the
 * screen and a zoom between the lens's two ends.
 */

declare const __CESIUM_BASE__: string


interface Clay3DProps {
  venue: LatLon
  /** For the saved overview's name in the offline list. */
  venueLabel: string
  at: Date
  timeZone: string
  pins: readonly Pin[]
  stand: StandRequest | null
  onLeaveStand: () => void
}

export const CLAY_NOTE = 'Clay model from map data; real buildings may differ'

export function Clay3D({ venue, venueLabel, at, timeZone, pins, stand, onLeaveStand }: Clay3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ClayScene | null>(null)
  const [ready, setReady] = useState(false)
  /* The first view's tiles have arrived: until then the canvas is hidden and the 2D map shows through. */
  const [shown, setShown] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [place, setPlace] = useState<PlaceState>(() => placeState())
  const [flat, setFlat] = useState(0)
  /* The zoom belongs to one Stand here: a new one starts at its own focal length. */
  const [zoom, setZoom] = useState<{ tick: number; focal: number } | null>(null)
  const [width, setWidth] = useState(0)
  const status = useRef<GroundStatus>({ flatTiles: 0 })

  /* Build the scene once, for this venue. */
  useEffect(() => {
    let cancelled = false
    let made: ClayScene | null = null
    ;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = __CESIUM_BASE__
    import('../three/clayScene.ts')
      .then(({ createClayScene }) => {
        if (cancelled || host.current === null) return
        made = createClayScene(host.current, venue, timeZone, status.current, () => setFlat(status.current.flatTiles))
        scene.current = made
        ;(window as unknown as { __clay?: ClayScene }).__clay = made
        setReady(true)
        void made.whenShown().then(() => {
          if (!cancelled) setShown(true)
        })
      })
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : String(error)))
    return () => {
      cancelled = true
      made?.destroy()
      scene.current = null
      setShown(false)
    }
    /* The coordinate, not the object: the same place must not rebuild the engine. */
  }, [venue.lat, venue.lon, timeZone]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * THE BUILDINGS AND TREES, from the place App loads when the venue is set
   * (src/lib/place.ts): buildings from the map tiles, trees from Overpass
   * after them. The copy saved on the phone is drawn at once. Only the
   * buildings can put up the pill; trees that did not load are a word in the
   * legend.
   */
  useEffect(() => onPlace(setPlace), [])
  useEffect(() => {
    if (ready && place.buildings !== null) scene.current?.setBuildings(place.buildings.list)
  }, [ready, place.buildings])
  useEffect(() => {
    if (ready && place.trees?.status === 'drawn') scene.current?.setTrees(place.trees.trees)
  }, [ready, place.trees])

  /* The coarse tiles the overview stands on, saved once per venue so 3D opens with no signal (src/lib/offline3d.ts). */
  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    void ensure3dOverview(venue, venueLabel, controller.signal)
    return () => controller.abort()
  }, [ready, venue, venueLabel])

  useEffect(() => {
    if (ready) scene.current?.setPins(pins)
  }, [ready, pins])

  /* Cesium's clock and our light follow the time bar; the sky arcs are redrawn per day. */
  const day = localDate(at, timeZone)
  useEffect(() => {
    if (!ready) return
    const midnight = zonedTimeToUtc(day, '00:00', timeZone)
    if (midnight !== null) scene.current?.setSkyDay(midnight)
  }, [ready, day, timeZone])
  useEffect(() => {
    if (ready) scene.current?.setTime(at)
  }, [ready, at])

  /* The canvas's width, for the frame box. */
  useEffect(() => {
    const el = host.current
    if (el === null) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /* Stand here, or back to the overview. */
  const lensFocal =
    stand === null ? null : zoomWithin(zoom !== null && zoom.tick === stand.tick ? zoom.focal : stand.focal, stand.lensMin, stand.lensMax)
  useEffect(() => {
    if (!ready) return
    if (stand === null) {
      scene.current?.orbit()
      return
    }
    const pose = observerPose({ standAt: stand.at, aimAt: stand.aimAt, droneFeet: stand.droneFeet })
    const lens = frameBox(stand.focal, SENSORS[stand.sensor], 60, 100)
    void scene.current?.observe({
      at: stand.at,
      heightAboveGround: pose.heightAboveGround,
      heading: stand.bearing ?? pose.heading,
      pitch: pose.pitch,
      viewHorizontal: viewWidthDegrees(lens.lensHorizontal),
    })
  }, [ready, stand])

  const pill = clayStatus(failed, shown, place)
  const unknown = place.buildings?.list.filter((b) => b.height.metres === null).length ?? 0

  const box =
    stand === null || lensFocal === null || width === 0
      ? null
      : frameBox(lensFocal, SENSORS[stand.sensor], viewWidthDegrees(frameBox(stand.focal, SENSORS[stand.sensor], 60, 100).lensHorizontal), width)

  return (
    <div className={shown ? 'clay clay--shown' : 'clay clay--waiting'}>
      <div ref={host} className="clay__canvas" />
      {box === null ? null : (
        <div className="clay__frame" style={{ width: `${box.width}px`, height: `${box.height}px` }} aria-hidden="true" />
      )}
      {/*
        * ONE THING AT THE FOOT, NEVER A STACK. On 27 Oct three messages stood
        * one over another here. Now the most important status is the one
        * pill (claySatus below); with nothing to report, the one legend line.
        */}
      <div className="clay__legend">
        {pill !== null ? (
          <ClayPill status={pill} reason={place.reason} onRetry={() => void loadPlace(venue, { retry: true })} />
        ) : (
          <p className="clay__line">
            <span className="clay__note">{CLAY_NOTE}</span>
            {place.buildings === null ? null : (
              <>
                {` · ${place.buildings.list.length} buildings`}
                {place.buildings.savedAt === null ? '' : `, saved on this phone ${place.buildings.savedAt.slice(0, 10)}`}
                {unknown > 0 ? (
                  <>
                    {' · '}
                    <span className="clay__swatch clay__swatch--unknown" aria-hidden="true" />
                    {unknown} heights unknown (lighter, no shadow)
                  </>
                ) : null}
                {place.trees?.status === 'drawn'
                  ? ` · ${place.trees.trees.length} mapped trees`
                  : place.trees?.status === 'sparse'
                    ? ` · no trees drawn, only ${place.trees.count} mapped here`
                    : place.trees?.status === 'unavailable'
                      ? " · trees didn't load"
                      : ''}
              </>
            )}
            {flat > 0 ? ' · some ground flat (no saved elevation)' : ''}
          </p>
        )}
      </div>
      {stand === null || lensFocal === null ? null : (
        <div className="clay__stand">
          <p className="clay__standname">
            Standing at {stand.label}
            {stand.droneFeet === null ? ', eye height 1.6 m' : `, ${stand.droneFeet} ft up`}
          </p>
          {stand.lensMin < stand.lensMax ? (
            <label className="clay__zoom">
              <span className="num">{Math.round(lensFocal)}mm</span>
              <input
                type="range"
                min={stand.lensMin}
                max={stand.lensMax}
                step={1}
                value={lensFocal}
                onChange={(e) => setZoom({ tick: stand.tick, focal: Number(e.target.value) })}
                aria-label="Zoom between the lens's two ends"
              />
            </label>
          ) : (
            <p className="clay__line num">{Math.round(lensFocal)}mm, fixed</p>
          )}
          <button type="button" className="btn btn--small" onClick={onLeaveStand}>
            Back to the overview
          </button>
        </div>
      )}
    </div>
  )
}


/*
 * THE ONE STATUS, MOST IMPORTANT FIRST: 3D could not start, the map data
 * did not load (with Retry), the view still loading, the map data still
 * loading. The buildings come from the map tiles; the trees, from Overpass,
 * never put it up. Only the Retry takes a touch; the rest lets the map have it.
 */
export function ClayPill({ status, reason, onRetry }: { status: ClayStatus; reason: string | null; onRetry: () => void }) {
  if (status.kind === 'broken') return <p className="clay__pill">3D could not start: {status.why}</p>
  if (status.kind === 'view-loading') return <p className="clay__pill">Loading the 3D view…</p>
  if (status.kind === 'map-loading') return <p className="clay__pill">Loading map data…</p>
  return (
    <p className="clay__pill" title={reason ?? undefined}>
      Map data didn't load ·{' '}
      <button type="button" className="clay__pillbtn" onClick={onRetry}>
        Retry
      </button>
    </p>
  )
}
