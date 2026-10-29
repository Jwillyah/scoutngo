import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MODES, type FlyMode, type Sticks } from '../core/flyModel.ts'
import type { Look } from '../three/cinema.ts'
import type { FlyHud } from '../lib/fly/useFly.ts'
import { barRole, hudLength, hudSpeed, type FlyUnits } from '../lib/fly/hudUnits.ts'

/*
 * THE FLY SCREEN, LAID OUT LIKE DJI FLY (27 Oct, from the phone: "text
 * blocks"). Landscape by default; portrait still works.
 *
 *   top left      Land, with a confirm; it keeps the flight
 *   top right     battery minutes left, the look (Real / Animated), the "i"
 *   right         the attitude ring: heading ticks, the gimbal's tilt, the
 *                 wind as an arrow, and the obstacle arcs round the drone
 *   bottom edge   small labelled numbers: H, D, H.S, V.S
 *   corners       the sticks, 120 px, translucent, with gold thumbs
 *   between them  C / N / S as one pill, and the gimbal wheel
 *
 * One system of units (src/lib/fly/hudUnits.ts). The app's dock, sheet and
 * time bar are hidden while flying (:root.is-flying).
 */
function Stick({ label, onMove }: { label: string; onMove: (x: number, y: number) => void }) {
  const knob = useRef<HTMLSpanElement>(null)
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const half = r.width / 2
    const x = Math.max(-1, Math.min(1, (e.clientX - r.left - half) / half))
    const y = Math.max(-1, Math.min(1, -(e.clientY - r.top - half) / half))
    if (knob.current !== null) knob.current.style.transform = `translate(${x * half * 0.6}px, ${-y * half * 0.6}px)`
    onMove(x, y)
  }
  const end = () => {
    if (knob.current !== null) knob.current.style.transform = ''
    onMove(0, 0)
  }
  return (
    <div
      className="fly__stick"
      role="application"
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0 || e.pointerType === 'touch') move(e)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span ref={knob} className="fly__knob" />
    </div>
  )
}

/*
 * THE ATTITUDE RING: north up the screen turns with the drone, so the
 * drone's nose is always up. The obstacle arcs sit round the drone icon in
 * the middle, each coloured by how near the scan's nearest surface is that
 * way: the hazard red only inside 5 m.
 */
/*
 * THE LETTERS STAY UPRIGHT (29 Oct: E and W lay on their sides, S upside
 * down). Each is placed where the turning ring puts it and drawn level. The
 * wind's speed is under the ring, not in it, where it sat on the S.
 */
function Ring({ yaw, gimbal, wind, bars }: { yaw: number; gimbal: number; wind: { fromDeg: number } | null; bars: Record<'front' | 'back' | 'left' | 'right', number | null> | null }) {
  const R = 46
  const arc = (from: number, to: number, r: number) => {
    const p = (a: number) => [50 + r * Math.sin((a * Math.PI) / 180), 50 - r * Math.cos((a * Math.PI) / 180)]
    const [x0, y0] = p(from)
    const [x1, y1] = p(to)
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  const sides: ['front' | 'back' | 'left' | 'right', number][] = [
    ['front', 0],
    ['right', 90],
    ['back', 180],
    ['left', 270],
  ]
  return (
    <svg className="fly__ring" viewBox="0 0 100 100" role="img" aria-label={`Heading ${Math.round(((yaw % 360) + 360) % 360)} degrees, gimbal ${Math.round(gimbal)} degrees`}>
      <circle cx="50" cy="50" r={R} className="fly__ringface" />
      <g transform={`rotate(${-yaw} 50 50)`}>
        {Array.from({ length: 36 }, (_, i) => (
          <line key={i} x1="50" y1={50 - R} x2="50" y2={50 - R + (i % 9 === 0 ? 7 : 3)} className="fly__tick" transform={`rotate(${i * 10} 50 50)`} />
        ))}
        {wind === null ? null : (
          /* Where the wind goes: an arrow on the rim, pointing downwind. */
          <path d="M50 8 l-4 7 h8 z" className="fly__windarrow" transform={`rotate(${wind.fromDeg + 180} 50 50)`} />
        )}
      </g>
      {(['N', 'E', 'S', 'W'] as const).map((c, i) => {
        const a = ((i * 90 - yaw) * Math.PI) / 180
        const r = R - 13
        return (
          <text key={c} x={(50 + r * Math.sin(a)).toFixed(1)} y={(50 - r * Math.cos(a) + 3).toFixed(1)} className={`fly__cardinal${c === 'N' ? ' fly__cardinal--n' : ''}`}>
            {c}
          </text>
        )
      })}
      {bars === null
        ? null
        : sides.map(([side, a]) => <path key={side} d={arc(a - 32, a + 32, 22)} className={`fly__arc fly__arc--${barRole(bars[side])}`} />)}
      {/* The drone, nose up. */}
      <path d="M50 41 l7 14 l-7 -4 l-7 4 z" className="fly__drone" />
      {/* The gimbal's tilt: a short needle from level, down when it looks down. */}
      <line x1="72" y1="50" x2={72 + 10 * Math.cos((gimbal * Math.PI) / 180)} y2={50 - 10 * Math.sin((gimbal * Math.PI) / 180)} className="fly__gimbal" />
    </svg>
  )
}

interface FlyControlsProps {
  onSticks: (part: Partial<Sticks>) => void
  mode: FlyMode
  onMode: (m: FlyMode) => void
  hud: FlyHud | null
  ceilingFt: number
  flightMinutes: number
  wind: { fromDeg: number; mps: number } | null
  exposure: string | null
  bars: Record<'front' | 'back' | 'left' | 'right' | 'below', number | null> | null
  units: FlyUnits
  /** The look now, and whether it was chosen by hand or by height. */
  look: Look
  lookAuto: boolean
  onLook: (look: Look) => void
  /** The map data's credits, said in the "i" while flying instead of over the sticks. */
  credits?: readonly string[]
  onExit: () => void
}

/** How long the turn-sideways hint stays before it goes by itself. */
export const HINT_MS = 4000

export function FlyControls({ onSticks, mode, onMode, hud, ceilingFt, flightMinutes, wind, exposure, bars, units, look, lookAuto, onLook, credits = [], onExit }: FlyControlsProps) {
  const s = hud?.state
  const used = hud === null ? 0 : hud.t / 60
  const [confirm, setConfirm] = useState(false)
  const [info, setInfo] = useState(false)
  /* Landscape is the way to hold it; say so once, in portrait, and let it go. */
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth)
  const [hintGone, setHintGone] = useState(false)
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth)
    window.addEventListener('resize', on)
    /* Where the browser lets a page do it (Android, full screen), turn to landscape; iOS does not. */
    const o = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation
    void o?.lock?.('landscape').catch(() => {})
    return () => window.removeEventListener('resize', on)
  }, [])
  /* The hint goes by itself after HINT_MS: said once, not left over the flight. */
  useEffect(() => {
    if (!portrait || hintGone) return
    const t = window.setTimeout(() => setHintGone(true), HINT_MS)
    return () => window.clearTimeout(t)
  }, [portrait, hintGone])
  /*
   * ONE MESSAGE AT A TIME (29 Oct: the hint and "At the ceiling" on top of
   * each other). The most urgent alert, else the hint, else nothing.
   */
  const alert =
    s?.held === 'obstacle' ? 'Stopped: something in the scan is in the way'
    : hud?.hidden === true ? 'Out of your line of sight'
    : hud?.nearCeiling === true ? 'At the ceiling'
    : null
  const hs = hud === null ? null : hud.speedMps
  const vs = s === undefined ? null : s.vz
  const minutesLeft = Math.max(0, flightMinutes - used)
  /* The gimbal wheel is a rate: back to 0 when the finger lifts, or the touch is taken away. */
  const springBack = (e: React.PointerEvent<HTMLInputElement>) => {
    e.currentTarget.value = '0'
    onSticks({ tilt: 0 })
  }
  return (
    <div className={`fly${hud?.hidden === true ? ' fly--hidden' : ''}${portrait ? ' fly--portrait' : ''}`}>
      <div className="fly__top">
        {confirm ? (
          <div className="fly__confirm" role="group" aria-label="Land and keep this flight?">
            <span>Land and keep this flight?</span>
            <button type="button" className="fly__pill fly__pill--on" onClick={onExit}>
              Land
            </button>
            <button type="button" className="fly__pill" onClick={() => setConfirm(false)}>
              Keep flying
            </button>
          </div>
        ) : (
          <button type="button" className="fly__pill fly__land" onClick={() => setConfirm(true)} aria-label="Land and keep this flight">
            Land
          </button>
        )}
        <div className="fly__status num">
          <span className={`fly__batt${minutesLeft < 5 ? ' fly__batt--low' : ''}`} aria-label={`About ${Math.round(minutesLeft)} minutes of flight left`}>
            <svg viewBox="0 0 22 12" aria-hidden="true">
              <rect x="0.5" y="0.5" width="18" height="11" rx="2" className="fly__battcase" />
              <rect x="2" y="2" width={15 * Math.min(1, minutesLeft / flightMinutes)} height="8" rx="1" className="fly__battfill" />
              <rect x="19.5" y="4" width="2" height="4" rx="0.5" className="fly__battcase" />
            </svg>
            {Math.round(minutesLeft)} min
          </span>
          <span className="seg fly__look" role="group" aria-label="Look">
            {(['real', 'animated'] as const).map((l) => (
              <button key={l} type="button" className={`fly__seg${look === l ? ' fly__seg--on' : ''}`} aria-pressed={look === l} onClick={() => onLook(l)}>
                {l === 'real' ? 'Real' : 'Animated'}
              </button>
            ))}
          </span>
          <button type="button" className="fly__i" aria-expanded={info} aria-label="About this flight model" onClick={() => setInfo(!info)}>
            i
          </button>
        </div>
      </div>
      {info ? (
        <div className="fly__info" role="dialog" aria-label="About this flight model">
          <p>
            Top speed by mode: Cine {hudSpeed(MODES.cine.speedMps, units)}, Normal {hudSpeed(MODES.normal.speedMps, units)}, Sport {hudSpeed(MODES.sport.speedMps, units)} {units.speed}. DJI publishes only
            Sport's; the other two are assumed. A flight model, not a physics simulator.
          </p>
          <p>{lookAuto ? `The look turns Animated below 150 ft by itself, where the photo is stretched and soft; tap Real or Animated to choose.` : 'You chose the look; it stays until you land.'}</p>
          {exposure === null ? null : <p>Exposure from your ND table: {exposure}.</p>}
          <p>Ceiling {Math.round(units.length === 'ft' ? ceilingFt : ceilingFt * 0.3048)} {units.length} above takeoff.</p>
          {credits.length === 0 ? null : <p className="fly__credits">Data: {credits.map((c) => (c.endsWith('.') ? c : `${c}.`)).join(' ')}</p>}
        </div>
      ) : null}
      {alert !== null ? (
        <p className="fly__alert" role="status">
          {alert}
        </p>
      ) : portrait && !hintGone ? (
        <button type="button" className="fly__rotate" onClick={() => setHintGone(true)}>
          Turn sideways to fly. Portrait works too.
        </button>
      ) : null}

      <Ring
        yaw={s?.yaw ?? 0}
        gimbal={s?.gimbal ?? 0}
        wind={wind === null ? null : { fromDeg: wind.fromDeg }}
        bars={bars}
      />
      {wind === null ? null : (
        <p className="fly__wind num">
          Wind {hudSpeed(wind.mps, units)} {units.speed}
        </p>
      )}

      <div className="fly__sticks">
        <Stick label="Left stick: climb and turn" onMove={(x, y) => onSticks({ yaw: x, climb: y })} />
        <div className="fly__middle">
          <span className="fly__modes" role="group" aria-label="Flight mode">
            {(['cine', 'normal', 'sport'] as const).map((m) => (
              <button key={m} type="button" className={`fly__seg${mode === m ? ' fly__seg--on' : ''}`} aria-pressed={mode === m} aria-label={m[0].toUpperCase() + m.slice(1)} onClick={() => onMode(m)}>
                {m[0].toUpperCase()}
              </button>
            ))}
          </span>
          <label className="fly__wheel">
            <span className="fly__label">Gimbal</span>
            <input type="range" min={-60} max={60} step={1} defaultValue={0} onChange={(e) => onSticks({ tilt: Number(e.target.value) })} onPointerUp={springBack} onPointerCancel={springBack} aria-label="Gimbal tilt, degrees a second" />
          </label>
        </div>
        <Stick label="Right stick: forward, back and sideways" onMove={(x, y) => onSticks({ side: x, forward: y })} />
      </div>

      <div className="fly__readout num" role="status">
        <span>
          <b>H</b> {hudLength(s?.alt, units)} {units.length}
        </span>
        <span>
          <b>D</b> {hudLength(hud?.distanceM, units)} {units.length}
        </span>
        <span>
          <b>H.S</b> {hudSpeed(hs, units)} {units.speed}
        </span>
        <span>
          <b>V.S</b> {hudSpeed(vs, units)} {units.speed}
        </span>
      </div>
    </div>
  )
}
