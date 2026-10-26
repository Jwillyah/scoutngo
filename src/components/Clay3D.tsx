import { useEffect, useRef, useState } from 'react'
import { SENSORS } from '../core/fov.ts'
import type { LatLon } from '../core/geo.ts'
import { frameBox, observerPose, viewWidthDegrees, zoomWithin } from '../core/observer.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'
import { localDate } from '../core/moonTimes.ts'
import { fetchBuildings, savedBuildingsFor, type Building } from '../lib/buildings.ts'
import { loadSeaMask, onSeaMask, seaStatus, type SeaStatus } from '../lib/seaMask.ts'
import { ensure3dOverview } from '../lib/offline3d.ts'
import { MIN_INTERVAL_MS } from '../lib/overpass.ts'
import { boxAround } from '../lib/tileRange.ts'
import { fetchTrees, type TreesResult } from '../lib/trees.ts'
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

/* 600 m around the venue for buildings: past that a clay box is a speck. */
const BUILDING_REACH_M = 600
/*
 * The longest "Loading buildings" may stay on screen before it says they did
 * not load. 50 s from the moment the scene is up, so that with the scene's own
 * few seconds the answer is on screen within a minute of tapping 3D: measured
 * 62 s at 60.
 */
export const BUILDING_DEADLINE_MS = 50_000

export const CLAY_NOTE = 'Clay model from map data. Real buildings may differ; unknown heights shown lighter.'

export function Clay3D({ venue, venueLabel, at, timeZone, pins, stand, onLeaveStand }: Clay3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ClayScene | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [buildings, setBuildings] = useState<{ total: number; unknown: number; savedAt: string | null } | { problem: string } | 'loading'>('loading')
  const [buildingsTry, setBuildingsTry] = useState(0)
  const [trees, setTrees] = useState<TreesResult | null>(null)
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
      })
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : String(error)))
    return () => {
      cancelled = true
      made?.destroy()
      scene.current = null
    }
  }, [venue, timeZone])

  /*
   * THE BUILDINGS, THEN THE TREES, from the same Overpass the 2D map uses.
   *
   * WITHIN A MINUTE, ONE WAY OR THE OTHER. "Loading buildings…" once sat on
   * screen for good at Virginia Beach while Overpass retried and timed out
   * behind it. Now: the copy saved on the phone is drawn at once when there
   * is one (and refreshed behind it); otherwise one fetch, waited out once if
   * Overpass says it was asked moments ago, and given up on at
   * BUILDING_DEADLINE_MS with "Buildings didn't load" and a Retry.
   */
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const bounds = boxAround(venue, BUILDING_REACH_M)
    const started = Date.now()
    const left = () => BUILDING_DEADLINE_MS - (Date.now() - started)
    const draw = (list: readonly Building[], savedAt: string | null) => {
      scene.current?.setBuildings(list)
      setBuildings({ total: list.length, unknown: list.filter((b) => b.height.metres === null).length, savedAt })
    }
    const saved = savedBuildingsFor(bounds)
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      if (saved !== null) draw(saved.buildings, saved.fetchedAt)
      else setBuildings('loading')
      let result = await fetchBuildings(bounds, Math.max(1000, left()))
      if (result.status !== 'ok' && result.reason.includes('moments ago') && left() > MIN_INTERVAL_MS + 2000) {
        await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS + 250))
        if (cancelled) return
        result = await fetchBuildings(bounds, Math.max(1000, left()))
      }
      if (cancelled) return
      if (result.status === 'ok') draw(result.buildings, result.cached && result.savedAt !== undefined ? result.savedAt : null)
      else if (saved === null) setBuildings({ problem: result.reason })
      await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS + 250))
      if (cancelled) return
      const trees = await fetchTrees(venue)
      if (cancelled) return
      setTrees(trees)
      if (trees.status === 'drawn') scene.current?.setTrees(trees.trees)
    })()
    return () => {
      cancelled = true
    }
  }, [ready, venue, buildingsTry])

  /* The coastline the elevation is cleaned against (src/lib/seaMask.ts): said while it loads, and if it did not. */
  const [sea, setSea] = useState<SeaStatus>(() => seaStatus())
  useEffect(() => onSeaMask(() => setSea(seaStatus())), [])

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

  const box =
    stand === null || lensFocal === null || width === 0
      ? null
      : frameBox(lensFocal, SENSORS[stand.sensor], viewWidthDegrees(frameBox(stand.focal, SENSORS[stand.sensor], 60, 100).lensHorizontal), width)

  return (
    <div className="clay">
      <div ref={host} className="clay__canvas" />
      {box === null ? null : (
        <div className="clay__frame" style={{ width: `${box.width}px`, height: `${box.height}px` }} aria-hidden="true" />
      )}
      <div className="clay__legend">
        <p className="clay__note">{CLAY_NOTE}</p>
        {failed !== null ? <p className="clay__line">3D could not start: {failed}</p> : null}
        {!ready && failed === null ? <p className="clay__line">Loading the 3D view…</p> : null}
        {buildings === 'loading' ? (
          ready ? <p className="clay__line">Loading buildings…</p> : null
        ) : 'problem' in buildings ? (
          <p className="clay__line clay__line--act">
            Buildings didn't load. {buildings.problem} None are saved on this phone for here.{' '}
            <button type="button" className="btn btn--small" onClick={() => setBuildingsTry((n) => n + 1)}>
              Retry
            </button>
          </p>
        ) : (
          <p className="clay__line num">
            {buildings.total} buildings{buildings.savedAt === null ? '' : `, saved on this phone ${buildings.savedAt.slice(0, 10)}`}
            {buildings.unknown > 0 ? (
              <>
                {' · '}
                <span className="clay__swatch clay__swatch--unknown" aria-hidden="true" />
                {buildings.unknown} height unknown, drawn lighter, no shadow
              </>
            ) : null}
          </p>
        )}
        {trees === null ? null : (
          <p className="clay__line num">
            {trees.status === 'drawn'
              ? `${trees.trees.length} mapped trees drawn`
              : trees.status === 'sparse'
                ? `Trees: none drawn, only ${trees.count} mapped here`
                : 'Trees: map data did not answer'}
          </p>
        )}
        {flat > 0 ? <p className="clay__line">Some ground has no saved elevation and is drawn flat.</p> : null}
        {sea === 'loading' ? <p className="clay__line">Checking the coastline…</p> : null}
        {sea === 'failed' ? (
          <p className="clay__line clay__line--act">
            Coastline didn't load: at the coast the sea may not sit at sea level.{' '}
            <button type="button" className="btn btn--small" onClick={() => void loadSeaMask(venue)}>
              Retry
            </button>
          </p>
        ) : null}
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

