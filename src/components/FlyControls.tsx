import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { MODES, type FlyMode, type Sticks } from '../core/flyModel.ts'
import { compass } from '../lib/tideWords.ts'
import type { FlyHud } from '../lib/fly/useFly.ts'

/*
 * THE SCREEN LIKE A DJI CONTROLLER (Mode 2): left stick climb and turn, right
 * stick forward, back and sideways, a gimbal wheel, Cine / Normal / Sport. A
 * Bluetooth game controller drives the same model when one is connected.
 * The HUD reads like DJI Fly's: height, distance, speed, battery, the wind at
 * height, the compass, the gimbal, the ceiling, the obstacle bars, and an
 * exposure hint from your ND table. It flashes amber and the phone buzzes
 * when the drone drops out of your line of sight.
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

interface FlyControlsProps {
  /** Stick and wheel changes, merged into what the 3D view's loop reads. */
  onSticks: (part: Partial<Sticks>) => void
  mode: FlyMode
  onMode: (m: FlyMode) => void
  hud: FlyHud | null
  ceilingFt: number
  flightMinutes: number
  wind: { fromDeg: number; mps: number } | null
  /** Your ND table's answer for this moment (src/core/ndFilter.ts), or null. */
  exposure: string | null
  bars: Record<'front' | 'back' | 'left' | 'right' | 'below', number | null> | null
  onExit: () => void
}

export function FlyControls({ onSticks, mode, onMode, hud, ceilingFt, flightMinutes, wind, exposure, bars, onExit }: FlyControlsProps) {
  const s = hud?.state
  const used = hud === null ? 0 : hud.t / 60
  const bar = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)} m`)
  return (
    <div className={`fly${hud?.hidden === true ? ' fly--hidden' : ''}`}>
      <div className="fly__hud num" role="status">
        <span>H {s === undefined ? '—' : Math.round(s.alt / 0.3048)} ft{hud?.nearCeiling === true ? ` · ceiling ${ceilingFt}` : ''}</span>
        <span>D {hud === null ? '—' : Math.round(hud.distanceM)} m</span>
        <span>{hud === null ? '—' : hud.speedMps.toFixed(1)} m/s</span>
        <span>Batt {Math.max(0, flightMinutes - used).toFixed(0)} min</span>
        <span>{s === undefined ? '' : `${compass(s.yaw)} ${Math.round(s.yaw)}°`}</span>
        <span>Gimbal {s === undefined ? '—' : Math.round(s.gimbal)}°</span>
        {wind === null ? null : (
          <span>
            Wind <span className="fly__arrow" style={{ transform: `rotate(${wind.fromDeg + 180}deg)` }} aria-hidden="true">↑</span> {wind.mps.toFixed(0)} m/s
          </span>
        )}
        {exposure === null ? null : <span>{exposure}</span>}
        {hud?.hidden === true ? <strong className="fly__los">Out of your line of sight</strong> : null}
        {s?.held === 'obstacle' ? <strong>Stopped: something in the scan is in the way</strong> : null}
      </div>
      {bars === null ? null : (
        <div className="fly__bars num" aria-label="Distance to what the scan has around the drone">
          <span>Front {bar(bars.front)}</span>
          <span>Back {bar(bars.back)}</span>
          <span>Left {bar(bars.left)}</span>
          <span>Right {bar(bars.right)}</span>
          <span>Below {bar(bars.below)}</span>
        </div>
      )}
      <div className="fly__modes seg" role="group" aria-label="Flight mode">
        {(['cine', 'normal', 'sport'] as const).map((m) => (
          <button key={m} type="button" className={`seg__btn${mode === m ? ' seg__btn--on' : ''}`} aria-pressed={mode === m} onClick={() => onMode(m)}>
            {m[0].toUpperCase() + m.slice(1)} {MODES[m].speedMps}
            {MODES[m].published ? '' : '*'}
          </button>
        ))}
      </div>
      <div className="fly__sticks">
        <Stick label="Left stick: climb and turn" onMove={(x, y) => onSticks({ yaw: x, climb: y })} />
        <label className="fly__wheel">
          <span className="fly__small">Gimbal</span>
          <input type="range" min={-60} max={60} step={1} defaultValue={0} onChange={(e) => onSticks({ tilt: Number(e.target.value) })} onPointerUp={(e) => {
            ;(e.target as HTMLInputElement).value = '0'
            onSticks({ tilt: 0 })
          }} aria-label="Gimbal tilt, degrees a second" />
        </label>
        <Stick label="Right stick: forward, back and sideways" onMove={(x, y) => onSticks({ side: x, forward: y })} />
      </div>
      <p className="fly__small">* speed assumed: DJI publishes only Sport's 21 m/s. A flight model, not a physics simulator.</p>
      <button type="button" className="btn btn--small fly__exit" onClick={onExit}>
        Land and keep this flight
      </button>
    </div>
  )
}
