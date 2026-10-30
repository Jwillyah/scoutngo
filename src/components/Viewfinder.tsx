import { useEffect, useMemo, useRef, useState } from 'react'
import { getMoonPosition, getPosition } from 'suncalc'
import {
  alphaFromHeading,
  calibrationFromTap,
  calibrationTarget,
  frameBox,
  lensWiderThanPhone,
  PHONE_ULTRA_LONG_SIDE_DEG,
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
import { locateOnce, locateWords } from '../lib/locateOnce.ts'
import { formatRange, type Units } from '../lib/units.ts'
import { readPhoneFov, ultraWideOf, writePhoneFov } from '../lib/phoneCamera.ts'

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
 * WHAT IS ASSUMED IS SAID, in the "i": the phone camera's field of view (a
 * web page cannot read it; 69 degrees along the long side unless set) and the
 * compass offset. Calibrate by tapping the sun, or the moon when the sun is
 * down, where it really is.
 *
 * NEVER A BLACK SCREEN (29 Oct: black on an iPhone with the green camera dot
 * on). The stream was attached in a requestAnimationFrame that could run
 * before React had put the <video> on the page, so srcObject was set on
 * nothing. It is attached in an effect after the element exists, played
 * again when its metadata arrives, and if no picture has come after
 * PICTURE_WAIT_MS the screen says so in one line with Retry.
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

type Phase =
  | { kind: 'ask' }
  | { kind: 'refused'; why: string }
  | { kind: 'live' }

interface OrientationEventLike {
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute?: boolean
  webkitCompassHeading?: number
}

const PATH_STEP_MINUTES = 10
/** How long a live stream may show no picture before the screen says so. */
export const PICTURE_WAIT_MS = 4000

const MOTION_REFUSED = 'Motion access was not allowed, so the viewfinder cannot tell where the phone is pointing.'
const CAMERA_REFUSED = 'Camera access was not allowed, so there is no picture to draw on.'
const NO_PICTURE = 'The camera is on but no picture arrived.'

/* Small line icons for the three controls; white on the bar, no colour role. */
const ICON = {
  moon: <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A7 7 0 0 1 15.5 3.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  pins: (
    <>
      <path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="10.5" r="2.2" fill="currentColor" />
    </>
  ),
  calibrate: (
    <>
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.6" r="1.2" fill="currentColor" />
    </>
  ),
}
const Glyph = ({ d }: { d: keyof typeof ICON }) => (
  <svg className="vf__glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    {ICON[d]}
  </svg>
)

export function Viewfinder({ venue, pins, profile, bag, timeZone, units, onClose }: ViewfinderProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' })
  const video = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [noPicture, setNoPicture] = useState(false)
  const [orientation, setOrientation] = useState<Orientation | null>(null)
  const [offset, setOffset] = useState(0)
  const [calibrating, setCalibrating] = useState(false)
  const [moon, setMoon] = useState(false)
  const [info, setInfo] = useState(false)
  const [me, setMe] = useState<LatLon | null>(null)
  const [now, setNow] = useState(() => new Date())
  /* The phone camera: the main one at the field set in the "i", or the ultra-wide when switched to. */
  const [mainFov, setMainFov] = useState(readPhoneFov)
  const [cameras, setCameras] = useState<{ kind: string; deviceId: string; label: string }[]>([])
  const [ultra, setUltra] = useState(false)
  const ultraId = ultraWideOf(cameras)
  const phoneFov = ultra ? PHONE_ULTRA_LONG_SIDE_DEG : mainFov
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
  const fov = visibleFov(size.w, size.h, phoneFov)

  const lenses = profile.lenses.filter((l) => bag.lensIds.includes(l.id))
  const bodies = profile.bodies.filter((b) => bag.bodyIds.includes(b.id))
  const [lensId, setLensId] = useState<string | null>(lenses[0]?.id ?? null)
  const lens = lenses.find((l) => l.id === lensId) ?? null
  const [bodyId, setBodyId] = useState<string | null>(bodies[0]?.id ?? null)
  const body = bodies.find((b) => b.id === bodyId) ?? bodies[0] ?? null
  const [focal, setFocal] = useState<number>(lens?.minFocalLength ?? 50)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  /* Stop the camera however the viewfinder goes away. */
  useEffect(() => () => stopCamera(), [])

  /*
   * THE STREAM GOES INTO THE <video> ONCE THE <video> EXISTS. Muted and
   * inline set on the element itself (React writes `muted` as a property
   * only, and iOS reads the attribute), play() with its promise handled, and
   * again when the metadata arrives. No picture after PICTURE_WAIT_MS is said.
   */
  useEffect(() => {
    const el = video.current
    if (phase.kind !== 'live' || stream === null || el === null) return
    el.muted = true
    el.setAttribute('muted', '')
    el.setAttribute('playsinline', '')
    el.srcObject = stream
    setNoPicture(false)
    const start = () => {
      void el.play().catch(() => undefined)
    }
    el.addEventListener('loadedmetadata', start)
    start()
    const wait = window.setTimeout(() => {
      if (el.videoWidth === 0 || el.readyState < 2) setNoPicture(true)
    }, PICTURE_WAIT_MS)
    const arrived = () => setNoPicture(false)
    el.addEventListener('playing', arrived)
    return () => {
      window.clearTimeout(wait)
      el.removeEventListener('loadedmetadata', start)
      el.removeEventListener('playing', arrived)
    }
  }, [phase.kind, stream])

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

  const startCamera = async (deviceId: string | null) => {
    stopCamera()
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: deviceId === null ? { facingMode: 'environment' } : { deviceId: { exact: deviceId } },
        audio: false,
      })
      streamRef.current = media
      setStream(media)
      setPhase({ kind: 'live' })
      /* Labels are only given once the camera is allowed, so the cameras are listed now. */
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) => setCameras(list.map((d) => ({ kind: d.kind, deviceId: d.deviceId, label: d.label }))))
        .catch(() => undefined)
      return true
    } catch {
      setPhase({ kind: 'refused', why: CAMERA_REFUSED })
      return false
    }
  }

  const open = async () => {
    const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission
    if (typeof ask === 'function') {
      try {
        if ((await ask()) !== 'granted') {
          setPhase({ kind: 'refused', why: MOTION_REFUSED })
          return
        }
      } catch {
        setPhase({ kind: 'refused', why: MOTION_REFUSED })
        return
      }
    }
    await startCamera(ultra ? ultraId : null)
  }

  const switchCamera = (toUltra: boolean) => {
    setUltra(toUltra)
    void startCamera(toUltra ? ultraId : null)
  }

  const close = () => {
    stopCamera()
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
        setLocateNote(locateWords(result))
      }
    })
  }
  const from = me ?? venue

  const sunNow = getPosition(now, from.lat, from.lon)
  const moonNow = getMoonPosition(now, from.lat, from.lon)
  const target = calibrationTarget(sunNow.altitude, moonNow.altitude)
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
    if (!calibrating || orientation === null || target === null) return
    const box = event.currentTarget.getBoundingClientRect()
    const tap = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
    const truth = target === 'sun' ? sunNow : moonNow
    setOffset(calibrationFromTap(tap, { azimuth: normalizeBearing(truth.azimuth) }, orientation, fov))
    setCalibrating(false)
  }

  if (phase.kind !== 'live') {
    return (
      <div className="vf vf--ask" role="dialog" aria-label="Viewfinder">
        <p className="vf__title">Viewfinder</p>
        <p className="vf__say">
          The camera, with the sun's path, the horizon, your positions and your camera's frame drawn over it. The picture stays in
          this screen: it is not saved, recorded or sent.
        </p>
        {phase.kind === 'refused' ? <p className="vf__refused">{phase.why}</p> : null}
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => void open()}>
            {phase.kind === 'refused' ? 'Retry' : 'Open the camera'}
          </button>
          <button type="button" className="btn" onClick={close}>
            Close
          </button>
        </div>
      </div>
    )
  }

  const sunScreen = sunNow.altitude > -1 ? at(normalizeBearing(sunNow.azimuth), sunNow.altitude) : null
  const moonScreen = (moon || (calibrating && target === 'moon')) && moonNow.altitude > -1 ? at(normalizeBearing(moonNow.azimuth), moonNow.altitude) : null
  const hourly = paths.sun.filter((p, i) => i % 6 === 0 && p.alt > 0)

  /* The one frame: the picked body with the picked lens at the picked focal length. */
  const frame = lens === null || body === null ? null : computeFOV(focal, SENSORS[resolveSensor(lens, [body])])
  const box = frame === null ? null : frameBox({ h: frame.hFOV, v: frame.vFOV }, fov)
  const wider = frame !== null && lensWiderThanPhone(frame.hFOV, phoneFov)

  const note =
    noPicture ? null
    : orientation === null ? 'Waiting for the compass. Move the phone in a figure of eight if this stays.'
    : calibrating ? `Tap the ${target ?? 'sun'} where you see it.`
    : locateNote !== null ? locateNote
    : null

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
        {moonScreen === null ? null : <span className="vf__moon" style={{ left: `${moonScreen.x * 100}%`, top: `${moonScreen.y * 100}%` }} />}
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
        {box === null || body === null ? null : (
          /* Drawn at its true size even past the edge of the picture: the edges that are on screen still say where the frame runs. */
          <span className="vf__frame" style={{ width: `${box.w * 100}%`, height: `${box.h * 100}%` }}>
            <span className="vf__framelabel">
              {body.name} · <span className="num">{focal} mm</span>
            </span>
          </span>
        )}
      </div>

      <div className="vf__top">
        <button type="button" className="vf__icon" onClick={() => setInfo(!info)} aria-pressed={info} aria-label="What the viewfinder assumes">
          <Glyph d="info" />
        </button>
        <button type="button" className="vf__icon" onClick={close} aria-label="Close the viewfinder">
          <Glyph d="close" />
        </button>
      </div>
      {info ? (
        <div className="vf__info">
          <p className="vf__infoline">
            {ultra
              ? `On the ultra-wide camera, assumed about ${PHONE_ULTRA_LONG_SIDE_DEG}° along its long side.`
              : `Assumes the phone camera sees about ${phoneFov}° along its long side. A web page cannot read it.`}
          </p>
          {ultra ? null : (
            <label className="vf__infoline vf__fovset">
              <span>Phone camera</span>
              <input
                type="number"
                inputMode="numeric"
                min={40}
                max={130}
                value={mainFov}
                onChange={(e) => setMainFov(writePhoneFov(Number(e.target.value)))}
                aria-label="Phone camera field of view, degrees along the long side"
              />
              <span>°</span>
            </label>
          )}
          <p className="vf__infoline num">
            Compass offset {offset >= 0 ? '+' : ''}
            {offset.toFixed(1)}°
          </p>
          <p className="vf__infoline">
            {cameras.filter((c) => c.kind === 'videoinput').length === 0
              ? 'This phone listed no cameras by name.'
              : `Cameras this phone lists: ${cameras.filter((c) => c.kind === 'videoinput').map((c) => c.label || 'unnamed').join(', ')}.`}
          </p>
        </div>
      ) : null}

      <div className="vf__bar">
        {noPicture ? (
          <p className="vf__note vf__note--act">
            <span>{NO_PICTURE}</span>
            <button type="button" className="vf__chip" onClick={() => void startCamera(ultra ? ultraId : null)}>
              Retry
            </button>
          </p>
        ) : null}
        {wider ? (
          <p className="vf__note vf__note--act">
            <span>Wider than your phone's camera.</span>
            {ultraId !== null && !ultra ? (
              <button type="button" className="vf__chip" onClick={() => switchCamera(true)}>
                Switch to 0.5×
              </button>
            ) : null}
          </p>
        ) : null}
        {ultra && !wider ? (
          <p className="vf__note vf__note--act">
            <span>On the 0.5× camera.</span>
            <button type="button" className="vf__chip" onClick={() => switchCamera(false)}>
              Back to 1×
            </button>
          </p>
        ) : null}
        {note === null ? null : <p className="vf__note">{note}</p>}
        {lenses.length === 0 ? null : (
          <div className="vf__lensrow">
            <select
              className="vf__select"
              value={lensId ?? ''}
              aria-label="Lens"
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
            {bodies.length > 1 ? (
              <select className="vf__select" value={body?.id ?? ''} aria-label="Body" onChange={(e) => setBodyId(e.target.value)}>
                {bodies.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : null}
            {lens === null || lens.minFocalLength === lens.maxFocalLength ? (
              <span className="vf__mm num">{focal} mm</span>
            ) : (
              <label className="vf__zoom">
                <input
                  type="range"
                  min={lens.minFocalLength}
                  max={lens.maxFocalLength}
                  value={focal}
                  onChange={(e) => setFocal(Number(e.target.value))}
                  aria-label="Focal length"
                />
                <span className="vf__mm num">{focal} mm</span>
              </label>
            )}
          </div>
        )}
        <div className="vf__actions">
          <button type="button" className="vf__act" onClick={() => setMoon(!moon)} aria-pressed={moon}>
            <Glyph d="moon" />
            <span>Moon path</span>
          </button>
          <button type="button" className="vf__act" onClick={locate}>
            <Glyph d="pins" />
            <span>{me === null ? 'Pins from me' : 'Pins from here'}</span>
          </button>
          {target === null ? (
            <span className="vf__act vf__act--off">
              <Glyph d="calibrate" />
              <span>Sun and moon down</span>
            </span>
          ) : (
            <button type="button" className="vf__act" onClick={() => setCalibrating(true)} aria-pressed={calibrating}>
              <Glyph d="calibrate" />
              <span>{target === 'sun' ? 'Calibrate on sun' : 'Calibrate on moon'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
