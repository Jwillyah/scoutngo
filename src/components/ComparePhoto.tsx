import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LatLon } from '../core/geo.ts'
import { fitPhotoFrame, horizonDipDeg } from '../core/photoCompare.ts'
import { getSunPosition } from '../core/sun.ts'
import { formatClock, venueTimeZone } from '../core/timezone.ts'
import { isStitched, photoFov, placeable, readPhotoMeta, type PhotoMeta } from '../lib/compare/photoMeta.ts'
import { describeMeta, photoInstant, poseFromMeta, type Pose } from '../lib/compare/pose.ts'
import { scoreCompare, type CompareScore } from '../lib/compare/score.ts'
import { loadPlace } from '../lib/place.ts'
import { formatDistance, type DistanceUnit } from '../lib/units.ts'
import type { ClayScene, GroundStatus } from '../three/clayScene.ts'

declare const __CESIUM_BASE__: string

/*
 * COMPARE A PHOTO: THE 3D VIEW AGAINST THE SHOOTER'S OWN FOOTAGE.
 *
 * Pick a drone photo from the phone. The file is read here, on the phone, and
 * nothing is uploaded: the position, the height above takeoff, the gimbal's
 * heading and tilt, the lens and the minute it was taken
 * (src/lib/compare/photoMeta.ts). The 3D view stands exactly there, at that
 * minute, and the two are laid side by side or under a swipe.
 *
 * What can be scored is scored (src/lib/compare/score.ts, arithmetic in
 * src/core/photoCompare.ts): the sea horizon's row, the sun against the
 * photo's brightest spot, the render's edges against the photo's.
 *
 * WHAT IT DOES NOT PRETEND:
 *
 *   - A panorama is a stitch of several frames. Its lens tags are one frame's,
 *     so its field of view is not the lens's: the screen says so and the view
 *     is set by eye, and nothing is scored against an angle nobody knows.
 *   - The height is above the TAKEOFF point, which the file does not give.
 *     The ground under the drone stands in for it (sea level over water), and
 *     the screen says that too.
 *   - A file with no position (an edited export, a share sheet) says which
 *     parts are missing in one line and offers to place the camera by hand.
 */

interface ComparePhotoProps {
  /** Where to place the camera by hand when the file has no position: the venue pin. */
  fallbackAt: LatLon | null
  distanceUnit: DistanceUnit
  onClose: () => void
}

interface Picked {
  name: string
  url: string
  meta: PhotoMeta
  stitched: boolean
  width: number
  height: number
}

type Phase =
  | { kind: 'pick' }
  | { kind: 'reading' }
  | { kind: 'missing'; missing: string[] }
  | { kind: 'rendering'; note: string }
  | { kind: 'done' }
  | { kind: 'failed'; reason: string }

const WORD: Record<string, string> = { position: 'position', height: 'height', heading: 'heading', tilt: 'tilt', 'focal length': 'lens', time: 'time' }

export function ComparePhoto({ fallbackAt, distanceUnit, onClose }: ComparePhotoProps) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [hand, setHand] = useState<{ heightM: number; yaw: number; pitch: number } | null>(null)
  const [stitchFov, setStitchFov] = useState(90)
  const [render, setRender] = useState<string | null>(null)
  const [score, setScore] = useState<CompareScore | null>(null)
  const [facts, setFacts] = useState<{ groundM: number; sun: { azimuth: number; altitude: number }; pose: Pose } | null>(null)
  const [view, setView] = useState<'swipe' | 'side'>('swipe')
  const [swipe, setSwipe] = useState(50)
  const stage = useRef<HTMLDivElement | null>(null)
  const engine = useRef<HTMLDivElement | null>(null)
  const photoImg = useRef<HTMLImageElement | null>(null)
  const [tick, setTick] = useState(0)

  /* The object URL goes with the photo. */
  useEffect(() => () => {
    if (picked !== null) URL.revokeObjectURL(picked.url)
  }, [picked])

  const pick = async (file: File) => {
    setPhase({ kind: 'reading' })
    setRender(null)
    setScore(null)
    setFacts(null)
    const buf = await file.arrayBuffer()
    const meta = readPhotoMeta(buf)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch {
      URL.revokeObjectURL(url)
      setPhase({ kind: 'failed', reason: 'This file is not a picture the phone can open.' })
      return
    }
    const next = { name: file.name, url, meta, stitched: isStitched(meta, file.name), width: img.naturalWidth, height: img.naturalHeight }
    setPicked(next)
    const ok = placeable(meta)
    setHand(null)
    if (!ok.ok) setPhase({ kind: 'missing', missing: ok.missing })
    else setTick((n) => n + 1)
  }

  /* The pose: the file's, or the hand-placed one at the venue pin with the file's lens and time where it has them. */
  const pose = ((): Pose | null => {
    if (picked === null) return null
    const fromFile = poseFromMeta(picked.meta, picked.width, picked.height, picked.stitched ? stitchFov : null)
    if (hand === null) return fromFile
    const at = picked.meta.lat !== null && picked.meta.lon !== null ? { lat: picked.meta.lat, lon: picked.meta.lon } : fallbackAt
    if (at === null) return null
    const timeZone = venueTimeZone(at.lat, at.lon) ?? 'UTC'
    const focal35 = picked.meta.focal35 ?? 24
    return {
      at,
      aboveTakeoffM: hand.heightM,
      yaw: hand.yaw,
      pitch: hand.pitch,
      roll: 0,
      fov: picked.stitched ? { horizontalDeg: stitchFov, verticalDeg: (2 * Math.atan(Math.tan((stitchFov * Math.PI) / 360) * (picked.height / picked.width)) * 180) / Math.PI } : photoFov(focal35, picked.width, picked.height, picked.meta.crop),
      when: photoInstant(picked.meta, timeZone) ?? new Date(),
      timeZone,
    }
  })()

  /* Render the view once per pose: a scene of its own, the snapshot kept, the scene let go. */
  const poseKey = pose === null ? null : JSON.stringify(pose)
  /* Typed numbers and the stitch slider settle for half a second before the view is rebuilt. */
  const [settledKey, setSettledKey] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setSettledKey(poseKey), 500)
    return () => clearTimeout(timer)
  }, [poseKey])
  useEffect(() => {
    if (pose === null || picked === null || engine.current === null || settledKey !== poseKey) return
    let cancelled = false
    let made: ClayScene | null = null
    setRender(null)
    setScore(null)
    setPhase({ kind: 'rendering', note: 'Building the view at that minute…' })
    ;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = __CESIUM_BASE__
    const status: GroundStatus = { flatTiles: 0 }
    void (async () => {
      try {
        const { createClayScene } = await import('../three/clayScene.ts')
        if (cancelled || engine.current === null) return
        made = createClayScene(engine.current, pose.at, pose.timeZone, status, () => {}, null)
        made.setTime(pose.when)
        const place = await loadPlace(pose.at)
        if (cancelled) return
        if (place.buildings !== null) made.setBuildings(place.buildings.list)
        const ground = (await made.groundAt(pose.at)) ?? 0
        const groundM = Math.max(0, ground)
        const box = engine.current.getBoundingClientRect()
        const fit = fitPhotoFrame(box.width, box.height, pose.fov.horizontalDeg, pose.fov.verticalDeg)
        made.photoView(pose.at, groundM + pose.aboveTakeoffM, pose.yaw, pose.pitch, pose.roll, fit.engineFovDeg)
        setPhase({ kind: 'rendering', note: 'Waiting for the ground and the buildings…' })
        await made.settled(30_000)
        if (cancelled) return
        const shot = await made.snapshot()
        if (cancelled) return
        setRender(shot.toDataURL('image/jpeg', 0.9))
        const sun = getSunPosition(pose.when, pose.at.lat, pose.at.lon)
        setFacts({ groundM, sun, pose })
        const photo = photoImg.current
        /* No score against an angle nobody knows: a stitch is shown, not scored. */
        if (photo !== null && !picked.stitched) {
          setScore(scoreCompare(photo, shot, { heightAboveSeaM: groundM + pose.aboveTakeoffM, yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov }, sun))
        }
        setPhase({ kind: 'done' })
      } catch (error) {
        if (!cancelled) setPhase({ kind: 'failed', reason: `The 3D view could not be built: ${error instanceof Error ? error.message : String(error)}` })
      } finally {
        made?.destroy()
        made = null
      }
    })()
    return () => {
      cancelled = true
      made?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledKey, tick])

  /* For scripts/measure-compare.mjs: what was read and what was scored. Read only. */
  useEffect(() => {
    ;(window as unknown as { __compare?: unknown }).__compare = { name: picked?.name ?? null, meta: picked?.meta ?? null, stitched: picked?.stitched ?? null, size: picked === null ? null : [picked.width, picked.height], phase: phase.kind, score, facts }
  }, [picked, phase, score, facts])

  const dragSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = stage.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0) return
    setSwipe(Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)))
  }

  const aspect = picked === null ? 4 / 5 : picked.width / picked.height
  const metaLines = picked === null ? [] : describeMeta(picked.meta, picked.stitched, distanceUnit)

  return createPortal(
    <div className="cmp" role="dialog" aria-label="Compare a photo" data-phase={phase.kind}>
      <div className="cmp__head">
        <p className="cmp__title">Compare a photo</p>
        <button type="button" className="cmp__close" onClick={onClose}>
          Close
        </button>
      </div>

      {picked === null ? (
        <div className="cmp__empty">
          <p className="cmp__say">Pick a drone photo. It is read on this phone and never uploaded: where the drone was, how high, which way the camera looked, the lens and the minute.</p>
          <label className="btn btn--primary cmp__pick">
            Pick a photo
            <input className="cmp__file" type="file" accept="image/jpeg,.jpg,.jpeg" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <>
          <div
            ref={stage}
            className={`cmp__stage cmp__stage--${view}`}
            style={{ '--cmp-aspect': String(aspect) } as React.CSSProperties}
            onPointerDown={(e) => {
              if (view !== 'swipe') return
              e.currentTarget.setPointerCapture(e.pointerId)
              dragSwipe(e)
            }}
            onPointerMove={(e) => {
              if (view === 'swipe' && e.buttons > 0) dragSwipe(e)
            }}
          >
            <div className="cmp__frame">
              <img ref={photoImg} className="cmp__photo" src={picked.url} alt="Your photo" />
              {/* The engine draws here, under the photo, at the photo's shape; only its snapshot is shown. */}
              <div ref={engine} className="cmp__engine" aria-hidden="true" />
              {render !== null && view === 'swipe' ? (
                <>
                  <img className="cmp__render cmp__render--swipe" src={render} alt="" style={{ clipPath: `inset(0 0 0 ${swipe}%)` }} />
                  <span className="cmp__handle" style={{ left: `${swipe}%` }} aria-hidden="true" />
                </>
              ) : null}
            </div>
            {render !== null && view === 'side' ? (
              <div className="cmp__frame">
                <img className="cmp__render" src={render} alt="The 3D view from the same place and minute" />
              </div>
            ) : null}
          </div>

          {render === null ? null : (
            <div className="seg cmp__seg" role="group" aria-label="How to compare">
              {(['swipe', 'side'] as const).map((v) => (
                <button key={v} type="button" className={`seg__btn${view === v ? ' seg__btn--on' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
                  {v === 'swipe' ? 'Swipe' : 'Side by side'}
                </button>
              ))}
            </div>
          )}

          <div className="cmp__facts">
            {phase.kind === 'missing' && hand === null ? (
              <div className="cmp__missing">
                <p className="cmp__line">
                  This file has no {phase.missing.map((m) => WORD[m] ?? m).join(', ')}: edited exports and phone shares often drop it.
                </p>
                {fallbackAt === null && (picked.meta.lat === null || picked.meta.lon === null) ? (
                  <p className="cmp__line cmp__line--dim">Set a venue first, and the camera can stand on its pin.</p>
                ) : (
                  <button type="button" className="btn btn--small" onClick={() => setHand({ heightM: picked.meta.aboveTakeoffM ?? 60, yaw: picked.meta.gimbalYaw ?? 0, pitch: picked.meta.gimbalPitch ?? -10 })}>
                    Place the camera by hand
                  </button>
                )}
              </div>
            ) : null}
            {hand === null ? null : (
              <div className="cmp__hand">
                <label className="cmp__num">
                  <span>Height, m</span>
                  <input className="num" type="number" inputMode="decimal" value={hand.heightM} onChange={(e) => setHand({ ...hand, heightM: Number(e.target.value) || 0 })} />
                </label>
                <label className="cmp__num">
                  <span>Heading °</span>
                  <input className="num" type="number" inputMode="decimal" value={hand.yaw} onChange={(e) => setHand({ ...hand, yaw: Number(e.target.value) || 0 })} />
                </label>
                <label className="cmp__num">
                  <span>Tilt °</span>
                  <input className="num" type="number" inputMode="decimal" value={hand.pitch} onChange={(e) => setHand({ ...hand, pitch: Number(e.target.value) || 0 })} />
                </label>
              </div>
            )}
            {picked.stitched ? (
              <label className="cmp__stitch">
                <span className="cmp__line">A panorama: its field of view is a stitch, not the lens. Set it by eye.</span>
                <input type="range" min={30} max={160} step={1} value={stitchFov} aria-valuetext={`${stitchFov} degrees across`} onChange={(e) => setStitchFov(Number(e.target.value))} />
              </label>
            ) : null}
            {phase.kind === 'rendering' ? <p className="cmp__line cmp__line--dim">{phase.note}</p> : null}
            {phase.kind === 'failed' ? <p className="cmp__line cmp__line--error">{phase.reason}</p> : null}
            <p className="cmp__meta num">{metaLines.join(' · ')}</p>
            {facts === null ? null : (
              <p className="cmp__line cmp__line--dim">
                {formatClock(facts.pose.when, facts.pose.timeZone)} · the ground under the drone taken as takeoff ({formatDistance(facts.groundM, distanceUnit)}), the sun {facts.sun.altitude.toFixed(1)}° up at {facts.sun.azimuth.toFixed(0)}°
              </p>
            )}
            {score === null ? null : <ScoreLines score={score} heightM={(facts?.groundM ?? 0) + (facts?.pose.aboveTakeoffM ?? 0)} />}
            {phase.kind === 'done' && picked.stitched ? <p className="cmp__line cmp__line--dim">Not scored: a stitch has no single field of view to score against.</p> : null}
            <label className="cmp__again">
              Pick another
              <input className="cmp__file" type="file" accept="image/jpeg,.jpg,.jpeg" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
            </label>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

function ScoreLines({ score, heightM }: { score: CompareScore; heightM: number }) {
  const deg = (px: number) => `${(px * score.degPerPx).toFixed(2)}°`
  const h = score.horizon
  const inFrame = h.predicted >= 0 && h.predicted <= score.height
  return (
    <ul className="cmp__scores">
      <li>
        {inFrame ? (
          <>
            Horizon: should cross at row {h.predicted.toFixed(0)} of {score.height} ({horizonDipDeg(heightM).toFixed(2)}° below level from {heightM.toFixed(0)} m).{' '}
            {h.photo === null ? 'No sea horizon found in the photo.' : `Photo ${h.photo}, ${deg(Math.abs(h.photo - h.predicted))} off.`}{' '}
            {h.render === null ? '' : `3D ${h.render}.`}
          </>
        ) : (
          'Horizon: out of this frame at this tilt, so not scored.'
        )}
      </li>
      <li>{score.sunNote}</li>
      <li>{score.edges === null ? 'No strong edges to compare.' : `Edges: the 3D view's lie a median ${score.edges.medianPx.toFixed(1)} px from the photo's; ${Math.round(score.edges.within * 100)}% within 4 px.`}</li>
    </ul>
  )
}
