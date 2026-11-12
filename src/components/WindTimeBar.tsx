import { useEffect, useRef, useState } from 'react'
import { legendTicks, SCALE, windRgb } from '../core/windViewport.ts'
import { windIn, windUnitLabel, type WindUnit } from '../lib/units.ts'
import { formatClock, zoneOffsetMs } from '../core/timezone.ts'
import { MODEL_CHIPS, type WindModelChip } from '../lib/useWindViewport.ts'
import '../styles/wind.css'

/*
 * THE WIND LAYER'S BAR (Batch Map, Section 1; Batch TRUTH, Section 7: wind is
 * the whole map, Windy-style in our look). One thin bar, 96 px with the safe
 * area under it: the legend a 4 px line along its top (0 · 10 · 20 · 30+),
 * then play, the time and day, the model (a small menu: Blend · HRRR ·
 * ECMWF), Surface or 400 ft, "i" for what the colours mean, and the
 * scrubber with its day ticks, coloured by the wind at the crosshair hour by
 * hour. Dragging the sheet up shows the crosshair's hours.
 */
interface Props {
  at: Date
  from: Date
  hours: number
  timeZone: string
  onAt: (t: Date) => void
  model: WindModelChip
  onModel: (m: WindModelChip) => void
  /** The wind at the crosshair by the hour, m/s, from `from`; null where it is not known. */
  strip: (number | null)[]
  unit: WindUnit
  /** Surface (0) or the drone's 400 ft. */
  levelFt?: 0 | 400
  onLevel?: (ft: 0 | 400) => void
  /** What the colours and the lines are, behind "i". */
  note?: string
  /** The clock now, for "· now" beside the time. */
  now?: Date
  /** Wind off: the map's controls back (the wind mode hides the layer chip and the rail). */
  onOff?: () => void
}

const HOUR = 3_600_000
/* Blend first: the global models, the whole map at every zoom. */
const MENU_ORDER: readonly WindModelChip[] = ['blend', 'hrrr', 'ecmwf']

export function WindTimeBar({ at, from, hours, timeZone, onAt, model, onModel, strip, unit, levelFt = 0, onLevel, note, now, onOff }: Props) {
  const [play, setPlay] = useState(false)
  const [menu, setMenu] = useState(false)
  const [info, setInfo] = useState(false)
  const atRef = useRef(at)
  useEffect(() => {
    atRef.current = at
  }, [at])
  useEffect(() => {
    if (!play) return
    const t = setInterval(() => {
      const next = new Date(atRef.current.getTime() + HOUR)
      onAt(next.getTime() > from.getTime() + (hours - 1) * HOUR ? from : next)
    }, 650)
    return () => clearInterval(t)
  }, [play, from, hours, onAt])
  const frac = Math.max(0, Math.min(1, (at.getTime() - from.getTime()) / ((hours - 1) * HOUR)))
  const day = (d: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(d)
  const hourOf = (d: Date) => new Date(d.getTime() + zoneOffsetMs(d, timeZone)).getUTCHours()
  const ticks: { x: number; label: string }[] = []
  for (let i = 0; i < hours; i += 1) {
    const t = new Date(from.getTime() + i * HOUR)
    if (hourOf(t) === 0) ticks.push({ x: i / (hours - 1), label: day(t) })
  }
  const stops = strip.map((v, i) => `${v === null ? 'rgb(255 255 255 / 0.2)' : `rgb(${windRgb(v).join(' ')})`} ${((i / Math.max(1, strip.length - 1)) * 100).toFixed(1)}%`)
  const pick = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    setPlay(false)
    onAt(new Date(from.getTime() + Math.round(f * (hours - 1)) * HOUR))
  }
  /* "now" while the bar is on this hour (Batch TRUTH: it opens there). */
  const isNow = now !== undefined && Math.abs(at.getTime() - now.getTime()) < HOUR / 2
  const label = MODEL_CHIPS.find((m) => m.id === model)?.label ?? 'Blend'
  return (
    <div className="wbar wbar--thin" data-wind-timebar>
      {/* The legend as a 4 px line along the bar's top, 0 · 10 · 20 · 30+ in the user's unit. */}
      <div className="wbar__legend" aria-label={`Wind colour, ${windUnitLabel(unit)}`} style={{ background: `linear-gradient(90deg, ${SCALE.map((s) => `rgb(${s.rgb.join(' ')})`).join(', ')})` }}>
        {legendTicks(unit).map((t) => (
          <span key={t.label} style={{ left: `${(t.x * 100).toFixed(1)}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="wbar__top">
        <button type="button" className="wbar__play" aria-label={play ? 'Pause' : 'Play the wind'} aria-pressed={play} onClick={() => setPlay(!play)}>
          {play ? '❚❚' : '▶'}
        </button>
        <p className="wbar__when">
          <span className="wbar__day">{new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(at)}</span> <span className="wbar__time">{formatClock(at, timeZone)}</span>
          {isNow ? <span className="wbar__now"> · now</span> : null}
        </p>
        <div className="wbar__menuwrap">
          <button type="button" className="wbar__pill" aria-haspopup="menu" aria-expanded={menu} aria-label={`Model: ${label}`} onClick={() => setMenu(!menu)}>
            {label}
          </button>
          {menu ? (
            <div className="wbar__menu" role="radiogroup" aria-label="Model">
              {MENU_ORDER.map((id) => {
                const m = MODEL_CHIPS.find((c) => c.id === id)
                if (m === undefined) return null
                return (
                  <button key={m.id} type="button" role="radio" aria-checked={m.id === model} className={`wbar__menuitem${m.id === model ? ' wbar__menuitem--on' : ''}`} onClick={() => (onModel(m.id), setMenu(false))}>
                    {m.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
        {onLevel === undefined ? null : (
          <button type="button" className="wbar__pill" aria-label={levelFt === 0 ? 'Surface wind; show 400 ft' : '400 ft wind; show the surface'} onClick={() => onLevel(levelFt === 0 ? 400 : 0)}>
            {levelFt === 0 ? 'Surface' : '400 ft'}
          </button>
        )}
        {onOff === undefined ? null : (
          <button type="button" className="wbar__info wbar__off" aria-label="Turn the wind off" data-wind-off onClick={onOff}>
            ✕
          </button>
        )}
        {note === undefined ? null : (
          <button type="button" className="wbar__info" aria-label="What the colours mean" aria-expanded={info} onClick={() => setInfo(!info)}>
            i
          </button>
        )}
      </div>
      {info && note !== undefined ? <p className="wbar__note">{note}</p> : null}
      <div
        className="wbar__track"
        role="slider"
        aria-label="Time"
        aria-valuemin={0}
        aria-valuemax={hours - 1}
        aria-valuenow={Math.round(frac * (hours - 1))}
        aria-valuetext={formatClock(at, timeZone)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.stopPropagation()
          pick(e.clientX, e.currentTarget)
        }}
        onPointerMove={(e) => (e.buttons === 1 ? pick(e.clientX, e.currentTarget) : undefined)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onAt(new Date(Math.min(from.getTime() + (hours - 1) * HOUR, at.getTime() + HOUR)))
          if (e.key === 'ArrowLeft') onAt(new Date(Math.max(from.getTime(), at.getTime() - HOUR)))
        }}
      >
        <div className="wbar__strip" style={{ background: stops.length < 2 ? undefined : `linear-gradient(90deg, ${stops.join(', ')})` }} />
        <div className="wbar__needle" style={{ left: `${(frac * 100).toFixed(2)}%` }} />
        {ticks.map((t) => (
          <span key={`${t.x}`} className="wbar__tick" style={{ left: `${(t.x * 100).toFixed(2)}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  )
}


/** Dragging the wind bar up: the crosshair's wind hour by hour from the bar's time, in the user's unit, each a swatch of its colour. */
export function WindHours({ at, from, strip, unit, timeZone }: { at: Date; from: Date; strip: (number | null)[]; unit: WindUnit; timeZone: string }) {
  const start = Math.max(0, Math.floor((at.getTime() - from.getTime()) / HOUR))
  const rows = strip.slice(start, start + 24).map((mps, i) => ({ t: new Date(from.getTime() + (start + i) * HOUR), mps }))
  if (rows.length === 0) return <p className="wbar__note">The crosshair&rsquo;s hours come with the wind.</p>
  return (
    <div className="whours" data-wind-hours>
      <p className="whours__head">At the crosshair, hour by hour</p>
      <ol className="whours__rows">
        {rows.map((r) => (
          <li key={r.t.getTime()} className="whours__row">
            <span className="whours__t">{formatClock(r.t, timeZone).replace(/:00 /, ' ')}</span>
            <span className="whours__sw" style={{ background: r.mps === null ? undefined : `rgb(${windRgb(r.mps).join(' ')})` }} />
            <span className="whours__v num">{r.mps === null ? '—' : `${Math.round(windIn(r.mps, unit) ?? 0)} ${windUnitLabel(unit)}`}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
