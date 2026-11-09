import { useEffect, useRef, useState } from 'react'
import { legendStops, SCALE, windRgb } from '../core/windViewport.ts'
import { windUnitLabel, type WindUnit } from '../lib/units.ts'
import { formatClock, formatShortHour, zoneOffsetMs } from '../core/timezone.ts'
import { MODEL_CHIPS, type WindModelChip } from '../lib/useWindViewport.ts'
import '../styles/wind.css'

/*
 * THE WIND LAYER'S TIME BAR (Batch Map, Section 1; board WindV3): a play
 * button, the time shown, the models (HRRR · Blend · ECMWF, Blend first),
 * and the timeline: day ticks and a thin strip coloured by the wind at the
 * crosshair for each hour, so a windy afternoon shows before it is played.
 * It takes the time sheet's place while the wind layer is on, as the radar
 * legend does for radar.
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
}

const HOUR = 3_600_000

export function WindTimeBar({ at, from, hours, timeZone, onAt, model, onModel, strip, unit }: Props) {
  const [play, setPlay] = useState(false)
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
  /* The venue's hour of the day, as data (src/core/timezone.ts zoneOffsetMs), for where the ticks go. */
  const hourOf = (d: Date) => new Date(d.getTime() + zoneOffsetMs(d, timeZone)).getUTCHours()
  const ticks: { x: number; label: string }[] = []
  for (let i = 0; i < hours; i += 1) {
    const t = new Date(from.getTime() + i * HOUR)
    const h = hourOf(t)
    if (h === 0) ticks.push({ x: i / (hours - 1), label: day(t) })
    else if ((h === 12 || h === 18) && i < 30) ticks.push({ x: i / (hours - 1), label: formatShortHour(t, timeZone) })
  }
  const stops = strip.map((v, i) => `${v === null ? 'rgb(255 255 255 / 0.2)' : `rgb(${windRgb(v).join(' ')})`} ${((i / Math.max(1, strip.length - 1)) * 100).toFixed(1)}%`)
  const pick = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    setPlay(false)
    onAt(new Date(from.getTime() + Math.round(f * (hours - 1)) * HOUR))
  }
  /* "now" beside the time while it is the strip's own first hour (the time bar starts at now). */
  const isNow = at.getTime() - from.getTime() < HOUR
  return (
    <div className="wbar" data-wind-timebar>
      {/* The legend (board WindV3: KNOTS 0 5 10 15 20 25 30+), in the user's unit, at the top of the sheet where it is always on show. */}
      <div className="windv3__legend" aria-label={`Wind colour, ${windUnitLabel(unit)}`}>
        <p className="windv3__legendname">{unit === 'kt' ? 'KNOTS' : windUnitLabel(unit).toUpperCase()}</p>
        <div className="windv3__bar" style={{ background: `linear-gradient(90deg, ${SCALE.map((s) => `rgb(${s.rgb.join(' ')})`).join(', ')})` }}>
          {legendStops(unit).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
      <div className="wbar__top">
        <button type="button" className="ui-round ui-round--icon ui-round--on wbar__play" aria-label={play ? 'Pause' : 'Play the wind'} aria-pressed={play} onClick={() => setPlay(!play)}>
          {play ? '❚❚' : '▶'}
        </button>
        <div className="wbar__when">
          <p className="wbar__time">{formatClock(at, timeZone)}</p>
          <p className="wbar__day">{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(at)}{isNow ? ' · now' : ''}</p>
        </div>
        <div className="wbar__models" role="radiogroup" aria-label="Model">
          {MODEL_CHIPS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={m.id === model} className={`ui-chip wbar__chip${m.id === model ? ' ui-chip--on' : ''}`} onClick={() => onModel(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="wbar__track"
        role="slider"
        aria-label="Time"
        aria-valuemin={0}
        aria-valuemax={hours - 1}
        aria-valuenow={Math.round(frac * (hours - 1))}
        aria-valuetext={formatClock(at, timeZone)}
        tabIndex={0}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => (e.buttons === 1 ? pick(e.clientX, e.currentTarget) : undefined)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onAt(new Date(Math.min(from.getTime() + (hours - 1) * HOUR, at.getTime() + HOUR)))
          if (e.key === 'ArrowLeft') onAt(new Date(Math.max(from.getTime(), at.getTime() - HOUR)))
        }}
      >
        <div className="wbar__strip" style={{ background: stops.length < 2 ? undefined : `linear-gradient(90deg, ${stops.join(', ')})` }} />
        <div className="wbar__needle" style={{ left: `${(frac * 100).toFixed(2)}%` }} />
      </div>
      <div className="wbar__ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span key={`${t.x}`} style={{ left: `${(t.x * 100).toFixed(2)}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  )
}
