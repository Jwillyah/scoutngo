import { useMemo } from 'react'
import {
  altitudeRange,
  band,
  minutesApart,
  samplePath,
  SHOW_BOTH_MINUTES,
  sunCrossings,
  terrainHorizonCurve,
  type PathSample,
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
}: SunCurveProps) {
  const clock = (date: Date) => formatClock(date, timeZone)

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

  const span = end.getTime() - start.getTime()

  /* Only the samples inside the window are drawn, plus one either side so the
   * curve runs to the edges instead of stopping short of them. */
  const shown = useMemo(() => {
    if (span <= 0) return []
    const inside: PathSample[] = []
    for (let i = 0; i < dayPath.length; i += 1) {
      const sample = dayPath[i]
      if (sample === undefined) continue
      const offset = sample.t.getTime() - start.getTime()
      if (offset >= -600_000 && offset <= span + 600_000) inside.push(sample)
    }
    return inside
  }, [dayPath, start, span])

  const range = useMemo(
    () => altitudeRange(shown, 3, terrain.kind === 'terrain' ? terrain.angles : []),
    [shown, terrain],
  )

  if (span <= 0 || shown.length < 2) {
    return <p className="curve__none">No window to draw.</p>
  }

  const x = (t: Date) => ((t.getTime() - start.getTime()) / span) * VB_W
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
  const xLabels = [start, new Date(start.getTime() + span / 2), end]

  return (
    <div className="curve">
      <svg
        className="curve__plot"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
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
          style={{ opacity: Math.max(0.06, illumination) }}
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
        * THE HIT TARGET, STRETCHED INVISIBLY OVER THE CHART. It is the same
        * input the strip uses, so the detents share one piece of state and
        * expanding the sheet cannot move the time.
        */}
      <input
        className="curve__range"
        type="range"
        min={0}
        max={1000}
        value={Math.round(value * 1000)}
        aria-label="Time through the window"
        aria-valuetext={`${clock(at)} ${timeZoneAbbr}, sun ${current.sunAltitude.toFixed(
          1,
        )} degrees up at ${current.sunAzimuth.toFixed(0)} degrees`}
        onChange={(event) => onChange(Number(event.target.value) / 1000)}
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
        <p className="curve__note">{terrain.reason}</p>
      ) : showBoth ? (
        <p className="curve__note curve__note--both">
          {crossings.terrainRise === null || crossings.flatRise === null ? null : (
            <span className="curve__gap">
              Sunrise <span className="num">{clock(crossings.terrainRise)}</span> over the ridge,{' '}
              <span className="num">{clock(crossings.flatRise)}</span> flat
            </span>
          )}
          {crossings.terrainSet === null || crossings.flatSet === null ? null : (
            <span className="curve__gap">
              Sunset <span className="num">{clock(crossings.terrainSet)}</span> over the ridge,{' '}
              <span className="num">{clock(crossings.flatSet)}</span> flat
            </span>
          )}
        </p>
      ) : (
        <p className="curve__note">Horizon from the elevation data at this venue.</p>
      )}
    </div>
  )
}
