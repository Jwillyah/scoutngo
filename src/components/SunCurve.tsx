import { lightGoneLine } from '../core/lightGone.ts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TILE_TIMEOUT_MS } from '../lib/offlineCache.ts'
import {
  altitudeRange,
  band,
  dayExtent,
  minutesApart,
  samplePath,
  SHOW_BOTH_MINUTES,
  sunCrossings,
  terrainHorizonCurve,
} from '../core/sunPath.ts'
import type { HorizonInput } from '../core/skyWindow.ts'
import { formatClock } from '../core/timezone.ts'

/*
 * THE DAY AS A CURVE. ALTITUDE ON THE Y AXIS.
 *
 * This is the same control as the gradient strip, at a higher resolution. The
 * strip answers WHEN; it cannot answer HOW HIGH, and how high is what decides
 * whether light rakes a face or flattens it.
 *
 * THE THUMB RIDES ON THE SUN CURVE. Not on a separate track underneath it:
 * dragging moves the point along the arc, so the gesture and the reading are
 * the same object. The range input is still there, stretched invisibly across
 * the chart, because it is what makes this work with a keyboard and a screen
 * reader; it is the hit target and the curve is the picture of it.
 *
 * A DARK INSTRUMENT, READ IN SUNLIGHT. Daytime is NOT drawn lighter than
 * night. Every band is dark; what changes between them is which dark. A chart
 * that went white at noon would be unreadable on the phone it is used on, and
 * would make the quiet half of the day look like the broken half.
 *
 * NO GRID, NO DOUBLE AXIS, THREE X LABELS. Everything this draws is either a
 * measurement or the edge of one.
 */

interface SunCurveProps {
  /** The window the scrubber already spans. The x axis is exactly this. */
  start: Date
  end: Date
  /** 0 at the start, 1 at the end. Shared with the strip: expanding never moves it. */
  value: number
  onChange: (next: number) => void
  at: Date
  venue: { lat: number; lon: number }
  /** The real skyline, or flat with a reason. Never silently mixed. */
  horizon: HorizonInput
  timeZone: string
  timeZoneAbbr: string
  /*
   * TURNING TERRAIN ON, FROM HERE.
   *
   * NO FEATURE MAY HIDE THE CONTROL IT DEPENDS ON. The curve needs the DEM,
   * the DEM arrives with the Terrain layer, and the message that said "no
   * elevation data here" pointed at a toggle in another section. This makes
   * the message the control. It does NOT flip it by itself: the tap is the
   * shooter's, because terrain costs frames on a phone and they turned it off
   * for a reason.
   */
  terrainOn: boolean
  onShowTerrain: (next: boolean) => void
}

/*
 * A FIXED VIEWBOX, STRETCHED. The chart has no square content in it -- no
 * circles that must stay round, no text inside the svg -- so letting the x
 * axis stretch to the container and keeping the y axis at a known height is
 * simpler and steadier than measuring the DOM on every render.
 */
const VB_W = 1000
const VB_H = 100

export function SunCurve({
  start,
  end,
  value,
  onChange,
  at,
  venue,
  horizon,
  timeZone,
  timeZoneAbbr,
  terrainOn,
  onShowTerrain,
}: SunCurveProps) {
  const clock = (date: Date) => formatClock(date, timeZone)

  /*
   * TERRAIN ON AND NOTHING ARRIVING IS AN ANSWER, NOT A WAIT.
   *
   * With terrain on and no signal, this said "waiting for the elevation data"
   * for as long as anyone looked. The elevation tiles get the same give-up as
   * every other tile (TILE_TIMEOUT_MS, src/lib/offlineCache.ts): past it, the
   * flat horizon stays, and the line says nothing came and why it might not.
   */
  const waitingFlat = terrainOn && horizon.kind === 'flat'
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    if (!waitingFlat) {
      const reset = setTimeout(() => setGaveUp(false), 0)
      return () => clearTimeout(reset)
    }
    const timer = setTimeout(() => setGaveUp(true), TILE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [waitingFlat, venue.lat, venue.lon])

  /*
   * THE WHOLE DAY IS SAMPLED, THE WINDOW IS DRAWN.
   *
   * Real sunrise and real sunset are crossings of the sun curve and the
   * skyline, and at a venue whose window is 11:00 to 15:00 neither crossing is
   * inside the window. Sampling the day means the times can still be stated
   * even when the crossing is off the left or right edge of the picture.
   */
  const dayPath = useMemo(
    () => samplePath(venue.lat, venue.lon, start),
    [venue.lat, venue.lon, start],
  )

  const terrain = useMemo(() => terrainHorizonCurve(horizon, dayPath), [horizon, dayPath])
  const crossings = useMemo(() => sunCrossings(dayPath, terrain), [dayPath, terrain])

  /*
   * THE AXIS IS THE DAY, THE SHOOT WINDOW IS A MARK ON IT.
   *
   * The first version used the shoot window as the extent, which for an 18:02
   * to 18:55 window drew 53 minutes of arc -- a segment with no shape in it.
   * The point of putting altitude on an axis is seeing the shape of the day,
   * and then seeing where the shoot sits in it.
   */
  const extent = useMemo(() => dayExtent(dayPath), [dayPath])
  const axisStart = extent?.start ?? start
  const axisEnd = extent?.end ?? end
  const span = axisEnd.getTime() - axisStart.getTime()

  const shown = useMemo(() => {
    if (span <= 0) return []
    return dayPath.filter((sample) => {
      const offset = sample.t.getTime() - axisStart.getTime()
      return offset >= -600_000 && offset <= span + 600_000
    })
  }, [dayPath, axisStart, span])

  const scrubbing = useRef(false)

  /*
   * A TAP OR A THUMB DRAG MAPS THE PIXEL TO THE SHOOT WINDOW, not to the
   * axis. The axis is the whole day; the shooter scrubs the window they
   * entered, which is the same 0..1 value the strip at PEEK uses. Outside the
   * window the value clamps, because there is no shoot there to scrub to.
   */
  const seekTo = useCallback(
    (clientX: number, plot: Element | null) => {
      const box = (plot ?? null)?.getBoundingClientRect()
      if (box === undefined || box === null || box.width <= 0) return
      const shootSpan = end.getTime() - start.getTime()
      if (shootSpan <= 0) return
      const axisSpanMs = axisEnd.getTime() - axisStart.getTime()
      if (axisSpanMs <= 0) return
      const share = (clientX - box.left) / box.width
      const atMs = axisStart.getTime() + share * axisSpanMs
      const next = (atMs - start.getTime()) / shootSpan
      onChange(Math.min(1, Math.max(0, next)))
    },
    [start, end, axisStart, axisEnd, onChange],
  )

  const range = useMemo(
    () => altitudeRange(shown, 3, terrain.kind === 'terrain' ? terrain.angles : []),
    [shown, terrain],
  )

  if (span <= 0 || shown.length < 2) {
    return <p className="curve__none">No window to draw.</p>
  }

  const x = (t: Date) => ((t.getTime() - axisStart.getTime()) / span) * VB_W
  const y = (altitude: number) =>
    VB_H - ((altitude - range.min) / (range.max - range.min)) * VB_H

  const line = (points: { t: Date; v: number }[]) =>
    points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')

  /*
   * BANDS AS CONTIGUOUS RUNS, HARD EDGED. One rect per run rather than one per
   * sample: a gradient between them would suggest the boundary is soft, and it
   * is not -- it is a stated altitude with a time attached to it.
   */
  const runs: { band: ReturnType<typeof band>; from: number; to: number }[] = []
  for (const sample of shown) {
    const b = band(sample.sunAltitude)
    const last = runs.at(-1)
    const px = Math.max(0, Math.min(VB_W, x(sample.t)))
    if (last !== undefined && last.band === b) last.to = px
    else runs.push({ band: b, from: last?.to ?? 0, to: px })
  }

  const sunLine = line(shown.map((s) => ({ t: s.t, v: s.sunAltitude })))
  const moonLine = line(shown.map((s) => ({ t: s.t, v: s.moonAltitude })))

  /*
   * THE MOON'S OPACITY IS ITS ILLUMINATED FRACTION, averaged across the window
   * because it moves by about a percent a day and a per-segment opacity would
   * be a gradient nobody can read. A new moon's line is nearly invisible,
   * which is correct: there is nearly nothing there.
   */
  const illumination =
    shown.reduce((acc, s) => acc + s.moonIllumination, 0) / Math.max(1, shown.length)

  /*
   * A FLOOR THAT IS ACTUALLY VISIBLE. It was 0.06, which renders as nothing,
   * while the readout went on printing "moon 24 degrees" -- a readout and a
   * curve disagreeing about whether there is a moon. The illuminated fraction
   * still drives the weight, so a new moon is faint; it is no longer absent.
   */
  const moonOpacity = Math.max(0.3, illumination)

  const terrainLine =
    terrain.kind === 'terrain'
      ? line(
          shown.map((s, i) => ({
            t: s.t,
            /* dayPath and shown share an origin, so find the matching angle. */
            v: terrain.angles[dayPath.indexOf(s)] ?? terrain.angles[i] ?? 0,
          })),
        )
      : null

  /* Where the thumb sits: on the curve, at the scrubbed time. */
  const current = shown.reduce((best, s) =>
    Math.abs(s.t.getTime() - at.getTime()) < Math.abs(best.t.getTime() - at.getTime()) ? s : best,
  )
  const thumbX = x(at)
  const thumbY = y(current.sunAltitude)

  const riseGap = minutesApart(crossings.terrainRise, crossings.flatRise)
  const setGap = minutesApart(crossings.terrainSet, crossings.flatSet)
  const showBoth =
    terrain.kind === 'terrain' &&
    ((riseGap !== null && riseGap >= SHOW_BOTH_MINUTES) ||
      (setGap !== null && setGap >= SHOW_BOTH_MINUTES))

  /*
   * THE FLAT LINE IS THE FALLBACK, AND IT IS ALSO THE COMPARISON.
   *
   * Drawn when there is no DEM, because then it is all there is; and drawn
   * when there IS a DEM and the two disagree by more than SHOW_BOTH_MINUTES,
   * because that gap is the entire reason this chart beats an almanac. It is
   * dotted and faint in both cases, and the terrain hairline is solid, so the
   * two are never mistaken for each other.
   */
  const drawFlat = terrain.kind === 'flat' || showBoth

  /* Three at most: the two ends and the middle. */
  const xLabels = [axisStart, new Date(axisStart.getTime() + span / 2), axisEnd]

  return (
    <div className="curve">
      <svg
        className="curve__plot"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        onClick={(event) => seekTo(event.clientX, event.currentTarget)}
      >
        {runs.map((run) => (
          <rect
            key={`${run.band}-${run.from}`}
            className={`curve__band curve__band--${run.band}`}
            x={run.from}
            y={0}
            width={Math.max(0, run.to - run.from)}
            height={VB_H}
          />
        ))}

        {/*
          * THE SHOOT WINDOW, MARKED ON THE DAY. Drawn under the curves and
          * over the bands: it is not a measurement, it is where the shooter
          * said they would be standing.
          */}
        {span <= 0 ? null : (
          <rect
            className="curve__shoot"
            x={Math.max(0, x(start))}
            y={0}
            width={Math.max(0, Math.min(VB_W, x(end)) - Math.max(0, x(start)))}
            height={VB_H}
          />
        )}

        {!drawFlat ? null : (
          <line
            className="curve__flat"
            x1={0}
            x2={VB_W}
            y1={y(0)}
            y2={y(0)}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {terrainLine === null ? null : (
          <polyline
            className="curve__terrain"
            points={terrainLine}
            vectorEffect="non-scaling-stroke"
          />
        )}

        <polyline
          className="curve__moon"
          points={moonLine}
          style={{ opacity: moonOpacity }}
          vectorEffect="non-scaling-stroke"
        />

        <polyline className="curve__sun" points={sunLine} vectorEffect="non-scaling-stroke" />

        {/* The thumb, on the arc. */}
        <line
          className="curve__stem"
          x1={thumbX}
          x2={thumbX}
          y1={thumbY}
          y2={VB_H}
          vectorEffect="non-scaling-stroke"
        />
        <circle className="curve__thumb" cx={thumbX} cy={thumbY} r={4} />
      </svg>

      {/*
        * THE THUMB IS THE ONLY THING HERE THAT CLAIMS A DRAG.
        *
        * Only the sheet's handle and the time bar's date row move the sheet
        * now (BottomSheet.tsx), so nothing here can take the sheet's drag;
        * data-scrub stays as the thumb's name for the audits. The version
        * before put a
        * full-width range input across the plot, which swallowed every
        * gesture and left the sheet unmovable with no controls on screen.
        *
        * It is a plain div rather than part of the svg so it can carry a
        * finger-sized hit area without changing what is drawn.
        */}
      <div
        className="curve__grip"
        data-scrub="thumb"
        style={{ left: `${(thumbX / VB_W) * 100}%`, top: `${(thumbY / VB_H) * 100}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Time through the shoot window"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={`${clock(at)} ${timeZoneAbbr}, sun ${current.sunAltitude.toFixed(1)} degrees up`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          scrubbing.current = true
        }}
        onPointerMove={(event) => {
          if (!scrubbing.current) return
          seekTo(event.clientX, event.currentTarget.parentElement)
        }}
        onPointerUp={() => {
          scrubbing.current = false
        }}
        onPointerCancel={() => {
          scrubbing.current = false
        }}
        onKeyDown={(event) => {
          const step = event.key === 'ArrowLeft' ? -0.02 : event.key === 'ArrowRight' ? 0.02 : 0
          if (step === 0) return
          event.preventDefault()
          onChange(Math.min(1, Math.max(0, value + step)))
        }}
      />

            <p className="curve__x" aria-hidden="true">
        {xLabels.map((label) => (
          <span className="curve__x-label num" key={label.toISOString()}>
            {clock(label)}
          </span>
        ))}
      </p>

      {/* One readout. Moon only when there is a moon to read. */}
      <p className="curve__readout">
        <span className="curve__read num">{clock(at)}</span>
        <span className="curve__read-zone">{timeZoneAbbr}</span>
        <span className="curve__read num">{current.sunAltitude.toFixed(1)}° up</span>
        <span className="curve__read num">{current.sunAzimuth.toFixed(0)}°</span>
        {current.moonAltitude <= 0 ? null : (
          <span className="curve__read curve__read--moon num">
            moon {current.moonAltitude.toFixed(0)}°
          </span>
        )}
      </p>

      {/*
        * THE GAP BETWEEN THE REAL SKYLINE AND THE ALMANAC, which is the one
        * number that says why this is not just a table lookup.
        */}
      {terrain.kind === 'flat' ? (
        /*
         * THE MESSAGE IS THE CONTROL. It names what is missing and fixes it
         * in one tap, from the screen that needs it, rather than pointing at
         * a toggle in a section this chart used to be covering.
         */
        <button
          type="button"
          className="curve__fix"
          onClick={() => onShowTerrain(true)}
          disabled={terrainOn}
        >
          <span className="curve__fix-why">{terrain.reason}</span>
          <span className="curve__fix-do">
            {!terrainOn
              ? 'Turn terrain on'
              : gaveUp
                ? 'Terrain is on, but no elevation arrived. With no signal it only exists where the venue was saved.'
                : 'Terrain is on — waiting for the elevation data'}
          </span>
        </button>
      ) : showBoth ? (
        <p className="curve__note curve__note--both">
          {crossings.terrainRise === null || crossings.flatRise === null ? null : (
            <span className="curve__gap">
              Sunrise <span className="num">{clock(crossings.terrainRise)}</span> over the ridge,{' '}
              <span className="num">{clock(crossings.flatRise)}</span> flat
            </span>
          )}
          {crossings.terrainSet === null || crossings.flatSet === null ? null : (
            /* THE RIDGE GAP, said as what it costs. See src/core/lightGone.ts. */
            <span className="curve__gap num">{lightGoneLine(crossings.terrainSet, crossings.flatSet, clock)}</span>
          )}
        </p>
      ) : (
        <p className="curve__note">Horizon from the elevation data at this venue.</p>
      )}
    </div>
  )
}
