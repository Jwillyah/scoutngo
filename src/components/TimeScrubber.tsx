import type { SunPosition } from '../core/sun.ts'

/** Must match --scrub-height in tokens.css. The sheet sizes itself against it. */
export const SCRUB_HEIGHT = 62

interface TimeScrubberProps {
  start: Date
  end: Date
  /** 0 at the start of the window, 1 at the end. */
  value: number
  onChange: (next: number) => void
  at: Date
  sun: SunPosition
}

const clock = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * Scrubs through the entered window. Everything downstream, the sun rays and
 * every cone's lighting color, recomputes from the scrubbed time, which is what
 * makes a four hour window visibly flip from backlit to front-lit.
 */
export function TimeScrubber({ start, end, value, onChange, at, sun }: TimeScrubberProps) {
  return (
    <div className="scrub">
      <div className="scrub__readout">
        <span className="scrub__time num">{clock(at)}</span>
        <span className="scrub__stat">
          <span className="scrub__stat-label">Az</span>
          <span className="num">{sun.azimuth.toFixed(1)}°</span>
        </span>
        <span className="scrub__stat">
          <span className="scrub__stat-label">Alt</span>
          <span className="num">{sun.altitude.toFixed(1)}°</span>
        </span>
      </div>

      <input
        className="scrub__range"
        type="range"
        min={0}
        max={1000}
        value={Math.round(value * 1000)}
        aria-label="Time through the window"
        aria-valuetext={`${clock(at)}, sun at ${sun.azimuth.toFixed(1)} degrees`}
        onChange={(event) => onChange(Number(event.target.value) / 1000)}
      />

      <div className="scrub__ends">
        <span className="num">{clock(start)}</span>
        <span className="num">{clock(end)}</span>
      </div>
    </div>
  )
}
