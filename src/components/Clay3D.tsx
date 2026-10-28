import { clayStatus, type ClayStatus } from '../lib/clayStatus.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SENSORS } from '../core/fov.ts'
import type { LatLon } from '../core/geo.ts'
import { frameBox, observerPose, viewWidthDegrees, zoomWithin } from '../core/observer.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'
import { localDate } from '../core/moonTimes.ts'
import { ensure3dOverview } from '../lib/offline3d.ts'
import { loadPlace, onPlace, placeState, type PlaceState } from '../lib/place.ts'
import type { StandRequest } from '../lib/standRequest.ts'
import type { ClayScene, GroundStatus, Pin } from '../three/clayScene.ts'
import { SCAN_EVENT, scanContextAt, useScan } from '../lib/lidar/useScan.ts'
import type { ScanContext } from '../lib/lidar/applyScan.ts'
import { scanLabel } from '../lib/lidar/applyScan.ts'
import { canopyPeaks, footprintMask } from '../lib/lidar/canopy.ts'
import type { Building } from '../lib/buildings.ts'
import { WATERMARK, type FlightPlay } from '../lib/preflight/play.ts'
import type { FlySession } from '../lib/fly/session.ts'
import { NO_STICKS, useFly } from '../lib/fly/useFly.ts'
import { obstacleBars, type FlyMode, type Sticks } from '../core/flyModel.ts'
import { destinationPoint } from '../core/geo.ts'
import type { PathPoint } from '../core/flight.ts'
import { FlyControls } from './FlyControls.tsx'
import { ANIMATED_BELOW_FT, flyUnits } from '../lib/fly/hudUnits.ts'
import { imageryLine } from '../data/imagerySources.ts'
import type { CinemaInputs, Look } from '../three/cinema.ts'

const EMPTY: readonly Building[] = []

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
  /** A Preflight move to fly (src/lib/preflight/play.ts), or null. */
  flight?: FlightPlay | null
  /** The time bar follows the move. */
  onFlightTime?: (at: Date) => void
  /** A recorded preview, or null with why. */
  onRecorded?: (clip: Blob | null, note: string) => void
  /** How far a recording's render has got, 0 to 1. */
  onRenderProgress?: (share: number) => void
  /** Fly it yourself (Phase 3a), or null. */
  fly?: FlySession | null
  /** Landed: the track flown, and the recording if one was asked for. */
  onLanded?: (track: PathPoint[], clip: Blob | null) => void
  /** The sea offshore, from the same inputs as the preview's (src/lib/cinema/useCinemaData.ts). */
  sea?: CinemaInputs | null
}

export const CLAY_NOTE = 'Clay model from map data; real buildings may differ'

export function Clay3D({ venue, venueLabel, at, timeZone, pins, stand, onLeaveStand, flight = null, onFlightTime, onRecorded, onRenderProgress, fly = null, onLanded, sea = null }: Clay3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ClayScene | null>(null)
  /* How many times the scene has been built: every build (a scan arriving rebuilds it) re-runs the effects that feed it. 0 is not built yet. */
  const [ready, setReady] = useState(0)
  /* The first view's tiles have arrived: until then the canvas is hidden and the 2D map shows through. */
  const [shown, setShown] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [place, setPlace] = useState<PlaceState>(() => placeState())
  const [flat, setFlat] = useState(0)
  /* The zoom belongs to one Stand here: a new one starts at its own focal length. */
  const [zoom, setZoom] = useState<{ tick: number; focal: number } | null>(null)
  const [width, setWidth] = useState(0)
  const status = useRef<GroundStatus>({ flatTiles: 0 })
  /* The 3D scan kept for this place, if any (src/lib/lidar/), read before the scene is built; a new one rebuilds it. */
  const [scanVersion, setScanVersion] = useState(0)
  /* Keyed by the place and the scan's version: anything else reads as still loading. */
  const scanKey = `${venue.lat},${venue.lon},${scanVersion}`
  const [scanLoaded, setScanLoaded] = useState<{ key: string; ctx: ScanContext | null } | null>(null)
  const scanCtx: ScanContext | null | 'loading' = scanLoaded !== null && scanLoaded.key === scanKey ? scanLoaded.ctx : 'loading'
  const [infoOpen, setInfoOpen] = useState(false)
  useEffect(() => {
    const on = () => setScanVersion((n) => n + 1)
    window.addEventListener(SCAN_EVENT, on)
    return () => window.removeEventListener(SCAN_EVENT, on)
  }, [])
  useEffect(() => {
    let live = true
    void scanContextAt(venue.lat, venue.lon).then((c) => {
      if (live) setScanLoaded({ key: scanKey, ctx: c })
    })
    /* The place's buildings are fetched again so they carry the new heights (fetchBuildings applies the scan). */
    if (scanVersion > 0) void loadPlace(venue, { refresh: true })
    return () => {
      live = false
    }
  }, [scanKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const scanRasters = scanCtx === 'loading' || scanCtx === null ? null : scanCtx.rasters
  const scanYear = scanCtx === 'loading' || scanCtx === null ? null : scanCtx.scan.year
  const scanFlow = useScan(venue, place.buildings?.list ?? EMPTY)

  /* Build the scene once, for this venue (and again when a scan arrives). */
  useEffect(() => {
    if (scanCtx === 'loading') return
    let cancelled = false
    let made: ClayScene | null = null
    ;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = __CESIUM_BASE__
    import('../three/clayScene.ts')
      .then(({ createClayScene }) => {
        if (cancelled || host.current === null) return
        made = createClayScene(host.current, venue, timeZone, status.current, () => setFlat(status.current.flatTiles), scanRasters)
        scene.current = made
        ;(window as unknown as { __clay?: ClayScene }).__clay = made
        setReady((n) => n + 1)
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
  }, [venue.lat, venue.lon, timeZone, scanCtx === 'loading' ? 'loading' : (scanCtx?.scan.savedAt ?? 'none')]) // eslint-disable-line react-hooks/exhaustive-deps

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
  /* With a scan, the trees are its tall things outside the footprints (src/lib/lidar/canopy.ts); without, Overpass's mapped trees. */
  const scanTrees = useMemo(() => {
    if (scanRasters === null || place.buildings === null) return null
    return canopyPeaks(scanRasters, footprintMask(scanRasters, place.buildings.list.map((b) => b.ring)))
  }, [scanRasters, place.buildings])
  useEffect(() => {
    if (!ready) return
    if (scanTrees !== null) scene.current?.setTrees(scanTrees.map((t) => ({ at: { lat: t.lat, lon: t.lon }, height: t.height })))
    else if (place.trees?.status === 'drawn') scene.current?.setTrees(place.trees.trees)
  }, [ready, place.trees, scanTrees])

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

  /* The water offshore, at the tide's height for the bar's moment. */
  useEffect(() => {
    if (ready) scene.current?.setSea(sea)
  }, [ready, sea])

  /* Preflight: fly the move once the scene is up; a recorded clip goes back to the card. The preview says over itself what is illustrative in it. */
  const [previewing, setPreviewing] = useState<string | null>(null)
  useEffect(() => {
    if (!ready || !shown || flight === null) return
    const s = scene.current
    if (s === null) return
    void s.playPath(flight, (t) => onFlightTime?.(t), (share) => onRenderProgress?.(share), setPreviewing).then((clip) => {
      setPreviewing(null)
      if (!flight.record) return
      /* For the checks (scripts/measure-cinema.mjs): the clip as made. */
      ;(window as unknown as { __clip?: Blob | null }).__clip = clip
      onRecorded?.(clip, clip === null ? 'This browser cannot record the 3D view.' : `Recorded ${Math.round(clip.size / 1e5) / 10} MB at a steady 30 fps, watermarked "${WATERMARK}".`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shown, flight?.tick])

  /* FLY IT YOURSELF: the ground at takeoff, the sticks, the loop, the ceiling glass, the recording. */
  const [flyGround, setFlyGround] = useState<{ tick: number; m: number } | null>(null)
  const [flyMode, setFlyMode] = useState<FlyMode>('normal')
  const sticks = useRef<Sticks>(NO_STICKS)
  const recording = useRef<{ stop: () => Promise<Blob | null> } | null>(null)
  useEffect(() => {
    if (!ready || fly === null) return
    let live = true
    void scene.current?.groundAt(fly.takeoff).then((m) => {
      if (live) setFlyGround({ tick: fly.tick, m: m ?? 0 })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fly?.tick])
  const flying = fly !== null && shown && flyGround !== null && flyGround.tick === fly.tick
  const groundM = flyGround?.m ?? 0
  const surfaceAbsAt = (p: LatLon) => {
    if (fly === null) return null
    const v = fly.surfaceAt(p)
    return v === null ? null : fly.surfaceRelative ? groundM + v : v
  }
  const { hud, track } = useFly(flying, {
    takeoff: fly?.takeoff ?? venue,
    groundM,
    env: { mode: flyMode, ceilingM: (fly?.ceilingFt ?? 400) * 0.3048, wind: fly?.wind ?? null, surfaceAbsAt },
    view: (p, alt, yaw, gimbal) => scene.current?.droneView(p, alt, yaw, gimbal, fly?.focal ?? 24),
    hiddenAt: (p, ft) => fly?.hiddenAt(p, ft) ?? false,
    sticks,
    mode: flyMode,
  })
  const nearCeiling = hud?.nearCeiling === true
  /* While flying the app's chrome steps aside: the dock, the sheet, the time bar (app.css :root.is-flying). */
  useEffect(() => {
    if (!flying) return
    document.documentElement.classList.add('is-flying')
    return () => document.documentElement.classList.remove('is-flying')
  }, [flying])
  /* The look: Animated below ANIMATED_BELOW_FT unless the pilot chose one (src/lib/fly/hudUnits.ts). */
  const [chosenLook, setChosenLook] = useState<Look | null>(null)
  useEffect(() => {
    if (!flying) setChosenLook(null)
  }, [flying])
  const low = hud !== null && hud.state.alt / 0.3048 < ANIMATED_BELOW_FT
  const flyLook: Look = chosenLook ?? (low ? 'animated' : 'real')
  useEffect(() => {
    if (!ready) return
    scene.current?.setFlyLook(flying ? flyLook : null, flying ? sea : null)
  }, [ready, flying, flyLook, sea])
  useEffect(() => {
    if (!ready) return
    scene.current?.setCeiling(flying && fly !== null ? fly.takeoff : null, groundM + (fly?.ceilingFt ?? 400) * 0.3048, nearCeiling ? 0.18 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, flying, nearCeiling])
  useEffect(() => {
    if (!flying || fly === null || !fly.record) return
    recording.current = scene.current?.startRecording() ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying])
  const bars =
    hud === null || fly === null
      ? null
      : obstacleBars(hud.state, {
          mode: flyMode,
          ceilingM: fly.ceilingFt * 0.3048,
          wind: fly.wind,
          surfaceAt: (x, y) => {
            const abs = surfaceAbsAt(destinationPoint(destinationPoint(fly.takeoff, 90, x), 0, y))
            return abs === null ? null : abs - groundM
          },
        })

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
    <div className={`${shown ? 'clay clay--shown' : 'clay clay--waiting'}${flying ? ' clay--flying' : ''}`}>
      <div ref={host} className="clay__canvas" />
      {box === null ? null : (
        <div className="clay__frame" style={{ width: `${box.width}px`, height: `${box.height}px` }} aria-hidden="true" />
      )}
      {/*
        * ONE THING AT THE FOOT, NEVER A STACK. On 27 Oct three messages stood
        * one over another here. Now the most important status is the one
        * pill (claySatus below); with nothing to report, the one legend line.
        */}
      {!infoOpen ? null : (
        <div className="clay__info" role="dialog" aria-label="About this 3D model">
          <p className="clay__infoline">{CLAY_NOTE}. Lighter blocks have no known height and cast no shadow.</p>
          {place.buildings?.savedAt == null ? null : <p className="clay__infoline">Buildings saved on this phone {place.buildings.savedAt.slice(0, 10)}.</p>}
          {/* Which pictures the ground wears, and when they were flown (src/data/imagerySources.ts). */}
          <p className="clay__infoline">{imageryLine(venue)}</p>
          <ScanPanel flow={scanFlow} keptYear={scanYear} />
        </div>
      )}
      <div className="clay__legend">
        {pill !== null ? (
          <ClayPill status={pill} reason={place.reason} onRetry={() => void loadPlace(venue, { retry: true })} />
        ) : previewing !== null ? (
          /* While a move plays: what the preview is, and what in it is illustrative. */
          <p className="clay__line clay__line--one" role="status">
            {previewing}
          </p>
        ) : (
          /*
            * ONE LINE (1st St jetty, 27 Oct: two boxes stacked again):
            * "127 buildings · 21 height unknown · trees didn't load". The
            * clay disclaimer, the scan and its download are behind the i.
            */
          <div className="clay__row">
            <p className="clay__line clay__line--one num">
              {place.buildings === null ? '' : `${place.buildings.list.length} buildings`}
              {unknown > 0 ? ` · ${unknown} height unknown` : ''}
              {scanTrees !== null
                ? ` · ${scanTrees.length} trees from the scan`
                : place.trees?.status === 'drawn'
                  ? ` · ${place.trees.trees.length} mapped trees`
                  : place.trees?.status === 'sparse'
                    ? ` · ${place.trees.count} trees mapped`
                    : place.trees?.status === 'unavailable'
                      ? " · trees didn't load"
                      : ''}
              {flat > 0 ? ' · some ground flat' : ''}
            </p>
            <button type="button" className="clay__i" aria-expanded={infoOpen} aria-label="About this 3D model and its scan" onClick={() => setInfoOpen(!infoOpen)}>
              i
            </button>
          </div>
        )}
      </div>
      {!flying || fly === null ? null : createPortal(
        <FlyControls
          onSticks={(part) => {
            sticks.current = { ...sticks.current, ...part }
          }}
          mode={flyMode}
          onMode={setFlyMode}
          hud={hud}
          ceilingFt={fly.ceilingFt}
          flightMinutes={fly.flightMinutes}
          wind={fly.wind}
          exposure={fly.exposure}
          bars={bars}
          units={flyUnits(fly.units)}
          look={flyLook}
          lookAuto={chosenLook === null}
          onLook={setChosenLook}
          onExit={() => {
            const rec = recording.current
            recording.current = null
            void (rec === null ? Promise.resolve(null) : rec.stop()).then((clip) => onLanded?.([...track.current], clip))
          }}
        />,
        /* On the page itself, over every bit of the app's chrome: the sticks are what a thumb must land on. */
        document.body,
      )}
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

/*
 * THE 3D SCAN, OPT-IN, PER PLACE: what it would cost and how old it is, said
 * before anything is asked of anyone; the download as it goes; and once kept,
 * the label every use carries. High detail is four times the size and best
 * on Wi-Fi; Safari does not say whether the phone is on Wi-Fi, so the button
 * says it rather than checking.
 */
function ScanPanel({ flow, keptYear }: { flow: ReturnType<typeof useScan>; keptYear: number | null }) {
  const { state } = flow
  const mb = (bytes: number) => Math.max(1, Math.round(bytes / 1e6))
  const year = (y: number | null) => (y === null ? 'year not named' : `scanned ${y}`)
  if (state.status === 'kept') {
    return (
      <>
        <p className="clay__infoline">{scanLabel(state.scan.year ?? keptYear)}</p>
        <p className="clay__infoline num">
          {mb(state.scan.bytes)} MB on this phone, {state.scan.density.toFixed(1)} points per m².{' '}
          <button type="button" className="clay__link" onClick={() => void flow.forget(state.scan.id)}>
            Remove the scan
          </button>
        </p>
      </>
    )
  }
  if (state.status === 'fetching-overture') return <p className="clay__infoline">Asking Overture Maps for heights…</p>
  if (state.status === 'none') {
    return (
      <>
        <p className="clay__infoline">No public lidar scan covers this place. Heights are from the map.</p>
        {state.overture === null ? (
          <button type="button" className="clay__link" onClick={() => void flow.fillFromOverture()}>
            Fill in missing heights from Overture Maps (Esri Community Maps heights; a few hundred KB)
          </button>
        ) : (
          <p className="clay__infoline num">{state.overture} heights filled in from Overture Maps (Esri Community Maps).</p>
        )}
      </>
    )
  }
  if (state.status === 'downloading') {
    const p = state.progress
    return <p className="clay__infoline num">Downloading the scan{p === null ? '…' : `: ${p.done} of ${p.total} parts, ${mb(p.bytes)} MB`}</p>
  }
  const offer = state.offer
  return (
    <>
      {state.status === 'failed' ? <p className="clay__infoline">The scan didn't download: {state.reason}</p> : null}
      <button type="button" className="btn btn--small" onClick={() => void flow.download(offer)}>
        Download 3D scan for this place (≈ {mb(offer.bytes)} MB, {year(offer.year)})
      </button>
      {state.status === 'offered' && state.high !== null ? (
        <button type="button" className="clay__link" onClick={() => void flow.download(state.high as NonNullable<typeof state.high>)}>
          High detail, ≈ {mb(state.high.bytes)} MB, best on Wi-Fi
        </button>
      ) : null}
      <p className="clay__infoline">From USGS 3DEP public lidar, straight to this phone. Nothing is downloaded until you tap.</p>
    </>
  )
}
