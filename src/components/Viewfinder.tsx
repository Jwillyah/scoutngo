import { useEffect, useMemo, useRef, useState } from 'react'
import { getMoonPosition, getPosition } from 'suncalc'
import {
  alphaFromHeading,
  ASSUMED_PHONE_LONG_SIDE_DEG,
  calibrationFromTap,
  frameBox,
  project,
  visibleFov,
  type Orientation,
} from '../core/arProjection.ts'
import { computeFOV, SENSORS } from '../core/fov.ts'
import { bearingBetween, distanceMeters, type LatLon } from '../core/geo.ts'
import { resolveSensor, type KitProfile } from '../core/kit.ts'
import { normalizeBearing } from '../core/sun.ts'
import { formatHour } from '../core/timezone.ts'
import type { KitSelection } from '../lib/kitSelection.ts'
import { LOCATE_MESSAGE, locateOnce } from '../lib/locateOnce.ts'
import { formatRange, type Units } from '../lib/units.ts'

/*
 * THE VIEWFINDER: THE PHONE'S CAMERA, WITH THE PLAN DRAWN OVER IT.
 *
 * The sun's path today and where it is now, the moon's when asked, the
 * horizon, the venue and the positions as pins, and a frame box for each
 * body in the bag with the lens picked here. Directions are arithmetic
 * (src/core/arProjection.ts); the phone's tilt and compass place them.
 *
 * THE CAMERA PICTURE NEVER LEAVES THE <video>. It is not drawn to a canvas,
 * not recorded, not captured, not stored and not sent: the stream goes into
 * the element and is stopped when the viewfinder closes. A test reads this
 * file and fails if any of that is ever added (tests/viewfinderPrivacy.test.ts).
 *
 * WHAT IS ASSUMED IS SAID: the phone camera's field of view (a web page cannot
 * read it) and the compass, which is often several degrees off. Calibrate by
 * tapping the sun where it really is.
 *
 * Both permissions are asked from the tap that opens it, never on load, and a
 * refusal is one sentence.
 */
interface ViewfinderProps {
  venue: LatLon
  pins: { id: string; label: string; at: LatLon }[]
  profile: KitProfile
  bag: KitSelection
  timeZone: string
  units: Units
  onClose: () => void
}

/*
 * NO PLACE YET: the paths are worked out for a place, so the viewfinder says
 * so and carries the way to set one, rather than the menu item doing nothing.
 */
export function ViewfinderNeedsPlace({ onSetup, onClose }: { onSetup: () => void; onClose: () => void }) {
  return (
    <div className="vf vf--ask" role="dialog" aria-label="Viewfinder">
      <p className="vf__title">Viewfinder</p>
      <p className="vf__say">Set the shoot place first: the sun's path is worked out for it.</p>
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={onSetup}>
          Go to Shoot setup
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

type Phase = { kind: 'ask' } | { kind: 'refused'; why: string } | { kind: 'live' }

interface OrientationEventLike {
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute?: boolean
  webkitCompassHeading?: number
}

const PATH_STEP_MINUTES = 10

export function Viewfinder({ venue, pins, profile, bag, timeZone, units, onClose }: ViewfinderProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' })
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [orientation, setOrientation] = useState<Orientation | null>(null)
  const [offset, setOffset] = useState(0)
  const [calibrating, setCalibrating] = useState(false)
  const [moon, setMoon] = useState(false)
  const [me, setMe] = useState<LatLon | null>(null)
  const [now, setNow] = useState(() => new Date())
  /* The field of the picture as shown, from the overlay's own size. */
  const overlay = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 390, h: 844 })
  useEffect(() => {
    const el = overlay.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(([entry]) => {
      if (entry !== undefined && entry.contentRect.width > 0) setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [phase.kind])
  const fov = visibleFov(size.w, size.h)

  const lenses = profile.lenses.filter((l) => bag.lensIds.includes(l.id))
  const bodies = profile.bodies.filter((b) => bag.bodyIds.includes(b.id))
  const [lensId, setLensId] = useState<string | null>(lenses[0]?.id ?? null)
  const lens = lenses.find((l) => l.id === lensId) ?? null
  const [focal, setFocal] = useState<number>(lens?.minFocalLength ?? 50)

  /* Stop the camera however the viewfinder goes away. */
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    },
    [],
  )

  useEffect(() => {
    if (phase.kind !== 'live') return
    const tick = window.setInterval(() => setNow(new Date()), 30_000)
    const onOrientation = (event: Event) => {
      const e = event as unknown as OrientationEventLike
      if (e.beta === null || e.gamma === null) return
      let alpha: number | null = null
      if (typeof e.webkitCompassHeading === 'number') alpha = alphaFromHeading(e.webkitCompassHeading)
      else if (e.absolute === true && e.alpha !== null) alpha = e.alpha
      if (alpha === null) return
      setOrientation({ alpha, beta: e.beta, gamma: e.gamma })
    }
    const name = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(name, onOrientation)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener(name, onOrientation)
    }
  }, [phase.kind])

  const open = async () => {
    const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission
    if (typeof ask === 'function') {
      try {
        if ((await ask()) !== 'granted') {
          setPhase({ kind: 'refused', why: 'Motion access was not allowed, so the viewfinder cannot tell where the phone is pointing.' })
          return
        }
      } catch {
        setPhase({ kind: 'refused', why: 'Motion access was not allowed, so the viewfinder cannot tell where the phone is pointing.' })
        return
      }
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      stream.current = media
      setPhase({ kind: 'live' })
      requestAnimationFrame(() => {
        if (video.current !== null) {
          video.current.srcObject = media
          void video.current.play().catch(() => undefined)
        }
      })
    } catch {
      setPhase({ kind: 'refused', why: 'Camera access was not allowed, so there is no picture to draw on.' })
    }
  }

  const close = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    onClose()
  }

  /* Where the user stands, for the pins: asked from a tap, used here, never kept or sent. */
  const [locateNote, setLocateNote] = useState<string | null>(null)
  const locate = () => {
    void locateOnce().then((result) => {
      if (result.status === 'ok') {
        setMe(result.at)
        setLocateNote(null)
      } else {
        setMe(null)
        setLocateNote(LOCATE_MESSAGE[result.status])
      }
    })
  }
  const from = me ?? venue

  const sunNow = getPosition(now, from.lat, from.lon)
  const paths = useMemo(() => {
    const day = new Date(now)
    day.setHours(0, 0, 0, 0)
    const sun: { t: Date; az: number; alt: number }[] = []
    const moonPath: { t: Date; az: number; alt: number }[] = []
    for (let m = 0; m <= 24 * 60; m += PATH_STEP_MINUTES) {
      const t = new Date(day.getTime() + m * 60_000)
      const s = getPosition(t, from.lat, from.lon)
      sun.push({ t, az: normalizeBearing(s.azimuth), alt: s.altitude })
      const mo = getMoonPosition(t, from.lat, from.lon)
      moonPath.push({ t, az: normalizeBearing(mo.azimuth), alt: mo.altitude })
    }
    return { sun, moon: moonPath }
  }, [now, from.lat, from.lon])

  const at = (az: number, alt: number) => (orientation === null ? null : project(az, alt, orientation, fov, -offset))
  const polyline = (points: { az: number; alt: number }[]) => {
    const segments: string[] = []
    let current: string[] = []
    for (const p of points) {
      const s = p.alt < -2 ? null : at(p.az, p.alt)
      if (s === null || s.x < -1 || s.x > 2 || s.y < -1 || s.y > 2) {
        if (current.length > 1) segments.push(current.join(' '))
        current = []
        continue
      }
      current.push(`${(s.x * 100).toFixed(2)},${(s.y * 100).toFixed(2)}`)
    }
    if (current.length > 1) segments.push(current.join(' '))
    return segments
  }
  const horizon = polyline(Array.from({ length: 181 }, (_, i) => ({ az: i * 2, alt: 0 })))

  const onTap = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!calibrating || orientation === null) return
    const box = event.currentTarget.getBoundingClientRect()
    const tap = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
    setOffset(calibrationFromTap(tap, { azimuth: normalizeBearing(sunNow.azimuth) }, orientation, fov))
    setCalibrating(false)
  }

  if (phase.kind !== 'live') {
    return (
      <div className="vf vf--ask" role="dialog" aria-label="Viewfinder">
        <p className="vf__title">Viewfinder</p>
        <p className="vf__say">
          The camera, with the sun's path, the horizon, your positions and each body's frame drawn over it. The picture stays in
          this screen: it is not saved, recorded or sent.
        </p>
        {phase.kind === 'refused' ? <p className="vf__refused">{phase.why}</p> : null}
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => void open()}>
            Open the camera
          </button>
          <button type="button" className="btn" onClick={close}>
            Close
          </button>
        </div>
      </div>
    )
  }

  const sunScreen = sunNow.altitude > -1 ? at(normalizeBearing(sunNow.azimuth), sunNow.altitude) : null
  const hourly = paths.sun.filter((p, i) => i % 6 === 0 && p.alt > 0)

  return (
    <div className="vf" role="dialog" aria-label="Viewfinder">
      <video ref={video} className="vf__video" playsInline muted autoPlay aria-hidden="true" />
      <div className="vf__overlay" ref={overlay} onPointerUp={onTap}>
        <svg className="vf__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {horizon.map((d) => (
            <polyline key={`h${d.slice(0, 12)}`} className="vf__horizon" points={d} />
          ))}
          {polyline(paths.sun).map((d) => (
            <polyline key={`s${d.slice(0, 12)}`} className="vf__sunpath" points={d} />
          ))}
          {moon
            ? polyline(paths.moon).map((d) => <polyline key={`m${d.slice(0, 12)}`} className="vf__moonpath" points={d} />)
            : null}
        </svg>
        {hourly.map((p) => {
          const s = at(p.az, p.alt)
          if (s === null || s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1) return null
          return (
            <span key={p.t.getTime()} className="vf__hour num" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}>
              {formatHour(p.t, timeZone)}
            </span>
          )
        })}
        {sunScreen === null ? null : <span className="vf__sun" style={{ left: `${sunScreen.x * 100}%`, top: `${sunScreen.y * 100}%` }} />}
        {pins.map((pin) => {
          const d = distanceMeters(from, pin.at)
          if (d < 3) return null
          const s = at(bearingBetween(from, pin.at), (Math.atan2(-1.6, d) * 180) / Math.PI)
          if (s === null || s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1) return null
          return (
            <span key={pin.id} className="vf__pin num" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}>
              {pin.label} · {formatRange(d, units.distance)}
            </span>
          )
        })}
        {lens === null
          ? null
          : bodies.map((body) => {
              const sensor = SENSORS[resolveSensor(lens, [body])]
              const frame = computeFOV(focal, sensor)
              const box = frameBox({ h: frame.hFOV, v: frame.vFOV }, fov)
              /* Wider than the phone sees: said, not drawn off the edge or silently left out. */
              if (box.w > 1 || box.h > 1) {
                return (
                  <span key={body.id} className="vf__wider">
                    {body.name} at {focal} mm sees wider than this phone's camera
                  </span>
                )
              }
              return (
                <span key={body.id} className="vf__frame" style={{ width: `${box.w * 100}%`, height: `${box.h * 100}%` }}>
                  <span className="vf__framelabel">{body.name}</span>
                </span>
              )
            })}
      </div>

      <div className="vf__bar">
        <p className="vf__note">
          {orientation === null
            ? 'Waiting for the compass. Move the phone in a figure of eight if this stays.'
            : calibrating
              ? 'Tap the sun where you see it.'
              : locateNote !== null
                ? locateNote
              : `Assumes the phone camera sees about ${ASSUMED_PHONE_LONG_SIDE_DEG}° along its long side. Compass offset ${offset >= 0 ? '+' : ''}${offset.toFixed(1)}°.`}
        </p>
        <div className="vf__controls">
          {lenses.length === 0 ? null : (
            <label className="vf__lens">
              <span className="vf__lenslabel">Lens</span>
              <select
                value={lensId ?? ''}
                onChange={(e) => {
                  setLensId(e.target.value)
                  const next = lenses.find((l) => l.id === e.target.value)
                  if (next !== undefined) setFocal(next.minFocalLength)
                }}
              >
                {lenses.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {lens === null || lens.minFocalLength === lens.maxFocalLength ? null : (
            <label className="vf__lens">
              <span className="vf__lenslabel num">{focal} mm</span>
              <input
                type="range"
                min={lens.minFocalLength}
                max={lens.maxFocalLength}
                value={focal}
                onChange={(e) => setFocal(Number(e.target.value))}
                aria-label="Focal length"
              />
            </label>
          )}
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--small" onClick={() => setCalibrating(true)} disabled={sunNow.altitude < 0}>
            {sunNow.altitude < 0 ? 'Sun is down: cannot calibrate' : 'Calibrate on the sun'}
          </button>
          <button type="button" className="btn btn--small" onClick={() => setMoon(!moon)} aria-pressed={moon}>
            Moon path
          </button>
          <button type="button" className="btn btn--small" onClick={locate}>
            {me === null ? 'Pins from where I stand' : 'Pins from here'}
          </button>
          <button type="button" className="btn btn--small" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
