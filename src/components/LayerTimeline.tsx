import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  atFraction,
  barTicks,
  dayExtremes,
  fractionOf,
  HOUR_MS,
  KT_PER_MPS,
  nightSpans,
  percentBand,
  tidePlot,
  windArrows,
  windPlot,
  windLabels,
  type BarSpan,
  type WindHour,
} from '../core/layerTimeline.ts'
import { formatDayHour, formatHour, formatShortClock } from '../core/timezone.ts'
import type { TideExtreme, TideSample } from '../core/tide.ts'
import { windIn, windUnitLabel, type WindUnit } from '../lib/units.ts'
import { MODEL_CHIPS, type WindModelChip } from '../lib/useWindViewport.ts'
import '../styles/timeline.css'

/*
 * THE MAP'S ONE TIMELINE BAR (Batch DRONE, Section 3; boards
 * docs/mockups/Wind_Bar_7.png, Map_Timeline_Wind.png, Map_Timeline_Tide.png).
 *
 * Docked at the foot of the map, flat, for every layer: the row is play ·
 * the time · "now" · the layer chips; under it the day strip (Mon…Fri) with
 * hour ticks, dragged anywhere, a yellow flag on the thumb. The layer's own
 * picture sits in the strip: wind bars with gust caps and arrows, the tide
 * curve with the nights shaded, or a % band for the clouds. The thumb drives
 * the map's layer and the marker's readout through `onAt`.
 *
 * The arithmetic is in src/core/layerTimeline.ts; this draws.
 *
 * SCRUBBING AT 60 FPS. While a finger is on the strip the thumb and its flag
 * move by their transform on every frame, with no render; the plan hears a
 * new time only when the hour under the finger changes, at most once a
 * frame. `onHold` tells the map the drag began (and when it ended), so the
 * layer holds the frames it already has instead of asking again. Under
 * ?probe=1 or a dev build, `window.__scrub` counts the frames drawn during a
 * drag (scripts/measure-scrub-fps.mjs).
 */
export type TimelineLayer = 'wind' | 'clouds' | 'tide'
export type TimelinePick = TimelineLayer | 'radar' | 'off'

interface WindProps {
  /** The wind at the marker by the hour from the bar's start (index i = span.from + i h). */
  hours: readonly WindHour[]
  unit: WindUnit
  /** The chosen drone's rated wind, m/s, or null when none with a rating is chosen. */
  limitMps: number | null
  levelFt: 0 | 400
  onLevel: (ft: 0 | 400) => void
  model: WindModelChip
  onModel: (m: WindModelChip) => void
}

interface TideProps {
  curve: readonly TideSample[]
  extremes: readonly TideExtreme[]
  /** Why there is no curve, in words, when there is none. */
  problem: string | null
}

interface Props {
  layer: TimelineLayer
  span: BarSpan
  at: Date
  now: Date
  timeZone: string
  /** The spot, for the nights. */
  lat: number
  lon: number
  onAt: (t: Date) => void
  /** "now": the plan's own Back to now (the current minute, today made the shoot day if it is not); onAt(this minute) when not given. */
  onNow?: () => void
  /** The time a drag began (the layer holds its frames for it), and null when it ends. */
  onHold: (held: Date | null) => void
  onPick: (p: TimelinePick) => void
  wind?: WindProps
  tide?: TideProps
  /** Clouds: the cover at the marker by the hour, %. */
  percent?: readonly (number | null)[]
}

interface ScrubProbe {
  frames: number
  drags: number
  /** The longest gap between two frames during a drag, ms. */
  worstMs: number
}

const probing = (): boolean => {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return true
  try {
    return new URLSearchParams(window.location.search).get('probe') === '1'
  } catch {
    return false
  }
}

/** The strip's plot height, px (timeline.css .ltl__plot). */
const PLOT_PX = 40

const flagShift = (f: number) => `translateX(-${(Math.max(0, Math.min(1, f)) * 100).toFixed(1)}%)`

const LAYER_WORD: Record<TimelinePick, string> = { wind: 'Wind', clouds: 'Clouds', tide: 'Tide', radar: 'Radar', off: 'Off' }
/** The bar's chips (board Wind_Map): the three layers it is mostly read for; the tide and Layers off are under ⋯. */
const BAR_CHIPS = ['wind', 'radar', 'clouds'] as const

/*
 * THE BAR'S LAYER CHIPS (Batch SIMPLE-2, Section 5; board Wind_Map): Wind ·
 * Radar · Clouds as one segmented pill, the one on in white, and ⋯ for the
 * rest: the wind's height and model (with the wind on), the tide, and Layers
 * off. The same chips sit over the radar's legend when the radar is on, so
 * the bar is one bar whichever layer it shows (ux-rules 15).
 */
export function LayerChips({ layer, onPick, wind }: { layer: TimelinePick; onPick: (p: TimelinePick) => void; wind?: Pick<WindProps, 'levelFt' | 'onLevel' | 'model' | 'onModel'> }) {
  const [menu, setMenu] = useState(false)
  const modelLabel = MODEL_CHIPS.find((m) => m.id === wind?.model)?.label ?? 'Blend'
  return (
    <div className="ltl__chips" data-layer-chips={layer}>
      <div className="ltl__seg" role="radiogroup" aria-label="Layer">
        {BAR_CHIPS.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={p === layer} className={`ltl__chip${p === layer ? ' ltl__chip--on' : ''}`} data-layer-pick={p} onClick={() => (setMenu(false), p === layer ? undefined : onPick(p))}>
            {LAYER_WORD[p]}
          </button>
        ))}
      </div>
      <div className="ltl__menuwrap">
        <button type="button" className="ltl__more" data-layer-more data-level-chip={wind === undefined ? undefined : ''} aria-haspopup="menu" aria-expanded={menu} aria-label={wind === undefined ? 'More layers' : `More: height ${wind.levelFt === 0 ? 'surface' : '400 ft'}, model ${modelLabel}, other layers`} onClick={() => setMenu(!menu)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
        {menu ? (
          <div className="ltl__menu" role="menu" aria-label="More layers">
            {wind === undefined ? null : (
              <>
                <p className="ltl__menuhead">Height</p>
                {([0, 400] as const).map((ft) => (
                  <button key={ft} type="button" role="menuitemradio" aria-checked={wind.levelFt === ft} data-level-pick={ft} className={`ltl__item${wind.levelFt === ft ? ' ltl__item--on' : ''}`} onClick={() => (setMenu(false), wind.onLevel(ft))}>
                    {ft === 0 ? 'Surface' : '400 ft'}
                  </button>
                ))}
                <p className="ltl__menuhead">Model</p>
                {(['blend', 'hrrr', 'ecmwf'] as const).map((id) => (
                  <button key={id} type="button" role="menuitemradio" aria-checked={wind.model === id} data-model-pick={id} className={`ltl__item${wind.model === id ? ' ltl__item--on' : ''}`} onClick={() => (setMenu(false), wind.onModel(id))}>
                    {MODEL_CHIPS.find((m) => m.id === id)?.label ?? id}
                  </button>
                ))}
                <p className="ltl__menuhead">Layers</p>
              </>
            )}
            <button type="button" role="menuitemradio" aria-checked={layer === 'tide'} className={`ltl__item${layer === 'tide' ? ' ltl__item--on' : ''}`} data-layer-pick="tide" onClick={() => (setMenu(false), onPick('tide'))}>
              Tide
            </button>
            <button type="button" role="menuitem" className="ltl__item" data-layer-pick="off" data-wind-off="" onClick={() => (setMenu(false), onPick('off'))}>
              Layers off
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function LayerTimeline({ layer, span, at, now, timeZone, lat, lon, onAt, onNow, onHold, onPick, wind, tide, percent }: Props) {
  const [play, setPlay] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)
  const flag = useRef<HTMLSpanElement>(null)
  const atRef = useRef(at)
  const dragging = useRef(false)

  /* The thumb follows the plan's time whenever no finger is on it (a jump, play, the plan's own reset). */
  const frac = fractionOf(at, span)
  useEffect(() => {
    atRef.current = at
    if (!dragging.current) {
      moveThumb(frac)
      if (flag.current !== null) flag.current.textContent = formatHour(at, timeZone)
    }
  }, [at, frac, timeZone])

  useEffect(() => {
    if (!play) return
    const t = setInterval(() => {
      const next = new Date(atRef.current.getTime() + HOUR_MS)
      onAt(next.getTime() >= span.from.getTime() + span.hours * HOUR_MS ? span.from : next)
    }, 450)
    return () => clearInterval(t)
  }, [play, span, onAt])

  function moveThumb(f: number) {
    const x = `${(f * 100).toFixed(3)}%`
    if (thumb.current !== null) thumb.current.style.left = x
    if (flag.current !== null) {
      flag.current.style.left = x
      /* Centred on the thumb, slid inward at the ends so it never leaves the bar. */
      flag.current.style.transform = flagShift(f)
    }
  }

  /* The drag: the thumb on every frame, the plan on each new hour. */
  const pending = useRef<{ f: number; raf: number; last: number; hour: number }>({ f: 0, raf: 0, last: 0, hour: -1 })
  const frame = (ts: number) => {
    const p = pending.current
    p.raf = 0
    moveThumb(p.f)
    const t = atFraction(span, p.f)
    const h = t.getTime()
    if (h !== p.hour) {
      p.hour = h
      if (flag.current !== null) flag.current.textContent = formatHour(t, timeZone)
      onAt(t)
    }
    if (probing()) {
      const w = window as unknown as { __scrub?: ScrubProbe; __scrubFrames?: number }
      const s = (w.__scrub ??= { frames: 0, drags: 0, worstMs: 0 })
      s.frames += 1
      w.__scrubFrames = s.frames
      if (p.last > 0) s.worstMs = Math.max(s.worstMs, ts - p.last)
      performance.mark('scrub-frame')
    }
    p.last = ts
    /* Drawn every frame while the finger is down, so the measure counts what the screen can do. */
    if (dragging.current) p.raf = requestAnimationFrame(frame)
  }
  const pointAt = (clientX: number) => {
    const el = track.current
    if (el === null) return 0
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)))
  }

  const isNow = Math.abs(at.getTime() - now.getTime()) < HOUR_MS / 2
  const modelLabel = MODEL_CHIPS.find((m) => m.id === wind?.model)?.label ?? 'Blend'
  /* Batch SIMPLE-2, Section 5 (board Wind_Map): the row is play · the time · now · Wind Radar Clouds · ⋯. */

  return (
    <div className={`ltl ltl--${layer}`} data-layer-timeline={layer} data-wind-timebar={layer === 'wind' ? '' : undefined} data-model={wind === undefined ? undefined : modelLabel}>
      <div className="ltl__row">
        <button type="button" className="ltl__play" aria-label={play ? 'Pause' : `Play the ${LAYER_WORD[layer].toLowerCase()}`} aria-pressed={play} onClick={() => setPlay(!play)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{play ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5v14l11-7z" />}</svg>
        </button>
        {/* Batch SIMPLE-2, Section 5: the time with "now" under it, so the row keeps one line beside the three chips; away from now the pair is the way back to it. */}
        {isNow ? (
          <div className="ltl__when">
            <span className="ltl__time" data-wind-when={layer === 'wind' ? '' : undefined}>
              {formatDayHour(at, timeZone)}
            </span>
            <span className="ltl__now">now</span>
          </div>
        ) : (
          <button type="button" className="ltl__when ltl__when--go" onClick={() => (setPlay(false), onNow === undefined ? onAt(new Date()) : onNow())} aria-label="Back to now">
            <span className="ltl__time" data-wind-when={layer === 'wind' ? '' : undefined}>
              {formatDayHour(at, timeZone)}
            </span>
            <span className="ltl__now ltl__now--go">now ↺</span>
          </button>
        )}
        <LayerChips layer={layer} onPick={(p) => (setPlay(false), onPick(p))} wind={wind} />
      </div>

      <div
        ref={track}
        className="ltl__track"
        data-timeline-track
        role="slider"
        aria-label="Time"
        aria-valuemin={0}
        aria-valuemax={span.hours - 1}
        aria-valuenow={Math.round(frac * span.hours)}
        aria-valuetext={formatDayHour(at, timeZone)}
        tabIndex={0}
        onPointerDown={(e) => {
          /* The sheet under it never takes this finger (ux-rules 8). */
          e.stopPropagation()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setPlay(false)
          dragging.current = true
          if (probing()) {
            const w = window as unknown as { __scrub?: ScrubProbe }
            const s = (w.__scrub ??= { frames: 0, drags: 0, worstMs: 0 })
            s.drags += 1
          }
          onHold(atRef.current)
          const p = pending.current
          p.f = pointAt(e.clientX)
          p.hour = atRef.current.getTime()
          p.last = 0
          if (p.raf === 0) p.raf = requestAnimationFrame(frame)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          e.stopPropagation()
          pending.current.f = pointAt(e.clientX)
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return
          e.stopPropagation()
          dragging.current = false
          const p = pending.current
          p.f = pointAt(e.clientX)
          cancelAnimationFrame(p.raf)
          p.raf = 0
          frame(performance.now())
          /* The finger lifts: the thumb settles on the hour it chose. */
          moveThumb(fractionOf(atFraction(span, p.f), span))
          onHold(null)
        }}
        onPointerCancel={() => {
          dragging.current = false
          cancelAnimationFrame(pending.current.raf)
          pending.current.raf = 0
          onHold(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onAt(atFraction(span, fractionOf(new Date(at.getTime() + HOUR_MS), span) + 0.5 / span.hours))
          if (e.key === 'ArrowLeft') onAt(atFraction(span, fractionOf(new Date(at.getTime() - HOUR_MS), span) + 0.5 / span.hours))
        }}
      >
        <Plot layer={layer} span={span} timeZone={timeZone} lat={lat} lon={lon} wind={wind} tide={tide} percent={percent} />
        <div ref={thumb} className="ltl__thumb" data-timeline-thumb data-playing={play ? '1' : '0'} style={{ left: `${(frac * 100).toFixed(3)}%` }} />
        <span ref={flag} className="ltl__flag" data-time-flag style={{ left: `${(frac * 100).toFixed(3)}%`, transform: flagShift(frac) }}>
          {formatHour(at, timeZone)}
        </span>
      </div>
      <Foot layer={layer} at={at} timeZone={timeZone} wind={wind} tide={tide} />
    </div>
  )
}

/** The strip's picture: drawn again only when its data changes, never on a new hour under the thumb. */
const Plot = memo(function Plot({ layer, span, timeZone, lat, lon, wind, tide, percent }: { layer: TimelineLayer; span: BarSpan; timeZone: string; lat: number; lon: number; wind?: WindProps; tide?: TideProps; percent?: readonly (number | null)[] }) {
  const ticks = useMemo(() => barTicks(span, timeZone), [span, timeZone])
  const nights = useMemo(() => (layer === 'wind' ? [] : nightSpans(span, lat, lon)), [layer, span, lat, lon])
  const windHours = wind?.hours
  const limit = wind?.limitMps ?? null
  const plot = useMemo(() => (layer === 'wind' && windHours !== undefined ? windPlot(windHours, span, timeZone, limit) : null), [layer, windHours, span, timeZone, limit])
  const arrows = useMemo(() => (layer === 'wind' && windHours !== undefined ? windArrows(windHours, span, timeZone) : []), [layer, windHours, span, timeZone])
  const curve = tide?.curve
  const water = useMemo(() => (layer === 'tide' && curve !== undefined ? tidePlot(curve, span) : null), [layer, curve, span])
  const band = useMemo(() => (layer === 'clouds' && percent !== undefined ? percentBand(percent, span) : []), [layer, percent, span])
  const unit = wind?.unit ?? 'kt'
  const W = 1000
  const H = 100
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`
  const empty = layer === 'wind' ? (plot?.bars.length ?? 0) === 0 : layer === 'tide' ? (water?.points.length ?? 0) === 0 : band.length === 0
  /* The plot's width on screen, for keeping the bar's words apart; 350 until it is measured (a 390 px phone's bar). */
  const plotBox = useRef<HTMLDivElement>(null)
  const [plotW, setPlotW] = useState(350)
  useEffect(() => {
    const el = plotBox.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setPlotW(Math.round(el.getBoundingClientRect().width) || 350))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const limitText = limit === null ? null : `drone limit ${Math.round(windIn(limit, unit) ?? 0)}`
  const labels = useMemo(() => (plot === null ? null : windLabels(plot, plotW, PLOT_PX, (kt) => String(Math.round(windIn(kt / KT_PER_MPS, unit) ?? 0)), limitText)), [plot, plotW, limitText, unit])
  return (
    <div className="ltl__plotwrap">
      {layer === 'wind' ? (
        <div className="ltl__arrows" aria-hidden="true" data-wind-arrows={arrows.length}>
          {arrows.map((a) => (
            <span key={a.x} className="ltl__arrow" style={{ left: pct(a.x), transform: `translateX(-50%) rotate(${a.toDeg.toFixed(0)}deg)` }}>
              <svg viewBox="0 0 12 12">
                <path d="M6 11V1.5M2.5 5L6 1.5L9.5 5" />
              </svg>
            </span>
          ))}
        </div>
      ) : null}
      <div ref={plotBox} className="ltl__plot">
        <svg className="ltl__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {nights.map((n) => (
            <rect key={n.x0} className="ltl__night" x={n.x0 * W} y={0} width={(n.x1 - n.x0) * W} height={H} />
          ))}
          {plot?.bars.map((b) => (
            <rect key={b.x} className={`ltl__bar ltl__bar--b${b.band}`} x={b.x * W + 0.9} y={H - b.h * H} width={Math.max(1, b.w * W - 1.8)} height={b.h * H} />
          ))}
          {plot?.bars.map((b) => (b.gustH === null ? null : <rect key={`g${b.x}`} className="ltl__cap" x={b.x * W + 0.9} y={H - b.gustH * H - 2} width={Math.max(1, b.w * W - 1.8)} height={3} />))}
          {plot?.limitH == null ? null : <line className="ltl__limit" x1={0} x2={W} y1={H - plot.limitH * H} y2={H - plot.limitH * H} vectorEffect="non-scaling-stroke" />}
          {water === null || water.points.length < 2 ? null : (
            <>
              <path className="ltl__water" d={`M${(water.points[0].x * W).toFixed(1)} ${H} ${water.points.map((q) => `L${(q.x * W).toFixed(1)} ${(H - 8 - q.y * (H - 16)).toFixed(1)}`).join(' ')} L${(water.points[water.points.length - 1].x * W).toFixed(1)} ${H}Z`} />
              <path className="ltl__waterline" vectorEffect="non-scaling-stroke" d={water.points.map((q, i) => `${i === 0 ? 'M' : 'L'}${(q.x * W).toFixed(1)} ${(H - 8 - q.y * (H - 16)).toFixed(1)}`).join(' ')} />
            </>
          )}
          {band.map((b) => (
            <rect key={b.x} className="ltl__pct" x={b.x * W + 0.5} y={H - b.h * H} width={Math.max(1, b.w * W - 1)} height={b.h * H} />
          ))}
        </svg>
        {/* Batch FIX 2.4: the limit at the bar's left end, and no peak under it (src/core/layerTimeline.ts windLabels). */}
        {labels === null
          ? null
          : labels.peaks.map((p) => (
              <span key={p.x} className="ltl__peak num" data-wind-peak style={{ left: pct(p.x), bottom: `${p.bottomPct.toFixed(0)}%` }}>
                {p.text}
              </span>
            ))}
        {labels?.limit == null ? null : (
          <span className="ltl__limitword num" data-drone-limit style={{ bottom: `${labels.limit.bottomPct.toFixed(0)}%` }}>
            {labels.limit.text}
          </span>
        )}
        {empty ? <span className="ltl__empty">{layer === 'tide' ? (tide?.problem ?? 'Reading the tide…') : layer === 'wind' ? 'Reading the wind…' : 'Reading the clouds…'}</span> : null}
      </div>
      <div className="ltl__ticks" aria-hidden="true">
        {ticks.hours.map((x) => (
          <span key={x} className="ltl__tick" style={{ left: pct(x) }} />
        ))}
        {ticks.days.map((d) => (
          <span key={d.x} className="ltl__tick ltl__tick--day" style={{ left: pct(d.x) }} />
        ))}
      </div>
      <div className="ltl__days" aria-hidden="true">
        {ticks.days.map((d) => (
          <span key={d.x} className="ltl__day" style={{ left: pct(d.mid) }}>
            {new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(d.at)}
          </span>
        ))}
      </div>
    </div>
  )
})

/** The line under the strip: the wind's key, the day's high and low water, or the clouds' key. */
function Foot({ layer, at, timeZone, wind, tide }: { layer: TimelineLayer; at: Date; timeZone: string; wind?: WindProps; tide?: TideProps }) {
  if (layer === 'wind') return <p className="ltl__foot" data-timeline-legend>arrows = where it blows · bars = wind{wind === undefined ? '' : ` (${windUnitLabel(wind.unit)})`} · caps = gusts</p>
  if (layer === 'clouds') return <p className="ltl__foot" data-timeline-legend>bars = cloud cover % · shaded = night</p>
  const d = tide === undefined ? { high: null, low: null } : dayExtremes(tide.extremes, at, timeZone)
  const parts = [d.high === null ? null : `High ${d.high.feet.toFixed(1)} ft ${formatShortClock(d.high.at, timeZone)}`, d.low === null ? null : `Low ${d.low.feet.toFixed(1)} ft ${formatShortClock(d.low.at, timeZone)}`, 'shaded = night'].filter((x) => x !== null)
  return (
    <p className="ltl__foot" data-timeline-legend data-tide-extremes>
      {parts.join(' · ')}
    </p>
  )
}
