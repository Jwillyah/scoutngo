import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dragAxis, releaseVelocity, VERTICAL_SLOP_ON_SIDEWAYS_PX } from '../core/sheetMotion.ts'
import { MINUTES_ACROSS, minutesForDrag, timeBarModel } from '../core/timeBar.ts'
import { formatClock, venueAndYours, zonedTimeToUtc } from '../core/timezone.ts'
import { claimGesture, gestureOwner } from '../lib/gestureOwner.ts'
import { publishLiveTime } from '../lib/liveTime.ts'

/*
 * THE DOCKED TIME BAR.
 *
 * The needle stays in the middle; the sky slides under it. Drag the strip
 * sideways to move through the day, flick it and it coasts, tap anywhere on
 * it to jump there; tap the big date and time to jump to any moment, the
 * arrow to come back to the shoot window. The sun's height is the line, the
 * dots are the horizon, and the bands are the light. With the moon on, its
 * line is drawn too.
 *
 * WHITE NEEDLE, NOT RED. Red in this app means hazard and nothing else.
 *
 * Every number on it is src/core/timeBar.ts; this only draws and listens.
 */
interface TimeBarProps {
  at: Date
  lat: number
  lon: number
  timeZone: string
  moon: boolean
  onAt: (next: Date) => void
  /** Back to the middle of the shoot window. */
  onReset: () => void
}

const HEIGHT = 52
const MINUTE = 60_000
/** A quarter hour: the light tick under a thumb, where the phone can give one. */
const QUARTER = 15 * MINUTE

/*
 * THE STRIP IS DRAWN THREE SCREENS WIDE AND SLID, NOT REDRAWN.
 *
 * 29 Oct: "the ruler doesn't follow the finger smoothly, sometimes doesn't
 * move at all, and the map shadows lag or jump." Every move used to send the
 * new time up through the whole app (the plan, the map, the shadows) and the
 * ruler only moved when that came back down: a busy frame was a frozen ruler.
 * Now the finger moves the drawing directly (a transform, in the same frame),
 * the time on the label is written straight into it, and the app hears the
 * new time at most once a frame, as a transition it may interrupt. The strip
 * is redrawn round the new time only when the drag has run a screen's width.
 */
const SPAN = 3

/* After a flick, the ruler coasts and slows like a scroll wheel: velocity falls by e every 325 ms. */
const COAST_MS = 325
const COAST_FROM_PX_PER_MS = 0.15
const COAST_STOP_PX_PER_MS = 0.01

/* yyyy-mm-dd and HH:MM at the venue, for the jump field: the input's own format, always 24 hour. */
function venueParts(at: Date, timeZone: string): { date: string; time: string } {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  return { date, time: formatClock(at, timeZone, 24) }
}

export function TimeBar({ at, lat, lon, timeZone, moon, onAt, onReset }: TimeBarProps) {
  const strip = useRef<HTMLDivElement>(null)
  const drawing = useRef<SVGGElement>(null)
  const label = useRef<HTMLSpanElement>(null)
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

  /* The time the wide drawing is centred on. Follows `at` except while the finger (or a coast) has the ruler. */
  const [anchor, setAnchor] = useState(at)
  const busy = useRef(false)
  const live = useRef(at.getTime())
  /* The last time this bar sent up: a different `at` coming down is someone else's (the date field, the arrow, a jump). */
  const sentAt = useRef(at.getTime())
  /* The coast after a flick: its animation frame, or 0. */
  const coast = useRef(0)
  useEffect(() => {
    if (busy.current) {
      if (Math.abs(at.getTime() - sentAt.current) < 60_000) return
      /* Set from elsewhere mid-coast: the coast stops, the new time stands (29 Oct: a coast overwrote a picked time). */
      if (coast.current !== 0) cancelAnimationFrame(coast.current)
      coast.current = 0
      busy.current = false
    }
    live.current = at.getTime()
    setAnchor(at)
  }, [at])

  const model = useMemo(
    () => timeBarModel({ at: anchor, width: width * SPAN, height: HEIGHT, lat, lon, timeZone, moon, minutesAcross: MINUTES_ACROSS * SPAN }),
    [anchor, width, lat, lon, timeZone, moon],
  )
  const pxPerMs = width / (MINUTES_ACROSS * MINUTE)
  /* Read by the handlers, which outlive the render they were made in. */
  const anchorAt = useRef(anchor.getTime())
  const slideFrom = (from: number, t: number) => `translate(${(-width * (SPAN - 1)) / 2 + (from - t) * pxPerMs} 0)`
  const slide = (t: number) => slideFrom(anchorAt.current, t)
  /* A redraw round a new anchor puts the drawing back under the live time, whatever React thinks it last wrote. */
  useLayoutEffect(() => {
    anchorAt.current = anchor.getTime()
    drawing.current?.setAttribute('transform', slide(live.current))
  })

  /* ------------------------------------------------- the ruler, by hand */
  const sent = useRef(0)
  const quarter = useRef(Math.floor(at.getTime() / QUARTER))
  /** Puts the ruler at a time: the drawing slid, the label rewritten, the app told once a frame. */
  const show = (t: number) => {
    live.current = t
    const g = drawing.current
    if (g !== null) g.setAttribute('transform', slide(t))
    if (label.current !== null) label.current.textContent = venueAndYours(new Date(t), timeZone)
    /* The same time to whatever follows the needle in the same frame: the shadows (src/lib/liveTime.ts). */
    publishLiveTime(t)
    /* The needle's time as drawn, for scripts/measure-timebar.mjs. */
    if (strip.current !== null) strip.current.dataset.live = String(Math.round(t))
    const q = Math.floor(t / QUARTER)
    if (q !== quarter.current) {
      quarter.current = q
      /* A light tick on each quarter hour. No API for it on an iPhone; elsewhere, 4 ms. */
      ;(navigator as Navigator & { vibrate?: (ms: number) => boolean }).vibrate?.(4)
    }
    if (sent.current === 0) {
      sent.current = requestAnimationFrame(() => {
        sent.current = 0
        const next = new Date(Math.round(live.current / MINUTE) * MINUTE)
        sentAt.current = next.getTime()
        startTransition(() => onAt(next))
      })
    }
    /* A screen's width from the drawing's centre: redraw round here. */
    if (Math.abs(t - anchorAt.current) * pxPerMs > width * 0.9) setAnchor(new Date(t))
  }

  const stopCoast = () => {
    if (coast.current !== 0) cancelAnimationFrame(coast.current)
    coast.current = 0
  }
  useEffect(() => () => stopCoast(), [])

  const drag = useRef<{ x: number; y: number; t0: number; mine: boolean; samples: [number, number][] } | null>(null)

  const finish = () => {
    busy.current = false
    const final = new Date(Math.round(live.current / MINUTE) * MINUTE)
    sentAt.current = final.getTime()
    onAt(final)
    setAnchor(final)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    stopCoast()
    drag.current = { x: event.clientX, y: event.clientY, t0: live.current, mine: false, samples: [[event.timeStamp, event.clientX]] }
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d === null) return
    const dx = event.clientX - d.x
    if (!d.mine) {
      /* Sideways is the ruler's, up or down the sheet's, decided once on the first 8 px (src/core/sheetMotion.ts). */
      const axis = dragAxis(dx, event.clientY - d.y, VERTICAL_SLOP_ON_SIDEWAYS_PX)
      if (axis === null) return
      if (axis === 'y' || (gestureOwner() !== null && gestureOwner() !== 'scrub') || !claimGesture('scrub')) {
        drag.current = null
        return
      }
      d.mine = true
      busy.current = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* Nothing to capture for a synthetic pointer. */
      }
    }
    event.stopPropagation()
    d.samples.push([event.timeStamp, event.clientX])
    if (d.samples.length > 12) d.samples.shift()
    show(d.t0 + minutesForDrag(dx, width) * MINUTE)
  }
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (d === null) return
    if (!d.mine) {
      /* A tap: jump to the time under the finger. */
      const box = event.currentTarget.getBoundingClientRect()
      const offset = event.clientX - (box.left + box.width / 2)
      const next = new Date(Math.round((live.current + minutesForDrag(-offset, width) * MINUTE) / MINUTE) * MINUTE)
      live.current = next.getTime()
      onAt(next)
      return
    }
    const v = releaseVelocity(d.samples)
    if (Math.abs(v) < COAST_FROM_PX_PER_MS) {
      finish()
      return
    }
    /* Coast: the ruler keeps going the way it was flicked and slows to a stop. */
    let speed = v
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(48, now - last)
      last = now
      speed *= Math.exp(-dt / COAST_MS)
      show(live.current + minutesForDrag(speed * dt, width) * MINUTE)
      if (Math.abs(speed) < COAST_STOP_PX_PER_MS) {
        coast.current = 0
        finish()
        return
      }
      coast.current = requestAnimationFrame(step)
    }
    coast.current = requestAnimationFrame(step)
  }
  const onPointerCancel = () => {
    const d = drag.current
    drag.current = null
    if (d?.mine) finish()
  }

  const parts = venueParts(at, timeZone)
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(at)
  const fullWidth = width * SPAN

  return (
    <div className="tbar">
      <div className="tbar__head">
        {/* The date row: a tap jumps to a moment, a drag up or down moves the sheet (BottomSheet.tsx). */}
        <label className="tbar__when" data-sheet-drag>
          <span className="tbar__day">{day}</span>
          <span ref={label} className="tbar__time num">
            {venueAndYours(at, timeZone)}
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
        data-sideways
        role="slider"
        aria-label="Time of day. Drag sideways to move through it, or tap a time."
        aria-valuetext={venueAndYours(at, timeZone)}
        aria-valuenow={at.getTime()}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') onAt(new Date(at.getTime() + QUARTER))
          if (event.key === 'ArrowLeft') onAt(new Date(at.getTime() - QUARTER))
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <svg width={width} height={HEIGHT + 18} aria-hidden="true">
          <g ref={drawing} transform={slideFrom(anchor.getTime(), at.getTime())}>
            {model.bands.map((b) => (
              <rect key={`${b.band}-${b.x0}`} className={`curve__band curve__band--${b.band}`} x={b.x0} y={0} width={Math.max(0, b.x1 - b.x0)} height={HEIGHT} />
            ))}
            <line className="tbar__horizon" x1={0} x2={fullWidth} y1={model.horizonY} y2={model.horizonY} />
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
                {t.label === null ? null : (
                  <text x={t.x} y={HEIGHT + 17} textAnchor="middle">
                    {t.label}
                  </text>
                )}
              </g>
            ))}
          </g>
          <line className="tbar__needle" x1={width / 2} x2={width / 2} y1={0} y2={HEIGHT + 8} />
        </svg>
      </div>
    </div>
  )
}
