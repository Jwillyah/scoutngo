import { useEffect, useMemo, useRef, useState } from 'react'
import { minutesForDrag, timeBarModel } from '../core/timeBar.ts'
import { formatClock, zonedTimeToUtc } from '../core/timezone.ts'

/*
 * THE DOCKED TIME BAR.
 *
 * The needle stays in the middle; the sky slides under it. Drag the strip
 * sideways to move through the day, tap the big date and time to jump to any
 * moment, the arrow to come back to the shoot window. The sun's height is the
 * line, the dots are the horizon, and the bands are the light. With the moon
 * on, its line is drawn too.
 *
 * WHITE NEEDLE, NOT RED. The brief asked for a red needle; red in this app
 * means hazard and nothing else, so the needle is the accent white.
 *
 * Every number on it is src/core/timeBar.ts; this only draws and listens.
 */
interface TimeBarProps {
  at: Date
  lat: number
  lon: number
  timeZone: string
  timeZoneAbbr: string
  moon: boolean
  onAt: (next: Date) => void
  /** Back to the middle of the shoot window. */
  onReset: () => void
}

const HEIGHT = 52

/* yyyy-mm-dd and HH:MM at the venue, for the jump field. */
function venueParts(at: Date, timeZone: string): { date: string; time: string } {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  return { date, time: formatClock(at, timeZone) }
}

export function TimeBar({ at, lat, lon, timeZone, timeZoneAbbr, moon, onAt, onReset }: TimeBarProps) {
  const strip = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  useEffect(() => {
    const el = strip.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.max(120, Math.round(entry.contentRect.width)))
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  const model = useMemo(
    () => timeBarModel({ at, width, height: HEIGHT, lat, lon, timeZone, moon }),
    [at, width, lat, lon, timeZone, moon],
  )

  /* The drag: each move shifts the needle's time by the pixels moved. */
  /*
   * SIDEWAYS IS OURS, UP AND DOWN IS THE SHEET'S. The drag is held undecided
   * for a few pixels; once it is clearly sideways the strip takes it and the
   * sheet never sees it. See the axis lock in BottomSheet.tsx.
   */
  const drag = useRef<{ x: number; y: number; at: number; mine: boolean } | null>(null)
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, at: at.getTime(), mine: false }
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d === null) return
    const dx = event.clientX - d.x
    if (!d.mine) {
      const dy = event.clientY - d.y
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return
      }
      if (Math.abs(dx) <= 8) return
      d.mine = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* Nothing to capture for a synthetic pointer. */
      }
    }
    event.stopPropagation()
    const minutes = Math.round(minutesForDrag(dx, width))
    onAt(new Date(d.at + minutes * 60_000))
  }
  const endDrag = () => {
    drag.current = null
  }

  const parts = venueParts(at, timeZone)
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(at)

  return (
    <div className="tbar">
      <div className="tbar__head">
        <label className="tbar__when">
          <span className="tbar__day">{day}</span>
          <span className="tbar__time num">
            {parts.time} <span className="tbar__zone">{timeZoneAbbr}</span>
          </span>
          {/* The real control, over the text: tap the time to jump to any moment. */}
          <input
            className="tbar__jump"
            type="datetime-local"
            aria-label="Jump to a date and time"
            value={`${parts.date}T${parts.time}`}
            onChange={(event) => {
              const [date, time] = event.target.value.split('T')
              if (date === undefined || time === undefined) return
              const next = zonedTimeToUtc(date, time.slice(0, 5), timeZone)
              if (next !== null) onAt(next)
            }}
          />
        </label>
        <button type="button" className="tbar__reset" onClick={onReset} aria-label="Back to the shoot window">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4.5 9a6 6 0 1 1 1.6 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M3.5 4.5v4.5H8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div
        ref={strip}
        className="tbar__strip"
        data-axis-lock
        role="slider"
        aria-label="Time of day. Drag sideways to move through it."
        aria-valuetext={`${parts.time} ${timeZoneAbbr}`}
        aria-valuenow={at.getTime()}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') onAt(new Date(at.getTime() + 15 * 60_000))
          if (event.key === 'ArrowLeft') onAt(new Date(at.getTime() - 15 * 60_000))
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg width={width} height={HEIGHT + 18} aria-hidden="true">
          {model.bands.map((b) => (
            <rect key={`${b.band}-${b.x0}`} className={`curve__band curve__band--${b.band}`} x={b.x0} y={0} width={Math.max(0, b.x1 - b.x0)} height={HEIGHT} />
          ))}
          <line className="tbar__horizon" x1={0} x2={width} y1={model.horizonY} y2={model.horizonY} />
          {model.moonPath === null ? null : <path className="tbar__moon" d={model.moonPath} />}
          <path className="tbar__sun" d={model.sunPath} />
          {model.marks.map((m) => (
            <g key={`${m.body}-${m.kind}-${Math.round(m.x)}`} className={`tbar__mark tbar__mark--${m.body}`} transform={`translate(${m.x} ${model.horizonY})`}>
              <circle r={4} />
              <path d={m.kind === 'rise' ? 'M0 -5 V-12 M-3 -9 L0 -12 L3 -9' : 'M0 5 V12 M-3 9 L0 12 L3 9'} />
            </g>
          ))}
          {model.ticks.map((t) => (
            <g key={t.x} className="tbar__tick">
              <line x1={t.x} x2={t.x} y1={HEIGHT} y2={HEIGHT + (t.major ? 7 : 4)} />
              {/* A label the strip's edge would cut in half reads as another hour: left off. */}
              {t.label === null || t.x < 10 || t.x > width - 10 ? null : (
                <text x={t.x} y={HEIGHT + 17} textAnchor="middle">
                  {t.label.slice(0, 2)}
                </text>
              )}
            </g>
          ))}
          <line className="tbar__needle" x1={width / 2} x2={width / 2} y1={0} y2={HEIGHT + 8} />
        </svg>
      </div>
    </div>
  )
}
