import type { SunPosition } from '../core/sun.ts'
import { positionInWindow, type TideExtreme } from '../core/tide.ts'
import { formatClock } from '../core/timezone.ts'

interface TimeScrubberProps {
  start: Date
  end: Date
  /** 0 at the start of the window, 1 at the end. */
  value: number
  onChange: (next: number) => void
  at: Date
  sun: SunPosition
  /** The venue's IANA zone. Every time on this bar is a venue wall clock. */
  timeZone: string
  /** Short form of that zone, "EDT", shown beside the time so it is never a guess. */
  timeZoneAbbr: string
  /**
   * High and low water falling inside the window. Marked on the track so a
   * window that straddles a turn is visible at a glance rather than only after
   * opening the Conditions tab.
   */
  tideExtremes: TideExtreme[]
}

/**
 * Scrubs through the entered window. Everything downstream, the sun rays and
 * every cone's lighting color, recomputes from the scrubbed time, which is what
 * makes a four hour window visibly flip from backlit to front-lit.
 */
export function TimeScrubber({
  start,
  end,
  value,
  onChange,
  at,
  sun,
  timeZone,
  timeZoneAbbr,
  tideExtremes,
}: TimeScrubberProps) {
  const clock = (date: Date) => formatClock(date, timeZone)

  /* Only the turns that actually fall on the track can be drawn on it. */
  const marks = tideExtremes
    .map((e) => ({ extreme: e, share: positionInWindow(e.at, start, end) }))
    .filter((m): m is { extreme: TideExtreme; share: number } => m.share !== null)

  return (
    <div className="scrub">
      <div className="scrub__readout">
        <span className="scrub__time num">{clock(at)}</span>
        <span className="scrub__zone">{timeZoneAbbr}</span>
        <span className="scrub__stat">
          <span className="scrub__stat-label">Az</span>
          <span className="num">{sun.azimuth.toFixed(1)}°</span>
        </span>
        <span className="scrub__stat">
          <span className="scrub__stat-label">Alt</span>
          <span className="num">{sun.altitude.toFixed(1)}°</span>
        </span>
      </div>

      {marks.length === 0 ? null : (
        <div className="scrub__tide" aria-hidden="true">
          {marks.map(({ extreme, share }) => (
            <span
              key={extreme.at.toISOString()}
              className={`scrub__turn scrub__turn--${extreme.kind}`}
              style={{ left: `${share * 100}%` }}
            >
              <span className="scrub__turn-tag">{extreme.kind === 'high' ? 'HW' : 'LW'}</span>
            </span>
          ))}
        </div>
      )}

      <input
        className="scrub__range"
        type="range"
        min={0}
        max={1000}
        value={Math.round(value * 1000)}
        aria-label="Time through the window"
        aria-valuetext={[
          `${clock(at)} ${timeZoneAbbr}`,
          `sun at ${sun.azimuth.toFixed(1)} degrees`,
          ...marks.map((m) => `${m.extreme.kind} water at ${clock(m.extreme.at)}`),
        ].join(', ')}
        onChange={(event) => onChange(Number(event.target.value) / 1000)}
      />

      {/*
        * NO END LABELS. They printed the window's start and end directly under
        * the peek summary, which states the same window WITH its timezone. Two
        * bars apart, the same two numbers, and the zone only on one of them.
        * The scrubber owns the moment; the summary owns the window.
        */}
    </div>
  )
}
