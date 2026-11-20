import '../styles/vf-sky.css'
import { readBand } from '../lib/skyCheckRead.ts'
import { skyCheckWords } from '../core/skyCheck.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PresetEvent, ViewfinderPreset } from '../core/viewfinderPreset.ts'
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
import { bagFirst, resolveSensor, type KitProfile } from '../core/kit.ts'
import { normalizeBearing } from '../core/sun.ts'
import { formatClock, formatHour } from '../core/timezone.ts'
import type { KitSelection } from '../lib/kitSelection.ts'
import { locateOnce, locateWords } from '../lib/locateOnce.ts'
import { formatRange, type Units } from '../lib/units.ts'
import { corePosition } from '../core/milkyWay.ts'
import { facingView, headingOf, headingWords, stripTicks, sunDotTimes } from '../core/viewfinderGuide.ts'
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
 *
 * BATCH SIMPLE-2, SECTION 4 (mockup Sky_Viewfinder): a compass strip at the
 * top, the sun's dots with their times up to the event, the chips Sun · Moon ·
 * Milky Way, and one line saying where the event happens. A refused camera or
 * motion is the compass-only view: no picture, the same drawing, facing the
 * event's bearing when the phone cannot say where it points
 * (src/core/viewfinderGuide.ts).
 */
interface ViewfinderProps {
  venue: LatLon
  pins: { id: string; label: string; at: LatLon }[]
  profile: KitProfile
  bag: KitSelection
  timeZone: string
  units: Units
  /** Batch I: opens with the next event marked and its lens on (src/core/viewfinderPreset.ts). */
  preset?: ViewfinderPreset | null
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
  /* The camera or the motion was not allowed: the drawing with no picture. */
  | { kind: 'compass'; why: string }
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

const PRESET_WORD: Record<PresetEvent, string> = { sunrise: 'Sunrise', sunset: 'Sunset', moonrise: 'Moonrise' }

/*
 * OVER EVERY PAGE (Batch SIMPLE-2, Section 4): opened from Sky › Tonight's "Viewfinder ›", it must sit over the
 * tap-in page, which is itself a portal on <body>; so the viewfinder is one too, after it.
 */
export function Viewfinder(props: ViewfinderProps) {
  return createPortal(<ViewfinderScreen {...props} />, document.body)
}

function ViewfinderScreen({ venue, pins, profile, bag, timeZone, units, preset = null, onClose }: ViewfinderProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' })
  const video = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [noPicture, setNoPicture] = useState(false)
  const [orientation, setOrientation] = useState<Orientation | null>(null)
  const [offset, setOffset] = useState(0)
  const [calibrating, setCalibrating] = useState(false)
  const [moon, setMoon] = useState(preset?.event === 'moonrise')
  const [sunOn, setSunOn] = useState(true)
  const [milky, setMilky] = useState(false)
  const [info, setInfo] = useState(false)
  /* Batch J, Section 7: the sky check's words, after a tap; the picture itself is never kept (src/lib/skyCheckRead.ts). */
  const [checked, setChecked] = useState<string | null>(null)
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

  const lenses = bagFirst(profile.lenses, bag.lensIds)
  const bodies = profile.bodies.filter((b) => bag.bodyIds.includes(b.id))
  const [lensId, setLensId] = useState<string | null>(preset?.lensId ?? lenses[0]?.id ?? null)
  const lens = lenses.find((l) => l.id === lensId) ?? null
  const [bodyId, setBodyId] = useState<string | null>(bodies[0]?.id ?? null)
  const body = bodies.find((b) => b.id === bodyId) ?? bodies[0] ?? null
  const [focal, setFocal] = useState<number>(preset?.focal ?? lens?.minFocalLength ?? 50)

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
    if (phase.kind === 'ask') return
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
      setPhase({ kind: 'compass', why: CAMERA_REFUSED })
      return false
    }
  }

  const open = async () => {
    const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission
    if (typeof ask === 'function') {
      try {
        if ((await ask()) !== 'granted') {
          setPhase({ kind: 'compass', why: MOTION_REFUSED })
          return
        }
      } catch {
        setPhase({ kind: 'compass', why: MOTION_REFUSED })
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
    /* The Milky Way's core while the sun is 12° or more down: the part of its path worth looking for. */
    const core: { t: Date; az: number; alt: number }[] = []
    for (let m = 0; m <= 24 * 60; m += PATH_STEP_MINUTES) {
      const t = new Date(day.getTime() + m * 60_000)
      const s = getPosition(t, from.lat, from.lon)
      sun.push({ t, az: normalizeBearing(s.azimuth), alt: s.altitude })
      const mo = getMoonPosition(t, from.lat, from.lon)
      moonPath.push({ t, az: normalizeBearing(mo.azimuth), alt: mo.altitude })
      const c = corePosition(t, from.lat, from.lon)
      core.push({ t, az: normalizeBearing(c.azimuth), alt: s.altitude <= -12 ? c.altitude : -90 })
    }
    return { sun, moon: moonPath, core }
  }, [now, from.lat, from.lon])

  /* The compass-only view, with no motion to read: upright, facing the event (or the sun now). */
  const facing = preset === null ? null : preset.event === 'moonrise' ? getMoonPosition(preset.at, from.lat, from.lon).azimuth : getPosition(preset.at, from.lat, from.lon).azimuth
  const view = orientation ?? (phase.kind === 'compass' ? facingView(facing ?? getPosition(now, from.lat, from.lon).azimuth) : null)
  const at = (az: number, alt: number) => (view === null ? null : project(az, alt, view, fov, -offset))
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

  if (phase.kind === 'ask') {
    return (
      <div className="vf vf--ask" role="dialog" aria-label="Viewfinder">
        <p className="vf__title">Viewfinder</p>
        <p className="vf__say">
          The camera, with the sun's path, the horizon, your positions and your camera's frame drawn over it. The picture stays in
          this screen: it is not saved, recorded or sent.
        </p>
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
  const moonScreen = (moon || (calibrating && target === 'moon')) && moonNow.altitude > -1 ? at(normalizeBearing(moonNow.azimuth), moonNow.altitude) : null
  const sunEvent = preset !== null && preset.event !== 'moonrise' ? preset : null
  /* The sun's dots: up to the sunset (from the sunrise) every 20 minutes, with their times; else on the hour. */
  const dots = sunEvent !== null
    ? sunDotTimes(sunEvent.event as 'sunrise' | 'sunset', sunEvent.at).map((t) => {
        const p = getPosition(t, from.lat, from.lon)
        return { t, az: normalizeBearing(p.azimuth), alt: Math.max(p.altitude, -0.8), label: t.getTime() === sunEvent.at.getTime() ? null : formatClock(t, timeZone) }
      })
    : paths.sun.filter((p, i) => i % 6 === 0 && p.alt > 0).map((p) => ({ ...p, label: formatHour(p.t, timeZone) }))
  const heading = headingOf(view, fov, offset)
  /* The next event, marked where it happens: the sun or the moon at its time, on the horizon. */
  const eventPos = preset === null ? null : preset.event === 'moonrise' ? getMoonPosition(preset.at, from.lat, from.lon) : getPosition(preset.at, from.lat, from.lon)
  const eventScreen = eventPos === null ? null : at(normalizeBearing(eventPos.azimuth), Math.max(0, eventPos.altitude))

  /* The one frame: the picked body with the picked lens at the picked focal length. */
  const frame = lens === null || body === null ? null : computeFOV(focal, SENSORS[resolveSensor(lens, [body])])
  const box = frame === null ? null : frameBox({ h: frame.hFOV, v: frame.vFOV }, fov)
  const wider = frame !== null && lensWiderThanPhone(frame.hFOV, phoneFov)

  const onScreen = eventScreen !== null && eventScreen.x >= 0 && eventScreen.x <= 1 && eventScreen.y >= 0 && eventScreen.y <= 1
  const eventLine =
    preset === null || eventPos === null
      ? null
      : `${preset.event === 'moonrise' ? 'Moon rises' : preset.event === 'sunset' ? 'Sun sets' : 'Sun rises'} ${onScreen ? 'right there ' : ''}at ${formatClock(preset.at, timeZone)}${onScreen ? '' : `, ${headingWords(normalizeBearing(eventPos.azimuth))}`}`

  const note =
    noPicture || phase.kind === 'compass' ? null
    : orientation === null ? 'Waiting for the compass. Move the phone in a figure of eight if this stays.'
    : calibrating ? `Tap the ${target ?? 'sun'} where you see it.`
    : locateNote !== null ? locateNote
    : null

  return (
    <div className="vf" role="dialog" aria-label="Viewfinder">
      {phase.kind === 'live' ? <video ref={video} className="vf__video" playsInline muted autoPlay aria-hidden="true" /> : <div className="vf__nocam" aria-hidden="true" />}
      <div className="vf__overlay" ref={overlay} onPointerUp={onTap}>
        <svg className="vf__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {horizon.map((d) => (
            <polyline key={`h${d.slice(0, 12)}`} className="vf__horizon" points={d} />
          ))}
          {sunOn
            ? polyline(paths.sun).map((d) => (
                <polyline key={`s${d.slice(0, 12)}`} className="vf__sunpath" points={d} />
              ))
            : null}
          {moon
            ? polyline(paths.moon).map((d) => <polyline key={`m${d.slice(0, 12)}`} className="vf__moonpath" points={d} />)
            : null}
          {milky ? polyline(paths.core).map((d) => <polyline key={`c${d.slice(0, 12)}`} className="vf__corepath" points={d} />) : null}
        </svg>
        {!sunOn
          ? null
          : dots.map((p) => {
              const s = at(p.az, p.alt)
              if (s === null || s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1) return null
              return (
                <span key={p.t.getTime()} className="vf__dotat" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }} data-sun-dot>
                  <i className="vf__dot" />
                  {p.label === null ? null : <span className="vf__hour vf__hour--dot num">{p.label}</span>}
                </span>
              )
            })}
        {eventScreen === null || preset === null || eventScreen.x < 0 || eventScreen.x > 1 ? null : (
          <>
            <span className="vf__ring" style={{ left: `${eventScreen.x * 100}%`, top: `${eventScreen.y * 100}%` }} />
            <span className="vf__event num" style={{ left: `${eventScreen.x * 100}%`, top: `${eventScreen.y * 100}%` }}>
              {PRESET_WORD[preset.event]} {formatClock(preset.at, timeZone)}
            </span>
          </>
        )}
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

      {/* Batch J, Section 7: the sky check, up here so the controls below keep their height. Point at the horizon under the sun's line. */}
      {checked === null ? null : <p className="vf__checked" role="status">{checked}</p>}
      {heading === null ? null : (
        <div className="vf__compass" aria-label={`Pointing ${headingWords(heading)}`} role="img">
          {stripTicks(heading).map((t) => (
            <span key={t.label} className={`vf__ctick${t.point ? ' vf__ctick--pt' : ''}`} style={{ left: `${t.x * 100}%` }}>
              {t.label}
            </span>
          ))}
          <span className="vf__cnow num">▼ {headingWords(heading)}</span>
        </div>
      )}
      {/* The chips under the compass strip, so the controls below keep to a quarter of the screen. */}
        <div className="vf__chips vf__chips--top" role="group" aria-label="What to draw">
          <button type="button" className="vf__pick" aria-pressed={sunOn} onClick={() => setSunOn(!sunOn)}>
            Sun
          </button>
          <button type="button" className="vf__pick" aria-pressed={moon} onClick={() => setMoon(!moon)}>
            Moon
          </button>
          <button type="button" className="vf__pick" aria-pressed={milky} onClick={() => setMilky(!milky)}>
            Milky Way
          </button>
        </div>
      <div className="vf__top">
        {phase.kind !== 'live' ? null : (
        <button
          type="button"
          className="vf__chip vf__checkbtn"
          onClick={() => {
            const v = video.current
            const e = eventScreen !== null && eventScreen.x >= 0 && eventScreen.x <= 1 && eventScreen.y >= 0 && eventScreen.y <= 1 ? eventScreen : null
            const band = e === null ? { x0: 0.35, x1: 0.65, y0: 0.35, y1: 0.5 } : { x0: e.x - 0.12, x1: e.x + 0.12, y0: e.y - 0.14, y1: e.y }
            const stats = v === null ? null : readBand(v, band)
            setChecked(stats === null ? 'No picture to check yet.' : `${skyCheckWords(stats)}.`)
          }}
        >
          Check the gap
        </button>
        )}
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
        {phase.kind === 'compass' ? (
          <p className="vf__note vf__note--act" data-compass-only>
            <span>{phase.why} The compass view, with no picture.</span>
            <button type="button" className="vf__chip" onClick={() => void open()}>
              Retry
            </button>
          </p>
        ) : null}
        {eventLine === null ? null : <p className="vf__head">{eventLine}</p>}
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
          <button type="button" className="vf__act" onClick={locate}>
            <Glyph d="pins" />
            <span>{me === null ? 'Pins from me' : 'Pins from here'}</span>
          </button>
          {target === null || orientation === null ? (
            <span className="vf__act vf__act--off">
              <Glyph d="calibrate" />
              <span>{target === null ? 'Sun and moon down' : 'No compass to calibrate'}</span>
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
